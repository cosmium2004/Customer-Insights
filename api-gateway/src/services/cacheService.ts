import crypto from 'crypto';
import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Cache Service
 * Provides caching operations with key generation and invalidation logic
 * Validates: Requirements 14.6, 14.7, 14.8, 14.9
 */

/**
 * Generate cache key for API endpoints
 * Format: {endpoint}:{hash(params)}
 * @param endpoint - API endpoint name
 * @param params - Parameters to hash
 * @returns Cache key string
 */
export function generateCacheKey(endpoint: string, params: any): string {
  const paramsString = JSON.stringify(params);
  const hash = crypto.createHash('sha256').update(paramsString).digest('hex');
  return `${endpoint}:${hash}`;
}

/**
 * Generate cache key for ML predictions
 * Format: ml:{model_type}:{hash(text)}
 * @param modelType - ML model type
 * @param text - Text to hash
 * @returns ML cache key string
 */
export function generateMLCacheKey(modelType: string, text: string): string {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return `ml:${modelType}:${hash}`;
}

/**
 * Get value from cache
 * @param key - Cache key
 * @returns Cached value or null if not found
 */
export async function get<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const value = await redis.get(key);
    
    if (!value) {
      logger.debug('Cache miss', { key });
      return null;
    }
    
    logger.debug('Cache hit', { key });
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error('Cache get error', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null; // Fail gracefully
  }
}

/**
 * Set value in cache with TTL
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttlSeconds - Time to live in seconds
 */
export async function set(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    
    await redis.setex(key, ttlSeconds, serialized);
    
    logger.debug('Cache set', { key, ttlSeconds });
  } catch (error) {
    logger.error('Cache set error', {
      key,
      ttlSeconds,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't throw - caching failures shouldn't break the application
  }
}

/**
 * Delete value from cache
 * @param key - Cache key
 */
export async function del(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(key);
    
    logger.debug('Cache delete', { key });
  } catch (error) {
    logger.error('Cache delete error', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete multiple keys matching a pattern
 * @param pattern - Key pattern (e.g., "user:*")
 */
export async function delPattern(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    
    // Use SCAN to find keys matching pattern (safer than KEYS for production)
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      const [nextCursor, matchedKeys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      keys.push(...matchedKeys);
    } while (cursor !== '0');
    
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('Cache pattern delete', { pattern, keysDeleted: keys.length });
    }
  } catch (error) {
    logger.error('Cache pattern delete error', {
      pattern,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Check if key exists in cache
 * @param key - Cache key
 * @returns True if key exists
 */
export async function exists(key: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Cache exists error', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Get remaining TTL for a key
 * @param key - Cache key
 * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
 */
export async function ttl(key: string): Promise<number> {
  try {
    const redis = getRedisClient();
    return await redis.ttl(key);
  } catch (error) {
    logger.error('Cache TTL error', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return -2;
  }
}

/**
 * Cache invalidation for JWT tokens
 * Invalidates token cache on logout or password change
 * @param userId - User ID
 */
export async function invalidateUserTokens(userId: string): Promise<void> {
  try {
    await delPattern(`token:${userId}:*`);
    logger.info('User tokens invalidated', { userId });
  } catch (error) {
    logger.error('Token invalidation error', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Cache invalidation for customer data
 * Invalidates related caches when customer data is updated
 * @param customerId - Customer ID
 */
export async function invalidateCustomerCache(customerId: string): Promise<void> {
  try {
    // Invalidate customer profile cache
    await delPattern(`customer:${customerId}:*`);
    
    // Invalidate insights that include this customer
    await delPattern(`insights:*:customer:${customerId}:*`);
    
    logger.info('Customer cache invalidated', { customerId });
  } catch (error) {
    logger.error('Customer cache invalidation error', {
      customerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Cache invalidation for organization data
 * Invalidates all caches for an organization
 * @param organizationId - Organization ID
 */
export async function invalidateOrganizationCache(organizationId: string): Promise<void> {
  try {
    await delPattern(`*:org:${organizationId}:*`);
    logger.info('Organization cache invalidated', { organizationId });
  } catch (error) {
    logger.error('Organization cache invalidation error', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Cache invalidation for dashboard aggregations
 * Invalidates dashboard caches for an organization
 * @param organizationId - Organization ID
 */
export async function invalidateDashboardCache(organizationId: string): Promise<void> {
  try {
    await delPattern(`dashboard:*:org:${organizationId}:*`);
    await delPattern(`metrics:*:org:${organizationId}:*`);
    await delPattern(`trends:*:org:${organizationId}:*`);
    
    logger.info('Dashboard cache invalidated', { organizationId });
  } catch (error) {
    logger.error('Dashboard cache invalidation error', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get cache statistics
 * @returns Cache hit rate and other metrics
 */
export async function getCacheStats(): Promise<any> {
  try {
    const redis = getRedisClient();
    const info = await redis.info('stats');
    
    // Parse stats from Redis INFO output
    const stats: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    }
    
    // Calculate hit rate if available
    const hits = parseInt(stats.keyspace_hits || '0', 10);
    const misses = parseInt(stats.keyspace_misses || '0', 10);
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    
    return {
      hits,
      misses,
      hitRate: hitRate.toFixed(2) + '%',
      totalKeys: await redis.dbsize(),
    };
  } catch (error) {
    logger.error('Cache stats error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Flush all cache (use with caution!)
 */
export async function flushAll(): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.flushdb();
    logger.warn('Cache flushed - all keys deleted');
  } catch (error) {
    logger.error('Cache flush error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
