import { getDbConnection } from '../config/database';
import { logger } from '../config/logger';
import * as cacheService from './cacheService';

/**
 * Query Service
 * Provides optimized read access to customer insights data
 * with support for filtering, pagination, and sorting
 * Implements caching for frequently accessed data (Requirements 8.5, 14.3, 14.4, 14.5)
 */

// Cache TTLs (in seconds)
const DASHBOARD_CACHE_TTL = 300; // 5 minutes
const CUSTOMER_PROFILE_CACHE_TTL = 600; // 10 minutes
const SENTIMENT_TRENDS_CACHE_TTL = 900; // 15 minutes

export interface InsightFilters {
  startDate?: Date;
  endDate?: Date;
  channels?: string[];
  sentimentRange?: [number, number];
  customerSegments?: string[];
}

export interface Pagination {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface InsightResult {
  data: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get insights with filters and pagination
 * Uses parameterized queries to prevent SQL injection
 * Supports filtering by date range, channels, sentiment, and customer segments
 */
export async function getInsights(
  organizationId: string,
  filters: InsightFilters,
  pagination: Pagination
): Promise<InsightResult> {
  const startTime = Date.now();
  const db = getDbConnection();

  try {
    // Validate and sanitize pagination
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize)); // Max 100 per page
    const offset = (page - 1) * pageSize;
    const sortBy = sanitizeSortField(pagination.sortBy || 'timestamp');
    const sortOrder = pagination.sortOrder === 'asc' ? 'asc' : 'desc';

    // Build query with filters
    let query = db('customer_interactions as ci')
      .leftJoin('customers as c', 'ci.customer_id', 'c.id')
      .where('ci.organization_id', organizationId);

    // Apply date range filter
    if (filters.startDate) {
      query = query.where('ci.timestamp', '>=', filters.startDate);
    }
    if (filters.endDate) {
      query = query.where('ci.timestamp', '<=', filters.endDate);
    }

    // Apply channel filter
    if (filters.channels && filters.channels.length > 0) {
      query = query.whereIn('ci.channel', filters.channels);
    }

    // Apply sentiment range filter
    if (filters.sentimentRange) {
      const [minSentiment, maxSentiment] = filters.sentimentRange;
      query = query
        .whereNotNull('ci.sentiment_confidence')
        .whereBetween('ci.sentiment_confidence', [minSentiment, maxSentiment]);
    }

    // Apply customer segment filter
    if (filters.customerSegments && filters.customerSegments.length > 0) {
      query = query.whereIn('c.segment', filters.customerSegments);
    }

    // Get total count (before pagination)
    const countQuery = query.clone().count('* as count');
    const [{ count }] = await countQuery;
    const total = parseInt(count as string, 10);

    // Apply sorting and pagination
    const results = await query
      .select(
        'ci.id',
        'ci.customer_id',
        'ci.timestamp',
        'ci.channel',
        'ci.event_type',
        'ci.content',
        'ci.sentiment',
        'ci.sentiment_confidence',
        'ci.metadata',
        'ci.processed_at',
        'c.external_id as customer_external_id',
        'c.email as customer_email',
        'c.segment as customer_segment'
      )
      .orderBy(`ci.${sortBy}`, sortOrder)
      .limit(pageSize)
      .offset(offset);

    // Parse numeric fields that come back as strings from PostgreSQL
    const data = results.map((item: any) => ({
      ...item,
      sentiment_confidence: item.sentiment_confidence ? parseFloat(item.sentiment_confidence) : null,
    }));

    const totalPages = Math.ceil(total / pageSize);
    const queryTime = Date.now() - startTime;

    logger.info('Query executed successfully', {
      organizationId,
      filters,
      pagination,
      total,
      resultCount: data.length,
      queryTime,
    });

