/**
 * Data Ingestion Routes
 * 
 * Handles customer interaction data ingestion endpoints
 * Requirements: 2.1, 2.4, 7.6, 7.13, 15.1-15.6, 15.10
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { 
  ingestInteractionWorkflow, 
  batchIngestInteractions,
  ValidationError 
} from '../services/dataIngestionService';
import { InteractionData } from '../services/validationService';
import { logger } from '../config/logger';

const router = Router();

/**
 * POST /api/data/ingest
 * 
 * Ingest a single customer interaction
 * Requires authentication
 * 
 * Request body:
 * - customerId: string (UUID)
 * - timestamp: string (ISO date)
 * - channel: 'web' | 'mobile' | 'email' | 'chat' | 'phone'
 * - eventType: string
 * - content: string (optional, required for text channels)
 * - metadata: object (optional)
 * 
 * Responses:
 * - 201: Interaction created successfully
 * - 400: Validation errors
 * - 401: Unauthorized
 * - 500: Internal server error
 */
router.post('/ingest', authenticate, async (req: Request, res: Response) => {
  try {
    const interactionData: InteractionData = {
      customerId: req.body.customerId,
      timestamp: new Date(req.body.timestamp),
      channel: req.body.channel,
      eventType: req.body.eventType,
      content: req.body.content,
      metadata: req.body.metadata || {},
    };

    const interactionId = await ingestInteractionWorkflow(interactionData);

    res.status(201).json({
      success: true,
      interactionId,
      message: 'Interaction ingested successfully',
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Validation failed for interaction ingestion', {
        errors: error.errors,
        userId: (req as any).user?.userId,
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    if (error instanceof Error && error.message.includes('Customer not found')) {
      logger.warn('Customer not found during ingestion', {
        customerId: req.body.customerId,
        userId: (req as any).user?.userId,
      });
      
      return res.status(400).json({
        error: 'Invalid customer',
        message: error.message,
      });
    }

    logger.error('Interaction ingestion failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: (req as any).user?.userId,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to ingest interaction',
    });
  }
});

/**
 * POST /api/data/ingest/batch
 * 
 * Ingest multiple customer interactions in batch
 * Processes in batches of 100 with transaction support
 * Requires authentication
 * 
 * Request body:
 * - interactions: Array<InteractionData>
 * 
 * Responses:
 * - 200: Batch processing completed (includes success/failure counts)
 * - 400: Invalid request format
 * - 401: Unauthorized
 * - 500: Internal server error
 */
router.post('/ingest/batch', authenticate, async (req: Request, res: Response) => {
  try {
    const { interactions } = req.body;

    // Validate request format
    if (!Array.isArray(interactions)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'interactions must be an array',
      });
    }

    if (interactions.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'interactions array cannot be empty',
      });
    }

    logger.info('Starting batch ingestion', {
      count: interactions.length,
      userId: (req as any).user?.userId,
    });

    // Convert timestamps to Date objects
    const interactionData: InteractionData[] = interactions.map((item: any) => ({
      customerId: item.customerId,
      timestamp: new Date(item.timestamp),
      channel: item.channel,
      eventType: item.eventType,
      content: item.content,
      metadata: item.metadata || {},
    }));

    const result = await batchIngestInteractions(interactionData);

    logger.info('Batch ingestion completed', {
      total: interactions.length,
      successful: result.successful,
      failed: result.failed,
      userId: (req as any).user?.userId,
    });

    res.status(200).json({
      success: true,
      summary: {
        total: interactions.length,
        successful: result.successful,
        failed: result.failed,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    logger.error('Batch ingestion failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: (req as any).user?.userId,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process batch ingestion',
    });
  }
});

export default router;
