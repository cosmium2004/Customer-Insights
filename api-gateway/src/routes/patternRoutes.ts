/**
 * Pattern Detection Routes
 * 
 * Handles behavior pattern detection endpoints
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.9, 14.4
 */

import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { detectBehaviorPatterns } from '../services/patternDetectionService';
import { logger } from '../config/logger';
import redis from '../middleware/rateLimiter';

const router = Router();

/**
 * GET /api/patterns/:customerId
 * 
 * Detect behavior patterns for a specific customer
 * Requires authentication
 * Caches results for 10 minutes
 * 
 * Path parameters:
 * - customerId: string (UUID)
 * 
 * Responses:
 * - 200: Patterns detected successfully
 * - 400: Invalid customer ID format
 * - 401: Unauthorized
 * - 404: Customer not found
 * - 500: Internal server error
 * - 503: ML service unavailable
 */
router.get(
  '/:customerId',
  authenticate,
  [
    param('customerId')
      .isUUID()
      .withMessage('Customer ID must be a valid UUID'),
  ],
  async (req: Request, res: Response) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { customerId } = req.params;
      const user = (req as any).user;
      const organizationId = user.organizationId;

      // Generate cache key
      const cacheKey = `patterns:${organizationId}:${customerId}`;

      // Try to get from cache
      const cachedResult = await redis.get(cacheKey);

      if (cachedResult) {
        logger.info('Pattern detection cache hit', {
          customerId,
          organizationId,
          userId: user.userId,
        });

        return res.json({
          patterns: JSON.parse(cachedResult),
          cached: true,
        });
      }

      // Cache miss - detect patterns
      logger.info('Pattern detection cache miss - calling ML service', {
        customerId,
        organizationId,
        userId: user.userId,
      });

      const patterns = await detectBehaviorPatterns(customerId, organizationId);

      // Cache results for 10 minutes (600 seconds)
      await redis.setex(cacheKey, 600, JSON.stringify(patterns));

      logger.info('Pattern detection completed', {
        customerId,
        organizationId,
        patternCount: patterns.length,
        userId: user.userId,
      });

      res.json({
        patterns,
        cached: false,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('ML service unavailable')) {
          logger.error('ML service unavailable for pattern detection', {
            customerId: req.params.customerId,
            userId: (req as any).user?.userId,
          });

          return res.status(503).json({
            error: 'Service unavailable',
            message: 'ML service is temporarily unavailable',
          });
        }

        if (error.message.includes('Invalid pattern detection request')) {
          logger.warn('Invalid pattern detection request', {
            customerId: req.params.customerId,
            userId: (req as any).user?.userId,
          });

          return res.status(400).json({
            error: 'Invalid request',
            message: error.message,
          });
        }
      }

      logger.error('Pattern detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        customerId: req.params.customerId,
        userId: (req as any).user?.userId,
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to detect behavior patterns',
      });
    }
  }
);

export default router;
