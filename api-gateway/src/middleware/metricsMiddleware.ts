/**
 * Metrics Middleware
 * 
 * Tracks HTTP request metrics for Prometheus
 * Validates: Requirements 11.1, 11.6, 11.7
 */

import { Request, Response, NextFunction } from 'express';
import {
  httpRequestDuration,
  httpRequestTotal,
  httpRequestRate,
  httpErrorRate,
} from '../config/metrics';

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Track request rate
  httpRequestRate.inc({
    method: req.method,
    route: req.route?.path || req.path,
  });

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: any[]): Response {
    const duration = Date.now() - start;
    const statusCode = res.statusCode.toString();
    const route = req.route?.path || req.path;

    // Track request duration
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      duration
    );

    // Track total requests
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    // Track errors (4xx and 5xx)
    if (res.statusCode >= 400) {
      httpErrorRate.inc({
        method: req.method,
        route,
        status_code: statusCode,
      });
    }

    // Call original end method
    return originalEnd.apply(this, args);
  };

  next();
}
