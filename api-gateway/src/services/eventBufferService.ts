/**
 * Event Buffer Service
 * 
 * Handles event buffering during client disconnections
 * Supports automatic reconnection with exponential backoff
 * Syncs missed events on reconnection
 * 
 * Requirements: 6.6, 6.7, 6.8
 */

import { logger } from '../config/logger';
import { getRedisClient } from '../config/redis';

interface BufferedEvent {
  eventId: string;
  type: string;
  timestamp: Date;
  data: any;
}

const MAX_BUFFER_SIZE = 100; // Maximum events to buffer per client (Requirement 6.7)
const BUFFER_TTL = 3600; // Buffer TTL in seconds (1 hour)

/**
 * Buffer event for a specific client
 * Requirement 6.7: Buffer up to 100 events during disconnection
 * 
 * @param clientId - Client identifier (socket ID or user ID)
 * @param event - Event to buffer
 */
export async function bufferEvent(clientId: string, event: BufferedEvent): Promise<void> {
  try {
    const redis = getRedisClient();
    const bufferKey = `event_buffer:${clientId}`;

    // Get current buffer size
    const bufferSize = await redis.llen(bufferKey);

    // Check if buffer is full (Requirement 6.8)
    if (bufferSize >= MAX_BUFFER_SIZE) {
      logger.warn('Event buffer overflow', {
        clientId,
        bufferSize,
        maxSize: MAX_BUFFER_SIZE,
      });

      // Remove oldest event to make room (FIFO)
      await redis.lpop(bufferKey);
    }

    // Add event to buffer (right push for FIFO)
    const eventStr = JSON.stringify(event);
    await redis.rpush(bufferKey, eventStr);

    // Set TTL on buffer
    await redis.expire(bufferKey, BUFFER_TTL);

    logger.debug('Event buffered', {
      clientId,
      eventType: event.type,
      bufferSize: bufferSize + 1,
    });
  } catch (error) {
    logger.error('Failed to buffer event', {
      clientId,
      eventType: event.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get buffered events for a client
 * Requirement 6.7: Sync missed events on reconnection
 * 
 * @param clientId - Client identifier
 * @returns Array of buffered events
 */
export async function getBufferedEvents(clientId: string): Promise<BufferedEvent[]> {
  try {
    const redis = getRedisClient();
    const bufferKey = `event_buffer:${clientId}`;

    // Get all buffered events
    const eventStrings = await redis.lrange(bufferKey, 0, -1);

    // Parse events
    const events: BufferedEvent[] = eventStrings.map((eventStr) => {
      try {
        return JSON.parse(eventStr);
      } catch (parseError) {
        logger.error('Failed to parse buffered event', {
          clientId,
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
        });
        return null;
      }
    }).filter((event): event is BufferedEvent => event !== null);

    logger.info('Retrieved buffered events', {
      clientId,
      eventCount: events.length,
    });

    return events;
  } catch (error) {
    logger.error('Failed to retrieve buffered events', {
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Clear buffered events for a client
 * Called after successful sync
 * 
 * @param clientId - Client identifier
 */
export async function clearBuffer(clientId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const bufferKey = `event_buffer:${clientId}`;

    await redis.del(bufferKey);

    logger.debug('Event buffer cleared', { clientId });
  } catch (error) {
    logger.error('Failed to clear event buffer', {
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get buffer size for a client
 * 
 * @param clientId - Client identifier
 * @returns Number of buffered events
 */
export async function getBufferSize(clientId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const bufferKey = `event_buffer:${clientId}`;

    return await redis.llen(bufferKey);
  } catch (error) {
    logger.error('Failed to get buffer size', {
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return 0;
  }
}

/**
 * Check if buffer has overflowed
 * Requirement 6.8: Fall back to REST API if buffer overflows
 * 
 * @param clientId - Client identifier
 * @returns True if buffer has overflowed
 */
export async function hasBufferOverflowed(clientId: string): Promise<boolean> {
  const bufferSize = await getBufferSize(clientId);
  return bufferSize >= MAX_BUFFER_SIZE;
}

/**
 * Get buffer statistics
 * 
 * @returns Buffer statistics across all clients
 */
export async function getBufferStats(): Promise<{
  totalBuffers: number;
  totalEvents: number;
  overflowedBuffers: number;
}> {
  try {
    const redis = getRedisClient();
    
    // Get all buffer keys
    const keys = await redis.keys('event_buffer:*');
    
    let totalEvents = 0;
    let overflowedBuffers = 0;

    // Count events in each buffer
    for (const key of keys) {
      const size = await redis.llen(key);
      totalEvents += size;
      
      if (size >= MAX_BUFFER_SIZE) {
        overflowedBuffers++;
      }
    }

    return {
      totalBuffers: keys.length,
      totalEvents,
      overflowedBuffers,
    };
  } catch (error) {
    logger.error('Failed to get buffer stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      totalBuffers: 0,
      totalEvents: 0,
      overflowedBuffers: 0,
    };
  }
}

/**
 * Clean up expired buffers
 * Should be called periodically
 */
export async function cleanupExpiredBuffers(): Promise<number> {
  try {
    const redis = getRedisClient();
    
    // Get all buffer keys
    const keys = await redis.keys('event_buffer:*');
    let deletedCount = 0;

    // Check TTL and delete expired buffers
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      
      // If TTL is -1 (no expiry) or -2 (key doesn't exist), delete it
      if (ttl === -1 || ttl === -2) {
        await redis.del(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info('Cleaned up expired event buffers', { deletedCount });
    }

    return deletedCount;
  } catch (error) {
    logger.error('Failed to cleanup expired buffers', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return 0;
  }
}
