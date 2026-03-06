/**
 * WebSocket Event Emitter Service
 * 
 * Handles real-time event emission with compression, batching, and filtering
 * Ensures events are delivered within 1 second of creation
 * 
 * Requirements: 6.2, 6.3, 6.4, 6.9, 6.10
 */

import { emitToOrganization } from '../config/websocket';
import { logger } from '../config/logger';
import { gzip } from 'zlib';
import { promisify } from 'util';

const compressAsync = promisify(gzip);

interface BaseEvent {
  type: string;
  timestamp: Date;
  organizationId: string;
}

interface InteractionCreatedEvent extends BaseEvent {
  type: 'interaction.created';
  interactionId: string;
  customerId: string;
  channel: string;
  eventType: string;
}

interface SentimentAnalyzedEvent extends BaseEvent {
  type: 'sentiment.analyzed';
  interactionId: string;
  customerId: string;
  sentiment: {
    label: 'positive' | 'negative' | 'neutral';
    positive: number;
    negative: number;
    neutral: number;
  };
  confidence: number;
}

type WebSocketEvent = InteractionCreatedEvent | SentimentAnalyzedEvent;

// Event batching configuration
const BATCH_WINDOW_MS = 100; // 100ms batching window
const MAX_BATCH_SIZE = 10; // Maximum events per batch
const COMPRESSION_THRESHOLD = 1024; // Compress messages larger than 1KB

// Event batching queues per organization
const eventBatches = new Map<string, WebSocketEvent[]>();
const batchTimers = new Map<string, NodeJS.Timeout>();

/**
 * Emit interaction.created event
 * Requirement 6.2: Emit within 1 second of creation
 * 
 * @param data - Interaction created event data
 */
export async function emitInteractionCreated(data: {
  interactionId: string;
  customerId: string;
  organizationId: string;
  timestamp: Date;
  channel: string;
  eventType: string;
}): Promise<void> {
  const event: InteractionCreatedEvent = {
    type: 'interaction.created',
    timestamp: data.timestamp,
    organizationId: data.organizationId,
    interactionId: data.interactionId,
    customerId: data.customerId,
    channel: data.channel,
    eventType: data.eventType,
  };

  await emitEvent(event);
}

/**
 * Emit sentiment.analyzed event
 * Requirement 6.3: Emit within 1 second of analysis completion
 * 
 * @param data - Sentiment analyzed event data
 */
export async function emitSentimentAnalyzed(data: {
  interactionId: string;
  customerId: string;
  organizationId: string;
  sentiment: {
    label: 'positive' | 'negative' | 'neutral';
    positive: number;
    negative: number;
    neutral: number;
  };
  confidence: number;
}): Promise<void> {
  const event: SentimentAnalyzedEvent = {
    type: 'sentiment.analyzed',
    timestamp: new Date(),
    organizationId: data.organizationId,
    interactionId: data.interactionId,
    customerId: data.customerId,
    sentiment: data.sentiment,
    confidence: data.confidence,
  };

  await emitEvent(event);
}

/**
 * Core event emission with batching and compression
 * Requirement 6.4: Filter events by organization
 * Requirement 6.9: Implement message compression when possible
 * Requirement 6.10: Batch multiple rapid events into single messages
 * 
 * @param event - Event to emit
 */
