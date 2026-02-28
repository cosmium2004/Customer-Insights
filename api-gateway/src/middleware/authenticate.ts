import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { AuthenticationError } from './errorHandler';
import { getDbConnection } from '../config/database';
import * as cacheService from '../services/cacheService';
import { logger } from '../config/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
        permissions: string[];
        organizationId: string;
      };
    }
  }
}

// Cache TTL for JWT token verification (1 hour)
const TOKEN_CACHE_TTL = 3600;

/**
 * Authentication middleware for protected routes
 * Verifies JWT token from Authorization header and attaches user to request
 * Caches verified tokens in Redis with 1-hour TTL (Requirement 14.1)
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('No authorization token provided');
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Invalid authorization format. Use: Bearer <token>');
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    // Generate cache key for token
    const cacheKey = `token:${token}`;

    // Try to get cached token verification result
    const cachedUser = await cacheService.get<any>(cacheKey);

    if (cachedUser) {
      logger.debug('Token verification cache hit', { userId: cachedUser.userId });
      req.user = cachedUser;
      return next();
    }

    // Cache miss - verify token
    const db = getDbConnection();
    const authService = new AuthService(db);
    const decoded = authService.verifyToken(token);

    if (!decoded) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Verify user still exists in database
    const user = await db('users')
      .where({ id: decoded.userId })
      .first();

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Check if user account is active
    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new AuthenticationError('Account is not active');
    }

    // Attach user to request object
    const userData = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions,
      organizationId: decoded.organizationId,
    };

    req.user = userData;

    // Cache the verified token result (1-hour TTL)
    await cacheService.set(cacheKey, userData, TOKEN_CACHE_TTL);
    logger.debug('Token verification cached', { userId: userData.userId });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
    } else {
      next(new AuthenticationError('Authentication failed'));
    }
  }
}

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't fail if missing
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      return next();
    }

    const db = getDbConnection();
    const authService = new AuthService(db);
    const decoded = authService.verifyToken(token);

    if (decoded) {
      const user = await db('users')
        .where({ id: decoded.userId })
        .first();

      if (user && user.status !== 'suspended' && user.status !== 'deleted') {
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          permissions: decoded.permissions,
          organizationId: decoded.organizationId,
        };
      }
    }

    next();
  } catch (error) {
    // Ignore errors in optional authentication
    next();
  }
}
