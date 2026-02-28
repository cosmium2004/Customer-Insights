import Redis, { RedisOptions } from 'ioredis';
import { logger } from './logger';

/**
 * Redis Client Configuration
 * Implements connection pooling, error handling, and retry logic
 * Validates: Requirements 8.5, 14.1
 */

let redisClient: Redis | null = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

/**
 * Redis connection options with retry logic
 */
const redisOptions: RedisOptions = {
  // Connection settings
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  
  // Connection pool settings
  lazyConnect: false,
  keepAlive: 30000, // 30 seconds
  
  // Retry strategy with exponential backoff
  retryStrategy(times: number): number | null {
    if (times > MAX_RETRIES) {
      logger.error('Redis max retries exceeded', { attempts: times });
      return null; // Stop retrying
    }
    
    const delay = Math.min(times * RETRY_DELAY_MS, 10000); // Max 10 seconds
    logger.warn('Redis connection retry', { attempt: times, delayMs: delay });
    return delay;
  },
  
  // Reconnect on error
  reconnectOnError(err: Error): boolean | 1 | 2 {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    if (targetErrors.some(targetError => err.message.includes(targetError))) {
      logger.warn('Redis reconnecting on error', { error: err.message });
      return true; // Reconnect
    }
    return false;
  },
};

/**
 * Initialize Redis client with connection pooling and error handling
 * @returns Redis client instance
 */
export function initializeRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  logger.info('Initializing Redis client', { url: REDIS_URL });

  redisClient = new Redis(REDIS_URL, redisOptions);

  // Connection event handlers
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (error: Error) => {
    logger.error('Redis client error', {
      error: error.message,
      stack: error.stack,
    });
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', (delay: number) => {
    logger.info('Redis reconnecting', { delayMs: delay });
  });

  redisClient.on('end', () => {
    logger.warn('Redis connection ended');
  });

  return redisClient;
}

/**
 * Get Redis client instance
 * Initializes client if not already initialized
 * @returns Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    return initializeRedis();
  }
  return redisClient;
}

/**
 * Check Redis connection health
 * @returns True if Redis is connected and responsive
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    logger.info('Closing Redis connection');
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Get Redis connection info for monitoring
 */
export async function getRedisInfo(): Promise<any> {
  try {
    const client = getRedisClient();
    const info = await client.info();
    return parseRedisInfo(info);
  } catch (error) {
    logger.error('Failed to get Redis info', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Parse Redis INFO command output
 */
function parseRedisInfo(info: string): Record<string, any> {
  const lines = info.split('\r\n');
  const parsed: Record<string, any> = {};
  
  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        parsed[key] = value;
      }
    }
  }
  
  return parsed;
}
