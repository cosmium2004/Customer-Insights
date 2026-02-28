/**
 * Pattern Detection Service
 * 
 * Handles behavior pattern detection by fetching customer interactions
 * and calling the ML service for pattern analysis.
 */

import axios from 'axios';
import { db } from '../config/database';
import logger from '../config/logger';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

interface Pattern {
  pattern_type: string;
  confidence: number;
  frequency: number;
  description: string;
  metadata: Record<string, any>;
}

interface Interaction {
  id: string;
  customer_id: string;
  timestamp: Date;
  channel: string;
  event_type: string;
  content: string | null;
  sentiment: any;
  metadata: Record<string, any>;
}

/**
 * Detect behavior patterns for a customer.
 * 
 * Fetches customer interactions from the past 30 days and calls the ML service
 * to detect behavioral patterns.
 * 
 * @param customerId - Customer UUID
 * @param organizationId - Organization UUID for multi-tenant isolation
 * @returns Array of detected patterns sorted by confidence descending
 * 
 * Preconditions:
 * - customerId is a valid UUID
 * - organizationId is a valid UUID
 * - Database connection is available
 * 
 * Postconditions:
 * - Returns array of patterns (may be empty if < 5 interactions)
 * - All patterns have confidence >= 0.7
 * - Patterns are sorted by confidence descending
 */
export async function detectBehaviorPatterns(
  customerId: string,
  organizationId: string
): Promise<Pattern[]> {
  try {
    // Step 1: Fetch customer interactions from past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const interactions = await db('customer_interactions')
      .where({
        customer_id: customerId,
        organization_id: organizationId
      })
      .where('timestamp', '>=', thirtyDaysAgo)
      .orderBy('timestamp', 'asc')
      .select(
        'id',
        'customer_id',
        'timestamp',
        'channel',
        'event_type',
        'content',
        'sentiment',
        'metadata'
      );
    
    logger.info(
      `Fetched ${interactions.length} interactions for customer ${customerId} ` +
      `from past 30 days`
    );
    
    // Step 2: Return empty list if customer has fewer than 5 interactions
    if (interactions.length < 5) {
      logger.info(
        `Insufficient interactions for pattern detection: ${interactions.length} < 5`
      );
      return [];
    }
    
    // Step 3: Call ML service for pattern detection
    const response = await axios.post(
      `${ML_SERVICE_URL}/detect/patterns`,
      {
        customer_id: customerId,
        interactions: interactions.map((i: Interaction) => ({
          id: i.id,
          customer_id: i.customer_id,
          timestamp: i.timestamp.toISOString(),
          channel: i.channel,
          event_type: i.event_type,
          content: i.content,
          sentiment: i.sentiment,
          metadata: i.metadata
        }))
      },
      {
        timeout: 5000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const patterns: Pattern[] = response.data.patterns;
    
    logger.info(
      `Pattern detection completed for customer ${customerId}: ` +
      `${patterns.length} patterns detected`
    );
    
    // Patterns are already filtered (confidence >= 0.7) and sorted by ML service
    return patterns;
    
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      logger.error(
        `ML service error during pattern detection: ${error.message}`,
        { customerId, status: error.response?.status }
      );
      
      if (error.response?.status === 400) {
        throw new Error('Invalid pattern detection request');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('ML service unavailable');
      }
    }
    
    logger.error(
      `Pattern detection failed for customer ${customerId}: ${error.message}`,
      { error }
    );
    throw error;
  }
}
