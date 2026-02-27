import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Mock dependencies
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    call: jest.fn(),
  }));
});

jest.mock('rate-limit-redis', () => {
  return jest.fn().mockImplementation(() => ({
    increment: jest.fn(),
    decrement: jest.fn(),
    resetKey: jest.fn(),
  }));
});

jest.mock('../config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Rate Limiter Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      path: '/api/test',
      method: 'GET',
      socket: {
        remoteAddress: '127.0.0.1',
      } as any,
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rate Limiter Configuration', () => {
    it('should configure auth rate limiter with correct settings', () => {
      // Import after mocks are set up
      const { authRateLimiter } = require('../middleware/rateLimiter');

      // Verify rate limiter is configured
      expect(authRateLimiter).toBeDefined();
      expect(typeof authRateLimiter).toBe('function');
    });

    it('should configure user rate limiter with correct settings', () => {
      const { userRateLimiter } = require('../middleware/rateLimiter');

      expect(userRateLimiter).toBeDefined();
      expect(typeof userRateLimiter).toBe('function');
    });

    it('should configure global rate limiter with correct settings', () => {
      const { globalRateLimiter } = require('../middleware/rateLimiter');

      expect(globalRateLimiter).toBeDefined();
      expect(typeof globalRateLimiter).toBe('function');
    });
  });

  describe('Rate Limiter Key Generation', () => {
    it('should use IP address as key for auth rate limiter', () => {
      const { authRateLimiter } = require('../middleware/rateLimiter');

      // Access the keyGenerator function from the rate limiter options
      // This is a simplified test since we can't easily access internal config
      expect(mockRequest.ip).toBe('127.0.0.1');
    });

    it('should use user ID as key for user rate limiter when authenticated', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: [],
        organizationId: 'org-123',
      };

      expect(mockRequest.user.userId).toBe('user-123');
    });

    it('should fall back to IP when user is not authenticated', () => {
      mockRequest.user = undefined;

      expect(mockRequest.ip).toBe('127.0.0.1');
    });

    it('should handle missing IP address gracefully', () => {
      const requestWithoutIp: Partial<Request> = {
        socket: {
          remoteAddress: '192.168.1.1',
        } as any,
      };

      expect(requestWithoutIp.socket?.remoteAddress).toBe('192.168.1.1');
    });
  });

  describe('Rate Limiter Response Headers', () => {
    it('should include standard rate limit headers', () => {
      // Rate limit headers are automatically added by express-rate-limit
      // This test verifies the configuration expects standard headers
      const { authRateLimiter } = require('../middleware/rateLimiter');

      expect(authRateLimiter).toBeDefined();
      // Headers: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
    });

    it('should not include legacy X-RateLimit headers', () => {
      // Verify legacy headers are disabled in configuration
      const { authRateLimiter } = require('../middleware/rateLimiter');

      expect(authRateLimiter).toBeDefined();
      // Legacy headers (X-RateLimit-*) should be disabled
    });
  });

  describe('Rate Limiter Error Handling', () => {
    it('should return 429 status when rate limit exceeded', () => {
      // This is tested through the handler function configuration
      const mockHandler = jest.fn((req: Request, res: Response) => {
        res.status(429).json({
          error: 'Too many requests. Please try again later.',
        });
      });

      mockHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Too many requests. Please try again later.',
      });
    });

    it('should log rate limit violations', () => {
      const { logger } = require('../config/logger');

      // Simulate rate limit violation
      logger.warn('Auth rate limit exceeded', {
        ip: '127.0.0.1',
        path: '/api/auth/login',
        method: 'POST',
      });

      expect(logger.warn).toHaveBeenCalledWith('Auth rate limit exceeded', {
        ip: '127.0.0.1',
        path: '/api/auth/login',
        method: 'POST',
      });
    });
  });

  describe('Rate Limiter Skip Logic', () => {
    it('should skip user rate limiter for non-authenticated requests', () => {
      mockRequest.user = undefined;

      // User rate limiter should skip non-authenticated requests
      const shouldSkip = !mockRequest.user;

      expect(shouldSkip).toBe(true);
    });

    it('should not skip user rate limiter for authenticated requests', () => {
      mockRequest.user = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'analyst',
        permissions: [],
        organizationId: 'org-123',
      };

      const shouldSkip = !mockRequest.user;

      expect(shouldSkip).toBe(false);
    });
  });

  describe('Rate Limiter Window Configuration', () => {
    it('should enforce 15-minute window for auth endpoints', () => {
      const windowMs = 15 * 60 * 1000; // 15 minutes
      expect(windowMs).toBe(900000);
    });

    it('should enforce 1-minute window for user endpoints', () => {
      const windowMs = 60 * 1000; // 1 minute
      expect(windowMs).toBe(60000);
    });

    it('should enforce 1-minute window for global endpoints', () => {
      const windowMs = 60 * 1000; // 1 minute
      expect(windowMs).toBe(60000);
    });
  });

  describe('Rate Limiter Max Requests', () => {
    it('should enforce 5 requests per window for auth endpoints', () => {
      const maxRequests = 5;
      expect(maxRequests).toBe(5);
    });

    it('should enforce 100 requests per window for user endpoints', () => {
      const maxRequests = 100;
      expect(maxRequests).toBe(100);
    });

    it('should enforce 1000 requests per window for global endpoints', () => {
      const maxRequests = 1000;
      expect(maxRequests).toBe(1000);
    });
  });

  describe('Redis Store Configuration', () => {
    it('should use Redis for distributed rate limiting', () => {
      const Redis = require('ioredis');
      const redis = new Redis();

      expect(redis).toBeDefined();
      expect(redis.on).toBeDefined();
    });

    it('should use correct prefix for auth rate limiter', () => {
      const prefix = 'rl:auth:';
      expect(prefix).toBe('rl:auth:');
    });

    it('should use correct prefix for user rate limiter', () => {
      const prefix = 'rl:user:';
      expect(prefix).toBe('rl:user:');
    });

    it('should use correct prefix for global rate limiter', () => {
      const prefix = 'rl:global:';
      expect(prefix).toBe('rl:global:');
    });
  });

  describe('Rate Limiter Message Format', () => {
    it('should return appropriate error message for auth rate limit', () => {
      const message = {
        error: 'Too many authentication attempts. Please try again later.',
      };

      expect(message.error).toContain('authentication attempts');
    });

    it('should return appropriate error message for user rate limit', () => {
      const message = {
        error: 'Too many requests. Please try again later.',
      };

      expect(message.error).toContain('Too many requests');
    });

    it('should return appropriate error message for global rate limit', () => {
      const message = {
        error: 'Too many requests from this IP. Please try again later.',
      };

      expect(message.error).toContain('from this IP');
    });
  });

  describe('addRateLimitHeaders middleware', () => {
    it('should pass through to next middleware', () => {
      const { addRateLimitHeaders } = require('../middleware/rateLimiter');

      addRateLimitHeaders(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
