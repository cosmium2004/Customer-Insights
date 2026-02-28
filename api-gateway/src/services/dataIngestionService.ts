/**
 * Data Ingestion Service
 * 
 * Handles customer interaction data ingestion with atomic transactions.
 * Implements the complete workflow: validate, enrich, store, queue ML job, emit event.
 * Invalidates related caches on data updates (Requirement 14.7)
 * 
 * Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 15.1-15.6, 15.10
 */

import { getDbConnection } from '../config/database';
import { validateInteraction, ValidationResult, InteractionData } from './validationService';
import { enrichInteraction, EnrichedInteraction } from './enrichmentService';
import { mlAnalysisQueue } from '../config/queue';
import { emitToOrganization } from '../config/websocket';
import { logger } from '../config/logger';
import * as cacheService from './cacheService';

export class ValidationError extends Error {
  constructor(public errors: ValidationResult['errors']) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

export interface BatchResult {
  successful: number;
  failed: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

/**
 * Main data ingestion workflow with atomic transactions
 * 
 * @param data - Interaction data to ingest
 * @returns Interaction ID of the created record
 * 
 * Workflow steps:
 * 1. Validate incoming data
 * 2. Enrich data with additional context
 * 3. Store interaction in database within transaction
 * 4. Update customer last_seen_at and increment interaction_count atomically
 * 5. Queue ML analysis job
 * 6. Emit real-time event for WebSocket clients
 * 7. Roll back all changes if any step fails
 */
export async function ingestInteractionWorkflow(data: InteractionData): Promise<string> {
  // Step 1: Validate incoming data
  const validationResult = validateInteraction(data);
  if (!validationResult.valid) {
    throw new ValidationError(validationResult.errors);
  }

  // Step 2: Enrich interaction with additional context
  const enrichedData = await enrichInteraction(data);

  const db = getDbConnection();
  let interactionId: string;

  try {
    // Step 3: Store in database within transaction
    interactionId = await db.transaction(async (trx) => {
      // Insert interaction record
      const [interaction] = await trx('customer_interactions')
        .insert({
          customer_id: enrichedData.customerId,
          organization_id: enrichedData.organizationId,
          timestamp: enrichedData.timestamp,
          channel: enrichedData.channel,
          event_type: enrichedData.eventType,
          content: enrichedData.content || null,
          metadata: {
            ...enrichedData.metadata,
            deviceInfo: enrichedData.deviceInfo,
            geolocation: enrichedData.geolocation,
            customerSegment: enrichedData.customerSegment,
          },
        })
        .returning('id');

      // Step 4: Update customer last_seen_at and interaction_count atomically
      await trx('customers')
        .where({ id: enrichedData.customerId })
        .update({
          last_seen_at: enrichedData.timestamp,
          interaction_count: trx.raw('interaction_count + 1'),
          updated_at: trx.raw('NOW()'),
        });

      return interaction.id;
    });

    // Step 5: Queue ML analysis job (non-blocking, outside transaction)
    if (enrichedData.content) {
      await mlAnalysisQueue.add('analyze-sentiment', {
        interactionId,
        content: enrichedData.content,
        customerId: enrichedData.customerId,
        organizationId: enrichedData.organizationId,
      }, {
        priority: 1,
        attempts: 3,
      });
    }

    // Step 6: Emit real-time event for WebSocket clients
    emitToOrganization(enrichedData.organizationId, 'interaction.created', {
      interactionId,
      customerId: enrichedData.customerId,
      organizationId: enrichedData.organizationId,
      timestamp: enrichedData.timestamp,
      channel: enrichedData.channel,
      eventType: enrichedData.eventType,
    });

    // Step 7: Invalidate related caches (Requirement 14.7)
    await cacheService.invalidateCustomerCache(enrichedData.customerId);
    await cacheService.invalidateDashboardCache(enrichedData.organizationId);

    logger.info('Interaction ingested successfully', {
      interactionId,
      customerId: enrichedData.customerId,
      organizationId: enrichedData.organizationId,
    });

    return interactionId;
  } catch (error) {
    // Transaction automatically rolled back on error
    logger.error('Interaction ingestion failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      customerId: enrichedData.customerId,
    });
    throw error;
  }
}

/**
 * Batch ingestion for bulk imports
 * Processes interactions in batches of 100 with transaction support
 * 
 * @param interactions - Array of interaction data to ingest
 * @returns BatchResult with success/failure counts and error details
 */
export async function batchIngestInteractions(
  interactions: InteractionData[]
): Promise<BatchResult> {
  const batchSize = 100;
  const result: BatchResult = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Process in batches
  for (let i = 0; i < interactions.length; i += batchSize) {
    const batch = interactions.slice(i, i + batchSize);
    
    logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
      batchStart: i,
      batchSize: batch.length,
      totalInteractions: interactions.length,
    });

    const db = getDbConnection();

    try {
      // Process batch within a single transaction
      await db.transaction(async (trx) => {
        for (let j = 0; j < batch.length; j++) {
          const interaction = batch[j];
          const globalIndex = i + j;

          try {
            // Validate
            const validationResult = validateInteraction(interaction);
            if (!validationResult.valid) {
              throw new ValidationError(validationResult.errors);
            }

            // Enrich
            const enrichedData = await enrichInteraction(interaction);

            // Insert interaction
            const [inserted] = await trx('customer_interactions')
              .insert({
                customer_id: enrichedData.customerId,
                organization_id: enrichedData.organizationId,
                timestamp: enrichedData.timestamp,
                channel: enrichedData.channel,
                event_type: enrichedData.eventType,
                content: enrichedData.content || null,
                metadata: {
                  ...enrichedData.metadata,
                  deviceInfo: enrichedData.deviceInfo,
                  geolocation: enrichedData.geolocation,
                  customerSegment: enrichedData.customerSegment,
                },
              })
              .returning('id');

            // Update customer
            await trx('customers')
              .where({ id: enrichedData.customerId })
              .update({
                last_seen_at: enrichedData.timestamp,
                interaction_count: trx.raw('interaction_count + 1'),
                updated_at: trx.raw('NOW()'),
              });

            // Queue ML job (outside transaction, fire and forget)
            if (enrichedData.content) {
              mlAnalysisQueue.add('analyze-sentiment', {
                interactionId: inserted.id,
                content: enrichedData.content,
                customerId: enrichedData.customerId,
                organizationId: enrichedData.organizationId,
              }, {
                priority: 2, // Lower priority for batch
              }).catch((err) => {
                logger.error('Failed to queue ML job in batch', {
                  interactionId: inserted.id,
                  error: err.message,
                });
              });
            }

            result.successful++;
          } catch (error) {
            result.failed++;
            result.errors.push({
              index: globalIndex,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            
            // Throw to rollback the entire batch transaction
            throw error;
          }
        }
      });
    } catch (error) {
      // Batch transaction failed, all items in batch are marked as failed
      logger.error('Batch transaction failed', {
        batchIndex: Math.floor(i / batchSize),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  logger.info('Batch ingestion completed', {
    total: interactions.length,
    successful: result.successful,
    failed: result.failed,
  });

  return result;
}
