import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { logger } from '../config/logger';
import redis from '../middleware/rateLimiter';
import {
  getInsights,
  getSentimentTrends,
  getAggregatedMetrics,
  searchInteractions,
  getCustomerProfile,
  InsightFilters,
  Pagination,
} from '../services/queryService';

const router = Router();

/**
 * GET /api/insights
 * Get customer insights with filters and pagination
 * Requires authentication
 * Caches results for 5 minutes
 * 
 * Query parameters:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - channels: comma-separated list (optional)
 * - sentimentMin: number 0-1 (optional)
 * - sentimentMax: number 0-1 (optional)
 * - customerSegments: comma-separated list (optional)
 * - page: number (default: 1)
 * - pageSize: number (default: 50, max: 100)
 * - sortBy: field name (default: timestamp)
 * - sortOrder: asc|desc (default: desc)
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const organizationId = user.organizationId;

    // Parse filters from query parameters
    const filters: InsightFilters = {};

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
      if (isNaN(filters.startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
    }

    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
      if (isNaN(filters.endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
    }

    if (req.query.channels) {
      filters.channels = (req.query.channels as string).split(',').map(c => c.trim());
    }

    if (req.query.sentimentMin !== undefined && req.query.sentimentMax !== undefined) {
      const min = parseFloat(req.query.sentimentMin as string);
      const max = parseFloat(req.query.sentimentMax as string);
      
      if (isNaN(min) || isNaN(max) || min < 0 || min > 1 || max < 0 || max > 1) {
        return res.status(400).json({ error: 'Invalid sentiment range (must be 0-1)' });
      }
      
      filters.sentimentRange = [min, max];
    }

    if (req.query.customerSegments) {
      filters.customerSegments = (req.query.customerSegments as string)
        .split(',')
        .map(s => s.trim());
    }

    // Parse pagination parameters
    const pagination: Pagination = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: Math.min(100, parseInt(req.query.pageSize as string) || 50),
      sortBy: (req.query.sortBy as string) || 'timestamp',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    // Generate cache key based on organization and query parameters
    const cacheKey = `insights:${organizationId}:${JSON.stringify({ filters, pagination })}`;

    // Try to get from cache
    const cachedResult = await redis.get(cacheKey);

    if (cachedResult) {
      logger.info('Insights cache hit', {
        organizationId,
        filters,
        pagination,
      });

      return res.json({
        ...JSON.parse(cachedResult),
        cached: true,
      });
    }

    // Cache miss - query database
    logger.info('Insights cache miss - querying database', {
      organizationId,
      filters,
      pagination,
    });

    const result = await getInsights(organizationId, filters, pagination);

    // Cache results for 5 minutes (300 seconds)
    await redis.setex(cacheKey, 300, JSON.stringify(result));

    res.json({
      ...result,
      cached: false,
    });
  } catch (error) {
    logger.error('Error getting insights', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Failed to retrieve insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/insights/sentiment-trends
 * Get sentiment trend aggregations over time
 * Requires authentication
 * Caches results for 15 minutes
 * 
 * Query parameters:
 * - startDate: ISO date string (required)
 * - endDate: ISO date string (required)
 * - groupBy: hour|day|week|month (default: day)
 */
