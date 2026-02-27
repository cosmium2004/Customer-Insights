import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { logger } from '../config/logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Log Redis connection status
redis.on('connect', () => {
  logger.info('Redis connected for rate limiting');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

/**
 * Rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - Type compatibility issue with ioredis
    sendCommand: (...args: any[]) => redis.call(...args),
    prefix: 'rl:auth:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Use IP address as key
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Log rate limit violations
  handler: (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    logger.warn('Auth rate limit exceeded', {
      ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      error: 'Too many authentication attempts. Please try again later.',
    });
  },
});

/**
 * Rate limiter for authenticated user endpoints
 * 100 requests per minute per user
 */
export const userRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - Type compatibility issue with ioredis
    sendCommand: (...args: any[]) => redis.call(...args),
    prefix: 'rl:user:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID if authenticated, otherwise IP
  keyGenerator: (req: Request) => {
    return req.user?.userId || req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Skip rate limiting for non-authenticated requests (they use global limiter)
  skip: (req: Request) => {
    return !req.user;
  },
  // Log rate limit violations
  handler: (req: Request, res: Response) => {
    const userId = req.user?.userId || 'unknown';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    logger.warn('User rate limit exceeded', {
      userId,
      ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      error: 'Too many requests. Please try again later.',
    });
  },
});

/**
 * Global rate limiter for all endpoints
 * 1000 requests per minute per IP
 */
export const globalRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - Type compatibility issue with ioredis
    sendCommand: (...args: any[]) => redis.call(...args),
    prefix: 'rl:global:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per window
  message: {
    error: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP address as key
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Log rate limit violations
  handler: (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    logger.warn('Global rate limit exceeded', {
      ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      error: 'Too many requests from this IP. Please try again later.',
    });
  },
});

/**
 * Custom rate limit headers middleware
 * Adds X-RateLimit-* headers to all responses
 */
export function addRateLimitHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Headers are automatically added by express-rate-limit
  // This middleware is for any custom header logic if needed
  next();
}

export default redis;
