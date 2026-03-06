/**
 * ML Analysis Worker
 * 
 * Processes ML analysis jobs from the queue
 * - Calls ML service for sentiment prediction
 * - Updates interaction record with sentiment scores
 * - Updates customer average_sentiment
 * - Marks interaction as processed with processed_at timestamp
 * - Emits 'sentiment.analyzed' WebSocket event
 * 
 * Requirements: 2.7, 2.10, 12.5, 12.6, 12.8, 12.9, 12.10
 */

import { Job } from 'bull';
import { mlAnalysisQueue } from '../config/queue';
import { getDbConnection } from '../config/database';
import { logger } from '../config/logger';
import { emitSentimentAnalyzed } from '../services/websocketEventService';
import axios from 'axios';

/**
 * ML Analysis Job Data
 */
interface MLAnalysisJob {
  interactionId: string;
  content: string;
  customerId: string;
  organizationId: string;
}

/**
 * Sentiment Prediction Response from ML Service
 */
interface SentimentPrediction {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  scores: {
    positive: number;
    negative: number;
    neutral: number;
  };
  processing_time_ms: number;
}

/**
 * Process ML analysis job
 * 
 * Workflow:
 * 1. Call ML service for sentiment prediction
 * 2. Update interaction record with sentiment scores (Requirement 12.8)
 * 3. Mark interaction as processed with processed_at timestamp (Requirement 12.10)
 * 4. Update customer average_sentiment (Requirement 12.5)
 * 5. Emit 'sentiment.analyzed' WebSocket event (Requirement 12.9)
 * 
 * @param job - Bull job containing interaction data
 */
