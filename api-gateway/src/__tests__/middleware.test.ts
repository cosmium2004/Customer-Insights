import { Request, Response, NextFunction } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate';
import {
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireSameOrganization,
} from '../middleware/authorize';
import {
  errorHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
} from '../middleware/errorHandler';
import { AuthService } from '../services/authService';
import { getDbConnection } from '../config/database';

// Mock dependencies
jest.mock('../config/database');
jest.mock('../services/authService');
jest.mock('../config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockDb: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {};
    mockNext = jest.fn();
    
    // Create a mock query builder that returns itself for chaining
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
    };
    
    mockDb = jest.fn(() => mockQueryBuilder);
    mockDb.where = mockQueryBuilder.where;
    mockDb.first = mockQueryBuilder.first;
    
    mockAuthService = {
      verifyToken: jest.fn(),
    };

    (getDbConnection as jest.Mock).mockReturnValue(mockDb);
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate user with valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        status: 'active',
      };

      const mockDecoded = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(mockDecoded);
      
      // Mock the database query chain
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser),
      };
      mockDb.mockReturnValue(mockQueryBuilder);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect(mockDb).toHaveBeenCalledWith('users');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'user-123' });
      expect(mockRequest.user).toEqual(mockDecoded);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject request with no authorization header', async () => {
      mockRequest.headers = {};

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No authorization token provided',
          statusCode: 401,
        })
      );
    });

    it('should reject request with invalid authorization format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid authorization format. Use: Bearer <token>',
          statusCode: 401,
        })
      );
    });

    it('should reject request with empty token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No token provided',
          statusCode: 401,
        })
      );
    });

    it('should reject request with invalid token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(null);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token',
          statusCode: 401,
        })
      );
    });

    it('should reject request when user not found in database', async () => {
      const mockDecoded = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(mockDecoded);
      
      // Mock the database query chain to return null
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockDb.mockReturnValue(mockQueryBuilder);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not found',
          statusCode: 401,
        })
      );
    });

    it('should reject request when user account is suspended', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        status: 'suspended',
      };

      const mockDecoded = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(mockDecoded);
      
      // Mock the database query chain
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser),
      };
      mockDb.mockReturnValue(mockQueryBuilder);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Account is not active',
          statusCode: 401,
        })
      );
    });

    it('should reject request when user account is deleted', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        status: 'deleted',
      };

      const mockDecoded = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(mockDecoded);
      
      // Mock the database query chain
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser),
      };
      mockDb.mockReturnValue(mockQueryBuilder);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Account is not active',
          statusCode: 401,
        })
      );
    });
  });

  describe('optionalAuthenticate', () => {
    it('should attach user when valid token provided', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        status: 'active',
      };

      const mockDecoded = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(mockDecoded);
      
      // Mock the database query chain
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser),
      };
      mockDb.mockReturnValue(mockQueryBuilder);

      await optionalAuthenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual(mockDecoded);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without user when no token provided', async () => {
      mockRequest.headers = {};

      await optionalAuthenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without user when invalid token provided', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      mockAuthService.verifyToken.mockReturnValue(null);

      await optionalAuthenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});

describe('Authorization Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {};
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        permissions: [],
        organizationId: 'org-123',
      };

      const middleware = requireRole('analyst');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access when user has higher role', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        permissions: [],
        organizationId: 'org-123',
      };

      const middleware = requireRole('viewer');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user has insufficient role', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'viewer',
        permissions: [],
        organizationId: 'org-123',
      };

      const middleware = requireRole('admin');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions. Required role: admin',
          statusCode: 403,
        })
      );
    });

    it('should deny access when user is not authenticated', () => {
      mockRequest.user = undefined;

      const middleware = requireRole('analyst');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          statusCode: 401,
        })
      );
    });
  });

  describe('requirePermission', () => {
    it('should allow access when user has required permission', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights', 'write:insights'],
        organizationId: 'org-123',
      };

      const middleware = requirePermission('read:insights');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user lacks required permission', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      const middleware = requirePermission('delete:insights');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions. Required permission: delete:insights',
          statusCode: 403,
        })
      );
    });

    it('should deny access when user is not authenticated', () => {
      mockRequest.user = undefined;

      const middleware = requirePermission('read:insights');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          statusCode: 401,
        })
      );
    });
  });

  describe('requireAnyPermission', () => {
    it('should allow access when user has one of required permissions', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      const middleware = requireAnyPermission(['read:insights', 'write:insights']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user has none of required permissions', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:customers'],
        organizationId: 'org-123',
      };

      const middleware = requireAnyPermission(['read:insights', 'write:insights']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions. Required one of: read:insights, write:insights',
          statusCode: 403,
        })
      );
    });
  });

  describe('requireAllPermissions', () => {
    it('should allow access when user has all required permissions', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights', 'write:insights', 'delete:insights'],
        organizationId: 'org-123',
      };

      const middleware = requireAllPermissions(['read:insights', 'write:insights']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user lacks one required permission', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: ['read:insights'],
        organizationId: 'org-123',
      };

      const middleware = requireAllPermissions(['read:insights', 'write:insights']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions. Required all of: read:insights, write:insights',
          statusCode: 403,
        })
      );
    });
  });

  describe('requireSameOrganization', () => {
    it('should allow access when user belongs to same organization', async () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: [],
        organizationId: 'org-123',
      };

      const getResourceOrgId = jest.fn().mockResolvedValue('org-123');
      const middleware = requireSameOrganization(getResourceOrgId);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(getResourceOrgId).toHaveBeenCalledWith(mockRequest);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user belongs to different organization', async () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: [],
        organizationId: 'org-123',
      };

      const getResourceOrgId = jest.fn().mockResolvedValue('org-456');
      const middleware = requireSameOrganization(getResourceOrgId);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Access denied. Resource belongs to a different organization',
          statusCode: 403,
        })
      );
    });

    it('should deny access when user is not authenticated', async () => {
      mockRequest.user = undefined;

      const getResourceOrgId = jest.fn().mockResolvedValue('org-123');
      const middleware = requireSameOrganization(getResourceOrgId);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          statusCode: 401,
        })
      );
    });
  });
});

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('errorHandler', () => {
    it('should format ValidationError correctly', () => {
      const error = new ValidationError('Validation failed', [
        { field: 'email', message: 'Invalid email format' },
      ]);

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: [{ field: 'email', message: 'Invalid email format' }],
      });
    });

    it('should format AuthenticationError correctly', () => {
      const error = new AuthenticationError('Invalid credentials');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid credentials',
      });
    });

    it('should format AuthorizationError correctly', () => {
      const error = new AuthorizationError('Insufficient permissions');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
      });
    });

    it('should format NotFoundError correctly', () => {
      const error = new NotFoundError('Resource not found');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Resource not found',
      });
    });

    it('should format RateLimitError correctly', () => {
      const error = new RateLimitError('Too many requests');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Too many requests',
      });
    });

    it('should format ServiceUnavailableError correctly', () => {
      const error = new ServiceUnavailableError('Service unavailable');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service unavailable',
      });
    });

    it('should handle CORS errors', () => {
      const error = new Error('Not allowed by CORS');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'CORS policy violation',
        message: 'Origin not allowed',
      });
    });

    it('should handle JWT errors', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token',
      });
    });

    it('should handle expired token errors', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Token expired',
      });
    });

    it('should handle unexpected errors with 500 status', () => {
      const error = new Error('Unexpected error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: undefined,
      });
    });

    it('should include error message in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Unexpected error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Unexpected error',
      });

      process.env.NODE_ENV = originalEnv;
    });
  });
});
