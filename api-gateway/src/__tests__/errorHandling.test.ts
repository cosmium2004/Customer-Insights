/**
 * Error Handling Tests
 * 
 * Tests error middleware, circuit breaker, and retry logic
 * Validates: Requirements 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13
 */

import { Request, Response, NextFunction } from 'express';
import {
  errorHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  InsufficientStorageError,
} from '../middleware/errorHandler';
import { CircuitBreaker, CircuitState } from '../utils/circuitBreaker';

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('Operational Errors', () => {
    it('should return 400 for ValidationError', () => {
      const error = new ValidationError('Validation failed', [
        { field: 'email', message: 'Invalid email' },
      ]);

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: [{ field: 'email', message: 'Invalid email' }],
      });
    });

    it('should return 401 for AuthenticationError', () => {
      const error = new AuthenticationError('Invalid token');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid token',
      });
    });

    it('should return 403 for AuthorizationError', () => {
      const error = new AuthorizationError('Insufficient permissions');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
      });
    });

    it('should return 404 for NotFoundError', () => {
      const error = new NotFoundError('Resource not found');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Resource not found',
      });
    });

    it('should return 429 for RateLimitError', () => {
      const error = new RateLimitError('Too many requests');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many requests',
      });
    });

    it('should return 503 for ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError('Service unavailable');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Service unavailable',
      });
    });

    it('should return 507 for InsufficientStorageError', () => {
      const error = new InsufficientStorageError('Storage full');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(507);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Storage full',
      });
    });
  });

  describe('JWT Errors', () => {
    it('should return 401 for JsonWebTokenError', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid token',
      });
    });

    it('should return 401 for TokenExpiredError', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Token expired',
      });
    });
  });

  describe('CORS Errors', () => {
    it('should return 403 for CORS errors', () => {
      const error = new Error('Not allowed by CORS');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'CORS policy violation',
        message: 'Origin not allowed',
      });
    });
  });

  describe('Unexpected Errors', () => {
    it('should return 500 for unexpected errors', () => {
      const error = new Error('Unexpected error');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: undefined, // Not in production mode
      });
    });
  });
});

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      resetTimeout: 1000, // Short timeout for testing
      name: 'TestCircuit',
    });
  });

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after threshold failures', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Trigger failures
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject requests when circuit is OPEN', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      // Try to execute when circuit is open
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow(
        'Circuit breaker is OPEN'
      );
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Next request should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Execute successful requests to close circuit
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests with exponential backoff', async () => {
      let attemptCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('success');
      });

      const result = await circuitBreaker.executeWithRetry(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(circuitBreaker.executeWithRetry(fn, 3, 10)).rejects.toThrow(
        'Persistent failure'
      );

      expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should not retry when circuit is OPEN', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      // Try to execute with retry when circuit is open
      await expect(circuitBreaker.executeWithRetry(failingFn, 3, 10)).rejects.toThrow(
        'Circuit breaker is OPEN'
      );

      // Should not retry when circuit is open
      expect(failingFn).toHaveBeenCalledTimes(5); // Only the initial attempts
    });
  });

  describe('Circuit Breaker Statistics', () => {
    it('should return correct statistics', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Trigger some failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();

      expect(stats.name).toBe('TestCircuit');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(3);
    });

    it('should reset circuit breaker', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset circuit breaker
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });
});

describe('Error Response Formatting', () => {
  it('should format validation errors with details', () => {
    const error = new ValidationError('Validation failed', [
      { field: 'email', message: 'Invalid email format' },
      { field: 'password', message: 'Password too short' },
    ]);

    expect(error.statusCode).toBe(400);
    expect(error.errors).toHaveLength(2);
    expect(error.errors[0].field).toBe('email');
  });

  it('should include stack trace in error object', () => {
    const error = new AppError('Test error', 500);

    expect(error.stack).toBeDefined();
    expect(error.isOperational).toBe(true);
  });
});