async function processMLAnalysis(job: Job<MLAnalysisJob>): Promise<void> {
  const { interactionId, content, customerId, organizationId } = job.data;

  logger.info('Processing ML analysis job', {
    jobId: job.id,
    interactionId,
    customerId,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Step 1: Call ML service for sentiment prediction (Requirement 2.10)
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    const response = await axios.post<SentimentPrediction>(
      `${mlServiceUrl}/predict/sentiment`,
      {
        text: content,
        model_type: 'default',
      },
      {
        timeout: 600, // 600ms timeout (100ms buffer over 500ms SLA)
      }
    );

    const prediction = response.data;

    logger.debug('ML prediction received', {
      interactionId,
      sentiment: prediction.sentiment,
      confidence: prediction.confidence,
      processingTime: prediction.processing_time_ms,
    });

    const db = getDbConnection();

    // Step 2 & 3: Update interaction record with sentiment scores and mark as processed
    // Requirements: 12.8 (update sentiment), 12.9 (update confidence), 12.10 (mark processed)
    await db('customer_interactions')
      .where({ id: interactionId })
      .update({
        sentiment: {
          label: prediction.sentiment,
          positive: prediction.scores.positive,
          negative: prediction.scores.negative,
          neutral: prediction.scores.neutral,
        },
        sentiment_confidence: prediction.confidence,
        processed_at: db.raw('NOW()'), // Requirement 12.10: Mark as processed
      });

    logger.info('Interaction updated with sentiment', {
      interactionId,
      sentiment: prediction.sentiment,
      confidence: prediction.confidence,
    });

    // Step 4: Update customer average sentiment (Requirement 12.5)
    await updateCustomerAverageSentiment(customerId);

    // Step 5: Emit sentiment.analyzed WebSocket event (Requirement 12.9, 6.3)
    await emitSentimentAnalyzed({
      interactionId,
      customerId,
      organizationId,
      sentiment: {
        label: prediction.sentiment,
        positive: prediction.scores.positive,
        negative: prediction.scores.negative,
        neutral: prediction.scores.neutral,
      },
      confidence: prediction.confidence,
    });

    logger.info('ML analysis job completed successfully', {
      jobId: job.id,
      interactionId,
      sentiment: prediction.sentiment,
    });
  } catch (error) {
    logger.error('ML analysis job failed', {
      jobId: job.id,
      interactionId,
      attempt: job.attemptsMade + 1,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Rethrow to trigger job retry (Bull will handle exponential backoff)
    throw error;
  }
}

/**
 * Update customer average sentiment
 * 
 * Recalculates average sentiment from all processed interactions
 * Requirement 12.5: When a customer record is updated, recalculate average sentiment
 * 
 * @param customerId - Customer ID
 */
async function updateCustomerAverageSentiment(customerId: string): Promise<void> {
  try {
    const db = getDbConnection();

    // Calculate average sentiment from all processed interactions
    // Positive = 1, Neutral = 0, Negative = -1
    const result = await db('customer_interactions')
      .where({ customer_id: customerId })
      .whereNotNull('sentiment')
      .whereNotNull('processed_at') // Only include processed interactions
      .select(
        db.raw(`
          AVG(
            CASE 
              WHEN sentiment->>'label' = 'positive' THEN 1
              WHEN sentiment->>'label' = 'negative' THEN -1
              ELSE 0
            END
          ) as avg_sentiment
        `)
      )
      .first();

    const averageSentiment = result?.avg_sentiment || 0;

    // Update customer record (Requirement 12.5, 12.6)
    await db('customers')
      .where({ id: customerId })
      .update({
        average_sentiment: averageSentiment,
        updated_at: db.raw('NOW()'), // Requirement 12.6: Update timestamp
      });

    logger.debug('Customer average sentiment updated', {
      customerId,
      averageSentiment: parseFloat(averageSentiment).toFixed(4),
    });
  } catch (error) {
    logger.error('Failed to update customer average sentiment', {
      customerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Initialize ML analysis worker
 * 
 * Sets up queue processor with:
 * - Concurrency of 5 workers
 * - Job retry logic (3 attempts with exponential backoff)
 * - Event handlers for monitoring
 * 
 * Requirements: 2.7, 2.10
 */
export function initializeMLAnalysisWorker(): void {
  logger.info('Initializing ML analysis worker');

  // Process jobs with concurrency of 5
  // This allows processing 5 ML analysis jobs simultaneously
  mlAnalysisQueue.process('analyze-sentiment', 5, processMLAnalysis);

  // Handle job completion
  mlAnalysisQueue.on('completed', (job: Job) => {
    logger.info('ML analysis job completed', {
      jobId: job.id,
      interactionId: job.data.interactionId,
      processingTime: job.finishedOn && job.processedOn 
        ? job.finishedOn - job.processedOn 
        : 0,
    });
  });

  // Handle job failure (after all retries exhausted)
  mlAnalysisQueue.on('failed', (job: Job, error: Error) => {
    logger.error('ML analysis job failed after all retries', {
      jobId: job.id,
      interactionId: job.data.interactionId,
      error: error.message,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });
  });

  // Handle job retry
  mlAnalysisQueue.on('retrying', (job: Job, error: Error) => {
    logger.warn('ML analysis job retrying', {
      jobId: job.id,
      interactionId: job.data.interactionId,
      error: error.message,
      attempt: job.attemptsMade,
      nextAttempt: job.attemptsMade + 1,
    });
  });

  // Handle stalled jobs (worker crashed or took too long)
  mlAnalysisQueue.on('stalled', (job: Job) => {
    logger.warn('ML analysis job stalled', {
      jobId: job.id,
      interactionId: job.data.interactionId,
    });
  });

  logger.info('ML analysis worker initialized', {
    concurrency: 5,
    maxAttempts: 3,
    backoffType: 'exponential',
    initialDelay: 2000,
  });
}

/**
 * Graceful shutdown
 * 
 * Waits for active jobs to complete before closing the queue
 * Ensures no jobs are lost during shutdown
 */
export async function shutdownMLAnalysisWorker(): Promise<void> {
  logger.info('Shutting down ML analysis worker...');

  try {
    // Close the queue gracefully
    // This waits for active jobs to complete
    await mlAnalysisQueue.close();

    logger.info('ML analysis worker shut down successfully');
  } catch (error) {
    logger.error('Error during ML analysis worker shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