router.get('/sentiment-trends', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const organizationId = user.organizationId;

    // Validate required parameters
    if (!req.query.startDate || !req.query.endDate) {
      return res.status(400).json({
        error: 'Missing required parameters: startDate and endDate',
      });
    }

    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const groupBy = (req.query.groupBy as 'hour' | 'day' | 'week' | 'month') || 'day';

    if (!['hour', 'day', 'week', 'month'].includes(groupBy)) {
      return res.status(400).json({
        error: 'Invalid groupBy parameter (must be: hour, day, week, or month)',
      });
    }

    // Generate cache key
    const cacheKey = `sentiment-trends:${organizationId}:${startDate.toISOString()}:${endDate.toISOString()}:${groupBy}`;

    // Try to get from cache
    const cachedResult = await redis.get(cacheKey);

    if (cachedResult) {
      logger.info('Sentiment trends cache hit', {
        organizationId,
        startDate,
        endDate,
        groupBy,
      });

      return res.json({
        trends: JSON.parse(cachedResult),
        cached: true,
      });
    }

    // Cache miss - query database
    logger.info('Sentiment trends cache miss - querying database', {
      organizationId,
      startDate,
      endDate,
      groupBy,
    });

    const trends = await getSentimentTrends(organizationId, startDate, endDate, groupBy);

    // Cache results for 15 minutes (900 seconds)
    await redis.setex(cacheKey, 900, JSON.stringify(trends));

    res.json({
      trends,
      cached: false,
    });
  } catch (error) {
    logger.error('Error getting sentiment trends', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Failed to retrieve sentiment trends',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/insights/metrics
 * Get aggregated metrics for dashboard
 * Requires authentication
 * Caches results for 5 minutes
 * 
 * Query parameters:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - customerSegments: comma-separated list (optional)
 */
router.get('/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const organizationId = user.organizationId;

    // Parse filters from query parameters
    const filters: InsightFilters = {};

    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
      if (isNaN(filters.startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
    }

    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
      if (isNaN(filters.endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
    }

    if (req.query.customerSegments) {
      filters.customerSegments = (req.query.customerSegments as string)
        .split(',')
        .map(s => s.trim());
    }

    // Generate cache key
    const cacheKey = `metrics:${organizationId}:${JSON.stringify(filters)}`;

    // Try to get from cache
    const cachedResult = await redis.get(cacheKey);

    if (cachedResult) {
      logger.info('Metrics cache hit', {
        organizationId,
        filters,
      });

      return res.json({
        ...JSON.parse(cachedResult),
        cached: true,
      });
    }

    // Cache miss - query database
    logger.info('Metrics cache miss - querying database', {
      organizationId,
      filters,
    });

    const metrics = await getAggregatedMetrics(organizationId, filters);

    // Cache results for 5 minutes (300 seconds)
    await redis.setex(cacheKey, 300, JSON.stringify(metrics));

    res.json({
      ...metrics,
      cached: false,
    });
  } catch (error) {
    logger.error('Error getting metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/insights/customer/:customerId
 * Get customer profile with interaction history
 * Requires authentication
 * Caches results for 10 minutes (Requirement 14.4)
 */
router.get('/customer/:customerId', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const organizationId = user.organizationId;
    const { customerId } = req.params;

    // Validate customerId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(customerId)) {
      return res.status(400).json({ error: 'Invalid customer ID format' });
    }

    logger.info('Customer profile requested', {
      organizationId,
      customerId,
    });

    const profile = await getCustomerProfile(organizationId, customerId);

    if (!profile) {
      return res.status(404).json({
        error: 'Customer not found',
      });
    }

    res.json(profile);
  } catch (error) {
    logger.error('Error getting customer profile', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Failed to retrieve customer profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

/**
 * GET /api/interactions/search
 * Full-text search on interaction content
 * Uses PostgreSQL full-text search indexes
 * Requires authentication
 * 
 * Query parameters:
 * - q: search query string (required)
 * - page: number (default: 1)
 * - pageSize: number (default: 50, max: 100)
 */
router.get('/interactions/search', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const organizationId = user.organizationId;

    // Validate search query
    if (!req.query.q) {
      return res.status(400).json({
        error: 'Missing required parameter: q (search query)',
      });
    }

    const searchQuery = req.query.q as string;

    if (searchQuery.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query cannot be empty',
      });
    }

    // Parse pagination parameters
    const pagination: Pagination = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: Math.min(100, parseInt(req.query.pageSize as string) || 50),
    };

    logger.info('Full-text search requested', {
      organizationId,
      searchQuery,
      pagination,
    });

    const result = await searchInteractions(organizationId, searchQuery, pagination);

    res.json(result);
  } catch (error) {
    logger.error('Error searching interactions', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Failed to search interactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
