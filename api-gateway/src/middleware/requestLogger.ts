import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Request logging middleware
 * Logs request method, path, status code, and response time
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Capture the original end function
  const originalEnd = res.end;

  // Override res.end to log after response is sent
  res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Log request details
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Call the original end function
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
}
