/**
 * ML Service Wrapper
 * 
 * Provides caching layer for ML predictions
 * Validates: Requirements 3.12, 8.5, 14.6
 */

import axios from 'axios';
import { logger } from '../config/logger';
import * as cacheService from './cacheService';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_PREDICTION_CACHE_TTL = 3600; // 1 hour

export interface SentimentPrediction {
  sentiment: string;
  confidence: number;
  scores: {
    positive: number;
    negative: number;
    neutral: number;
  };
  processing_time_ms: number;
}

/**
 * Predict sentiment from text with caching
 * Caches predictions with 1-hour TTL using text hash as key (Requirement 14.6)
 * 
 * @param text - Text to analyze
 * @param modelType - ML model type (default: 'default')
 * @returns Sentiment prediction
 */
export async function predictSentiment(
  text: string,
  modelType: string = 'default'
): Promise<SentimentPrediction> {
  try {
    // Generate cache key: ml:{model_type}:{hash(text)}
    const cacheKey = cacheService.generateMLCacheKey(modelType, text);

    // Try to get from cache
    const cached = await cacheService.get<SentimentPrediction>(cacheKey);
    if (cached) {
      logger.debug('ML prediction cache hit', { modelType, textLength: text.length });
      return cached;
    }

    // Cache miss - call ML service
    logger.debug('ML prediction cache miss', { modelType, textLength: text.length });

    const response = await axios.post(
      `${ML_SERVICE_URL}/predict/sentiment`,
      {
        text,
        model_type: modelType,
      },
      {
        timeout: 600, // 600ms timeout (100ms buffer over 500ms SLA)
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const prediction: SentimentPrediction = response.data;

    // Cache the prediction (1-hour TTL)
    await cacheService.set(cacheKey, prediction, ML_PREDICTION_CACHE_TTL);

    logger.info('ML prediction completed and cached', {
      modelType,
      sentiment: prediction.sentiment,
      confidence: prediction.confidence,
      processingTime: prediction.processing_time_ms,
    });

    return prediction;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('ML service error during sentiment prediction', {
        error: error.message,
        status: error.response?.status,
        textLength: text.length,
      });

      if (error.response?.status === 400) {
        throw new Error('Invalid sentiment prediction request');
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error('ML service unavailable');
      }
    }

    logger.error('Sentiment prediction failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Batch predict sentiment for multiple texts
 * Uses individual caching for each text
 * 
 * @param texts - Array of texts to analyze
 * @param modelType - ML model type (default: 'default')
 * @returns Array of sentiment predictions
 */
export async function batchPredictSentiment(
  texts: string[],
  modelType: string = 'default'
): Promise<SentimentPrediction[]> {
  try {
    // Check cache for each text
    const results: (SentimentPrediction | null)[] = await Promise.all(
      texts.map(async (text) => {
        const cacheKey = cacheService.generateMLCacheKey(modelType, text);
        return await cacheService.get<SentimentPrediction>(cacheKey);
      })
    );

    // Identify texts that need prediction
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    results.forEach((result, index) => {
      if (result === null) {
        uncachedIndices.push(index);
        uncachedTexts.push(texts[index]);
      }
    });

    // If all cached, return immediately
    if (uncachedTexts.length === 0) {
      logger.debug('Batch prediction - all cached', { count: texts.length });
      return results as SentimentPrediction[];
    }

    // Call ML service for uncached texts
    logger.debug('Batch prediction - calling ML service', {
      total: texts.length,
      cached: texts.length - uncachedTexts.length,
      uncached: uncachedTexts.length,
    });

    const response = await axios.post(
      `${ML_SERVICE_URL}/predict/sentiment/batch`,
      {
        texts: uncachedTexts,
        model_type: modelType,
      },
      {
        timeout: 5000, // 5 second timeout for batch
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const predictions: SentimentPrediction[] = response.data.predictions;

    // Cache the new predictions
    await Promise.all(
      predictions.map(async (prediction, i) => {
        const text = uncachedTexts[i];
        const cacheKey = cacheService.generateMLCacheKey(modelType, text);
        await cacheService.set(cacheKey, prediction, ML_PREDICTION_CACHE_TTL);
      })
    );

    // Merge cached and new predictions
    uncachedIndices.forEach((index, i) => {
      results[index] = predictions[i];
    });

    logger.info('Batch prediction completed', {
      total: texts.length,
      cached: texts.length - uncachedTexts.length,
      predicted: uncachedTexts.length,
    });

    return results as SentimentPrediction[];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('ML service error during batch prediction', {
        error: error.message,
        status: error.response?.status,
        count: texts.length,
      });

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error('ML service unavailable');
      }
    }

    logger.error('Batch prediction failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
