import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { AuthenticationError } from './errorHandler';
import { getDbConnection } from '../config/database';

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

/**
 * Authentication middleware for protected routes
 * Verifies JWT token from Authorization header and attaches user to request
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

    // Verify token
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
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions,
      organizationId: decoded.organizationId,
    };

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