    // Log warning if query is slow
    if (queryTime > 500) {
      logger.warn('Slow query detected', {
        organizationId,
        queryTime,
        filters,
      });
    }

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    logger.error('Error executing query', {
      organizationId,
      filters,
      pagination,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get sentiment trends aggregated by time period
 * Supports grouping by hour, day, week, or month
 * Caches results with 15-minute TTL (Requirement 14.5)
 */
export async function getSentimentTrends(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
): Promise<any[]> {
  const db = getDbConnection();

  try {
    // Generate cache key
    const cacheKey = cacheService.generateCacheKey('trends', {
      organizationId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      groupBy,
    });

    // Try to get from cache
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      logger.debug('Sentiment trends cache hit', { organizationId, groupBy });
      return cached;
    }

    // Determine date truncation based on groupBy
    let dateTrunc: string;
    switch (groupBy) {
      case 'hour':
        dateTrunc = "date_trunc('hour', timestamp)";
        break;
      case 'week':
        dateTrunc = "date_trunc('week', timestamp)";
        break;
      case 'month':
        dateTrunc = "date_trunc('month', timestamp)";
        break;
      case 'day':
      default:
        dateTrunc = "date_trunc('day', timestamp)";
        break;
    }

    const results = await db('customer_interactions')
      .where('organization_id', organizationId)
      .whereBetween('timestamp', [startDate, endDate])
      .whereNotNull('sentiment')
      .select(
        db.raw(`${dateTrunc} as period`),
        db.raw("COUNT(*) as total_count"),
        db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'positive') as positive_count"),
        db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'negative') as negative_count"),
        db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'neutral') as neutral_count"),
        db.raw("AVG(sentiment_confidence) as avg_confidence")
      )
      .groupByRaw(dateTrunc)
      .orderBy('period', 'asc');

    // Cache the results (15-minute TTL)
    await cacheService.set(cacheKey, results, SENTIMENT_TRENDS_CACHE_TTL);

    logger.info('Sentiment trends retrieved', {
      organizationId,
      startDate,
      endDate,
      groupBy,
      resultCount: results.length,
    });

    return results;
  } catch (error) {
    logger.error('Error getting sentiment trends', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get aggregated metrics for dashboard
 * Returns total interactions, sentiment distribution, channel distribution, etc.
 * Caches results with 5-minute TTL (Requirement 14.3)
 */
export async function getAggregatedMetrics(
  organizationId: string,
  filters: InsightFilters
): Promise<any> {
  const db = getDbConnection();

  try {
    // Generate cache key
    const cacheKey = cacheService.generateCacheKey('dashboard:metrics', {
      organizationId,
      filters,
    });

    // Try to get from cache
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      logger.debug('Dashboard metrics cache hit', { organizationId });
      return cached;
    }

    let query = db('customer_interactions')
      .where('organization_id', organizationId);

    // Apply date range filter
    if (filters.startDate) {
      query = query.where('timestamp', '>=', filters.startDate);
    }
    if (filters.endDate) {
      query = query.where('timestamp', '<=', filters.endDate);
    }

    // Apply customer segment filter if provided
    if (filters.customerSegments && filters.customerSegments.length > 0) {
      query = query
        .leftJoin('customers', 'customer_interactions.customer_id', 'customers.id')
        .whereIn('customers.segment', filters.customerSegments);
    }

    // Get overall metrics
    const [metrics] = await query.clone().select(
      db.raw('COUNT(*) as total_interactions'),
      db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'positive') as positive_count"),
      db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'negative') as negative_count"),
      db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'neutral') as neutral_count"),
      db.raw('AVG(sentiment_confidence) as avg_sentiment_confidence'),
      db.raw('COUNT(DISTINCT customer_id) as unique_customers')
    );

    // Get channel distribution
    const channelDistribution = await query.clone()
      .select('channel')
      .count('* as count')
      .groupBy('channel')
      .orderBy('count', 'desc');

    const result = {
      ...metrics,
      channelDistribution,
    };

    // Cache the results (5-minute TTL)
    await cacheService.set(cacheKey, result, DASHBOARD_CACHE_TTL);

    logger.info('Aggregated metrics retrieved', {
      organizationId,
      filters,
    });

