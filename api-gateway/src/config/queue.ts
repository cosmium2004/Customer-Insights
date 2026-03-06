/**
 * Message Queue Configuration
 * 
 * Configures Bull queue for ML analysis jobs with Redis backend
 * Implements retry logic with exponential backoff (3 attempts)
 * 
 * Requirements: 2.7, 2.10
 */

import Queue from 'bull';
import Redis from 'ioredis';
import { logger } from './logger';

/**
 * Redis configuration for Bull queue
 * Uses Redis as the backing store for job persistence
 */
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for Bull
  enableReadyCheck: false, // Required for Bull
  retryStrategy: (times: number) => {
    // Retry connection with exponential backoff
    const delay = Math.min(times * 1000, 10000); // Max 10 seconds
    return delay;
  },
};

/**
 * Create Redis client for Bull queue
 * Bull requires separate clients for different purposes (client, subscriber, bclient)
 * 
 * @param type - Client type (client, subscriber, bclient)
 * @returns Redis client instance
 */
const createRedisClient = (type: string) => {
  logger.debug('Creating Redis client for Bull queue', { type });
  
  const client = new Redis(redisConfig);
  
  client.on('error', (err) => {
    logger.error(`Redis ${type} client error`, {
      type,
      error: err.message,
    });
  });
  
  client.on('connect', () => {
    logger.debug(`Redis ${type} client connected`);
  });
  
  return client;
};

/**
 * ML Analysis Queue
 * 
 * Queue for asynchronous ML sentiment analysis jobs
 * - Queue name: 'ml-analysis'
 * - Redis backend for persistence
 * - 3 retry attempts with exponential backoff (2s, 4s, 8s)
 * - Jobs removed on completion to save memory
 * - Failed jobs retained for debugging
 * 
 * Requirements: 2.7, 2.10
 */
export const mlAnalysisQueue = new Queue('ml-analysis', {
  createClient: (type) => createRedisClient(type),
  defaultJobOptions: {
    // Retry logic: 3 attempts with exponential backoff
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Initial delay: 2 seconds (2s, 4s, 8s)
    },
    // Job lifecycle management
    removeOnComplete: true, // Remove completed jobs to save memory
    removeOnFail: false, // Keep failed jobs for debugging
    // Timeout settings
    timeout: 30000, // 30 second timeout per job
  },
});

/**
 * Queue event handlers for monitoring and logging
 */

// Queue-level errors (connection issues, etc.)
mlAnalysisQueue.on('error', (error) => {
  logger.error('ML Analysis Queue error', {
    error: error.message,
    stack: error.stack,
  });
});

// Job failed after all retry attempts
mlAnalysisQueue.on('failed', (job, err) => {
  logger.error('ML analysis job failed after all retries', {
    jobId: job.id,
    interactionId: job.data.interactionId,
    attempts: job.attemptsMade,
    error: err.message,
  });
});

// Job completed successfully
mlAnalysisQueue.on('completed', (job) => {
  logger.info('ML analysis job completed', {
    jobId: job.id,
    interactionId: job.data.interactionId,
    processingTime: job.finishedOn ? job.finishedOn - job.processedOn! : 0,
  });
});

// Job is waiting to be processed
mlAnalysisQueue.on('waiting', (jobId) => {
  logger.debug('ML analysis job waiting', { jobId });
});

// Job started processing
mlAnalysisQueue.on('active', (job) => {
  logger.debug('ML analysis job active', {
    jobId: job.id,
    interactionId: job.data.interactionId,
  });
});

// Job stalled (worker crashed or took too long)
mlAnalysisQueue.on('stalled', (job) => {
  logger.warn('ML analysis job stalled', {
    jobId: job.id,
    interactionId: job.data.interactionId,
  });
});

// Job progress update
mlAnalysisQueue.on('progress', (job, progress) => {
  logger.debug('ML analysis job progress', {
    jobId: job.id,
    progress,
  });
});

logger.info('ML Analysis Queue initialized', {
  queueName: 'ml-analysis',
  redisHost: redisConfig.host,
  redisPort: redisConfig.port,
  maxAttempts: 3,
  backoffType: 'exponential',
  initialDelay: 2000,
});

export default mlAnalysisQueue;
