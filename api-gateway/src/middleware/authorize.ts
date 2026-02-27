import { Request, Response, NextFunction } from 'express';
import { AuthorizationError, AuthenticationError } from './errorHandler';

/**
 * Role hierarchy for authorization
 * Higher roles inherit permissions from lower roles
 */
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
};

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has required role
 * @param requiredRole - Minimum role required to access the route
 * @returns Express middleware function
 */
export function requireRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userRole = req.user.role;
      const userRoleLevel = ROLE_HIERARCHY[userRole] || 0;
      const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] || 0;

      // Check if user's role level meets or exceeds required level
      if (userRoleLevel < requiredRoleLevel) {
        throw new AuthorizationError(
          `Insufficient permissions. Required role: ${requiredRole}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has specific permission
 * @param requiredPermission - Permission required to access the route
 * @returns Express middleware function
 */
export function requirePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Check if user has the required permission
      if (!req.user.permissions.includes(requiredPermission)) {
        throw new AuthorizationError(
          `Insufficient permissions. Required permission: ${requiredPermission}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has any of the specified permissions
 * @param requiredPermissions - Array of permissions (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPermission(requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Check if user has any of the required permissions
      const hasPermission = requiredPermissions.some((permission) =>
        req.user!.permissions.includes(permission)
      );

      if (!hasPermission) {
        throw new AuthorizationError(
          `Insufficient permissions. Required one of: ${requiredPermissions.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has all of the specified permissions
 * @param requiredPermissions - Array of permissions (user needs all)
 * @returns Express middleware function
 */
export function requireAllPermissions(requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every((permission) =>
        req.user!.permissions.includes(permission)
      );

      if (!hasAllPermissions) {
        throw new AuthorizationError(
          `Insufficient permissions. Required all of: ${requiredPermissions.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authorization middleware
 * Checks if user can only access resources from their own organization
 * @param getResourceOrgId - Function to extract organization ID from request
 * @returns Express middleware function
 */
export function requireSameOrganization(
  getResourceOrgId: (req: Request) => string | Promise<string>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Get resource organization ID
      const resourceOrgId = await getResourceOrgId(req);

      // Check if user's organization matches resource organization
      if (req.user.organizationId !== resourceOrgId) {
        throw new AuthorizationError(
          'Access denied. Resource belongs to a different organization'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