async function emitEvent(event: WebSocketEvent): Promise<void> {
  const startTime = Date.now();
  const organizationId = event.organizationId;

  try {
    // Add event to batch queue
    if (!eventBatches.has(organizationId)) {
      eventBatches.set(organizationId, []);
    }

    const batch = eventBatches.get(organizationId)!;
    batch.push(event);

    // Clear existing timer
    if (batchTimers.has(organizationId)) {
      clearTimeout(batchTimers.get(organizationId)!);
    }

    // Emit immediately if batch is full, otherwise wait for batch window
    if (batch.length >= MAX_BATCH_SIZE) {
      await flushBatch(organizationId);
    } else {
      // Set timer to flush batch after window expires
      const timer = setTimeout(() => {
        flushBatch(organizationId).catch((error) => {
          logger.error('Failed to flush event batch', {
            organizationId,
            error: error.message,
          });
        });
      }, BATCH_WINDOW_MS);

      batchTimers.set(organizationId, timer);
    }

    const emitTime = Date.now() - startTime;
    
    // Log warning if emission takes longer than 1 second (Requirement 6.2, 6.3)
    if (emitTime > 1000) {
      logger.warn('Event emission exceeded 1 second SLA', {
        eventType: event.type,
        organizationId,
        emitTime,
      });
    }
  } catch (error) {
    logger.error('Failed to emit event', {
      eventType: event.type,
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Flush event batch for an organization
 * Sends batched events with optional compression
 * 
 * @param organizationId - Organization ID to flush events for
 */
async function flushBatch(organizationId: string): Promise<void> {
  const batch = eventBatches.get(organizationId);
  
  if (!batch || batch.length === 0) {
    return;
  }

  // Clear batch and timer
  eventBatches.set(organizationId, []);
  if (batchTimers.has(organizationId)) {
    clearTimeout(batchTimers.get(organizationId)!);
    batchTimers.delete(organizationId);
  }

  try {
    // Prepare payload
    const payload = batch.length === 1 ? batch[0] : { events: batch, batched: true };
    const payloadStr = JSON.stringify(payload);
    const payloadSize = Buffer.byteLength(payloadStr, 'utf8');

    // Compress if payload exceeds threshold (Requirement 6.9)
    if (payloadSize > COMPRESSION_THRESHOLD) {
      try {
        const compressed = await compressAsync(Buffer.from(payloadStr, 'utf8'));
        
        // Emit compressed data with metadata
        emitToOrganization(organizationId, 'event', {
          compressed: true,
          data: compressed.toString('base64'),
        });

        logger.debug('Emitted compressed event batch', {
          organizationId,
          eventCount: batch.length,
          originalSize: payloadSize,
          compressedSize: compressed.length,
          compressionRatio: (compressed.length / payloadSize * 100).toFixed(2) + '%',
        });
      } catch (compressionError) {
        // Fall back to uncompressed if compression fails
        logger.warn('Compression failed, sending uncompressed', {
          organizationId,
          error: compressionError instanceof Error ? compressionError.message : 'Unknown error',
        });
        emitToOrganization(organizationId, 'event', payload);
      }
    } else {
      // Send uncompressed for small payloads
      emitToOrganization(organizationId, 'event', payload);

      logger.debug('Emitted event batch', {
        organizationId,
        eventCount: batch.length,
        payloadSize,
      });
    }
  } catch (error) {
    logger.error('Failed to flush event batch', {
      organizationId,
      batchSize: batch.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Flush all pending batches (useful for graceful shutdown)
 */
export async function flushAllBatches(): Promise<void> {
  const organizations = Array.from(eventBatches.keys());
  
  logger.info('Flushing all pending event batches', {
    organizationCount: organizations.length,
  });

  await Promise.all(
    organizations.map((orgId) => flushBatch(orgId).catch((error) => {
      logger.error('Failed to flush batch during shutdown', {
        organizationId: orgId,
        error: error.message,
      });
    }))
  );
}

/**
 * Get statistics about event batching
 */
export function getBatchingStats(): {
  pendingBatches: number;
  totalPendingEvents: number;
  organizations: string[];
} {
  let totalEvents = 0;
  const organizations: string[] = [];

  for (const [orgId, batch] of eventBatches.entries()) {
    if (batch.length > 0) {
      organizations.push(orgId);
      totalEvents += batch.length;
    }
  }

  return {
    pendingBatches: organizations.length,
    totalPendingEvents: totalEvents,
    organizations,
  };
}
