import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '../services/authService';
import { getDbConnection } from '../config/database';
import { authRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../config/logger';
import { ValidationError, AuthenticationError } from '../middleware/errorHandler';

const router = Router();

/**
 * Validate password strength
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const passwordValidation = (password: string): boolean => {
  if (password.length < 12) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
  return true;
};

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post(
  '/register',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .custom(passwordValidation)
      .withMessage(
        'Password must be at least 12 characters with mixed case, numbers, and symbols'
      ),
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required'),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required'),
    body('organizationId')
      .isUUID()
      .withMessage('Valid organization ID is required'),
    body('role')
      .optional()
      .isIn(['admin', 'analyst', 'viewer'])
      .withMessage('Role must be admin, analyst, or viewer'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { email, password, firstName, lastName, organizationId, role } = req.body;
      const db = getDbConnection();
      const authService = new AuthService(db);

      // Check if user already exists
      const existingUser = await db('users')
        .where({ email: email.toLowerCase() })
        .first();

      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Verify organization exists
      const organization = await db('organizations')
        .where({ id: organizationId })
        .first();

      if (!organization) {
        throw new ValidationError('Invalid organization ID');
      }

      // Hash password
      const passwordHash = await authService.hashPassword(password);

      // Create user
      const [user] = await db('users')
        .insert({
          email: email.toLowerCase(),
          password_hash: passwordHash,
          first_name: firstName,
          last_name: lastName,
          role: role || 'viewer',
          permissions: JSON.stringify([]),
          organization_id: organizationId,
        })
        .returning('*');

      // Generate tokens
      const tokens = authService.generateTokens(user);

      // Store refresh token
      await authService.storeRefreshToken(user.id, tokens.refreshToken);

      // Return response
      res.status(201).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          organizationId: user.organization_id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post(
  '/login',
  authRateLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { email, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const db = getDbConnection();
      const authService = new AuthService(db);

      // Fetch user from database
      const user = await db('users')
        .where({ email: email.toLowerCase() })
        .first();

      // Use constant-time comparison to prevent timing attacks
      if (!user) {
        // Perform dummy bcrypt comparison to prevent timing attacks
        await authService.comparePassword(
          password,
          '$2b$10$dummyhashtopreventtimingattacksxxxxxxxxxxxxxxxxxxxxxxxxxx'
        );
        
        // Log failed attempt
        logger.warn('Failed login attempt - user not found', {
          email,
          ip: clientIp,
          timestamp: new Date().toISOString(),
        });

        throw new AuthenticationError('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await authService.comparePassword(
        password,
        user.password_hash
      );

      if (!isPasswordValid) {
        // Log failed attempt
        logger.warn('Failed login attempt - invalid password', {
          userId: user.id,
          email,
          ip: clientIp,
          timestamp: new Date().toISOString(),
        });

        throw new AuthenticationError('Invalid credentials');
      }

      // Check if account is active
      if (user.status === 'suspended' || user.status === 'deleted') {
        logger.warn('Login attempt on inactive account', {
          userId: user.id,
          email,
          status: user.status,
          ip: clientIp,
          timestamp: new Date().toISOString(),
        });

        throw new AuthenticationError('Invalid credentials');
      }

      // Generate tokens
      const tokens = authService.generateTokens(user);

      // Update last login timestamp
      await db('users')
        .where({ id: user.id })
        .update({ last_login_at: new Date() });

      // Store refresh token
      await authService.storeRefreshToken(user.id, tokens.refreshToken);

      // Log successful login
      logger.info('Successful login', {
        userId: user.id,
        email,
        ip: clientIp,
        timestamp: new Date().toISOString(),
      });

      // Return response
      res.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          organizationId: user.organization_id,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { refreshToken } = req.body;
      const db = getDbConnection();
      const authService = new AuthService(db);

      // Validate refresh token from database
      const userId = await authService.validateRefreshToken(refreshToken);

      if (!userId) {
        throw new AuthenticationError('Invalid or expired refresh token');
      }

      // Fetch user
      const user = await db('users')
        .where({ id: userId })
        .first();

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Check if account is active
      if (user.status === 'suspended' || user.status === 'deleted') {
        throw new AuthenticationError('Account is not active');
      }

      // Generate new access token
      const accessToken = authService.generateAccessToken(user);

      // Return new access token
      res.json({
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout and revoke refresh token
 * Invalidates cached tokens in Redis (Requirement 14.2)
 */
router.post(
  '/logout',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { refreshToken } = req.body;
      const accessToken = req.headers.authorization?.replace('Bearer ', '');
      const db = getDbConnection();
      const authService = new AuthService(db);

      // Get user ID from refresh token before revoking
      const userId = await authService.validateRefreshToken(refreshToken);

      // Remove refresh token from database
      await authService.revokeRefreshToken(refreshToken);

      // Invalidate cached tokens in Redis
      if (accessToken) {
        const cacheService = await import('../services/cacheService');
        await cacheService.del(`token:${accessToken}`);
      }

      // Invalidate all user tokens if we have userId
      if (userId) {
        const cacheService = await import('../services/cacheService');
        await cacheService.invalidateUserTokens(userId);
      }

      logger.info('User logged out', {
        userId,
        timestamp: new Date().toISOString(),
      });

      res.json({
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