    return result;
  } catch (error) {
    logger.error('Error getting aggregated metrics', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Search interactions using full-text search
 * Uses PostgreSQL full-text search indexes
 */
export async function searchInteractions(
  organizationId: string,
  searchQuery: string,
  pagination: Pagination
): Promise<InsightResult> {
  const db = getDbConnection();

  try {
    // Validate and sanitize pagination
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
    const offset = (page - 1) * pageSize;

    // Build full-text search query
    const query = db('customer_interactions')
      .where('organization_id', organizationId)
      .whereRaw(
        "to_tsvector('english', content) @@ plainto_tsquery('english', ?)",
        [searchQuery]
      );

    // Get total count
    const [{ count }] = await query.clone().count('* as count');
    const total = parseInt(count as string, 10);

    // Get paginated results with ranking
    const data = await query
      .select(
        'id',
        'customer_id',
        'timestamp',
        'channel',
        'event_type',
        'content',
        'sentiment',
        'sentiment_confidence',
        'metadata',
        db.raw(
          "ts_rank(to_tsvector('english', content), plainto_tsquery('english', ?)) as rank",
          [searchQuery]
        )
      )
      .orderBy('rank', 'desc')
      .orderBy('timestamp', 'desc')
      .limit(pageSize)
      .offset(offset);

    // Parse numeric fields that come back as strings from PostgreSQL
    const parsedData = data.map((item: any) => ({
      ...item,
      sentiment_confidence: item.sentiment_confidence ? parseFloat(item.sentiment_confidence) : null,
      rank: item.rank ? parseFloat(item.rank) : null,
    }));

    const totalPages = Math.ceil(total / pageSize);

    logger.info('Full-text search completed', {
      organizationId,
      searchQuery,
      total,
      resultCount: parsedData.length,
    });

    return {
      data: parsedData,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    logger.error('Error searching interactions', {
      organizationId,
      searchQuery,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Sanitize sort field to prevent SQL injection
 * Only allows whitelisted fields
 */
function sanitizeSortField(field: string): string {
  const allowedFields = [
    'timestamp',
    'sentiment_confidence',
    'channel',
    'event_type',
    'processed_at',
  ];

  if (allowedFields.includes(field)) {
    return field;
  }

  // Default to timestamp if invalid field provided
  return 'timestamp';
}

/**
 * Get customer profile with interaction history
 * Caches results with 10-minute TTL (Requirement 14.4)
 */
export async function getCustomerProfile(
  organizationId: string,
  customerId: string
): Promise<any> {
  const db = getDbConnection();

  try {
    // Generate cache key
    const cacheKey = cacheService.generateCacheKey('customer:profile', {
      organizationId,
      customerId,
    });

    // Try to get from cache
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      logger.debug('Customer profile cache hit', { customerId });
      return cached;
    }

    // Get customer details
    const customer = await db('customers')
      .where({
        id: customerId,
        organization_id: organizationId,
      })
      .first();

    if (!customer) {
      return null;
    }

    // Get recent interactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentInteractions = await db('customer_interactions')
      .where({
        customer_id: customerId,
        organization_id: organizationId,
      })
      .where('timestamp', '>=', thirtyDaysAgo)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .select('*');

    // Get sentiment distribution
    const sentimentDistribution = await db('customer_interactions')
      .where({
        customer_id: customerId,
        organization_id: organizationId,
      })
      .whereNotNull('sentiment')
      .select(
        db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'positive') as positive_count"),
        db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'negative') as negative_count"),
        db.raw("COUNT(*) FILTER (WHERE sentiment->>'label' = 'neutral') as neutral_count")
      )
      .first();

    const result = {
      customer,
      recentInteractions,
      sentimentDistribution,
    };

    // Cache the results (10-minute TTL)
    await cacheService.set(cacheKey, result, CUSTOMER_PROFILE_CACHE_TTL);

    logger.info('Customer profile retrieved', {
      organizationId,
      customerId,
    });

    return result;
  } catch (error) {
    logger.error('Error getting customer profile', {
      organizationId,
      customerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
