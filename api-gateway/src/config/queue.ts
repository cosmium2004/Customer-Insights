/**
 * Message Queue Configuration
 * 
 * Configures Bull queue for ML analysis jobs
 * Uses Redis as the backing store
 */

import Queue from 'bull';
import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Create Redis clients for Bull
const createRedisClient = (type: string) => {
  const client = new Redis(redisConfig);
  client.on('error', (err) => {
    console.error(`Redis ${type} client error:`, err);
  });
  return client;
};

// ML Analysis Queue
export const mlAnalysisQueue = new Queue('ml-analysis', {
  createClient: (type) => createRedisClient(type),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Queue event handlers
mlAnalysisQueue.on('error', (error) => {
  console.error('ML Analysis Queue error:', error);
});

mlAnalysisQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

mlAnalysisQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

export default mlAnalysisQueue;
