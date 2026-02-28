/**
 * Property-Based Tests for Data Ingestion Atomicity
 * 
 * **Validates: Requirements 2.4, 2.5, 2.6, 2.7, 2.9, 15.2, 15.3**
 * 
 * Property 2: Data Ingestion Atomicity
 * Tests that ingestion is atomic - either all updates succeed or none succeed
 */

import * as fc from 'fast-check';
import { getDbConnection } from '../config/database';
import { ingestInteractionWorkflow, ValidationError } from '../services/dataIngestionService';
import { InteractionData } from '../services/validationService';
import { mlAnalysisQueue } from '../config/queue';

// Mock the queue and websocket to avoid external dependencies
jest.mock('../config/queue', () => ({
  mlAnalysisQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
}));

jest.mock('../config/websocket', () => ({
  emitToOrganization: jest.fn(),
}));

describe('Property 2: Data Ingestion Atomicity', () => {
  let db: any;
  let testOrganizationId: string;
  let testCustomerId: string;

  beforeAll(async () => {
    db = getDbConnection();
    
    // Create test organization
    const [org] = await db('organizations')
      .insert({ name: 'Test Org for Atomicity' })
      .returning('id');
    testOrganizationId = org.id;

    // Create test customer
    const [customer] = await db('customers')
      .insert({
        organization_id: testOrganizationId,
        external_id: 'test-customer-atomicity',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        interaction_count: 0,
      })
      .returning('id');
    testCustomerId = customer.id;
  });

  afterAll(async () => {
    // Cleanup
    await db('customer_interactions').where({ organization_id: testOrganizationId }).del();
    await db('customers').where({ id: testCustomerId }).del();
    await db('organizations').where({ id: testOrganizationId }).del();
    await db.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property: Successful ingestion updates all related records atomically
   * 
   * For any valid interaction data:
   * - If interaction is stored in database
   * - Then customer.interaction_count is incremented
   * - And customer.last_seen_at is updated
   * - And ML analysis job is queued
   */
  test('Property: Successful ingestion is atomic - all updates succeed together', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('web', 'mobile', 'email', 'chat', 'phone'),
          eventType: fc.string({ minLength: 1, maxLength: 50 }),
          content: fc.string({ minLength: 1, maxLength: 500 }),
        }),
        async (data) => {
          // Get initial customer state
          const customerBefore = await db('customers')
            .select('interaction_count', 'last_seen_at')
            .where({ id: testCustomerId })
            .first();

          const interactionData: InteractionData = {
            customerId: testCustomerId,
            timestamp: new Date(),
            channel: data.channel as any,
            eventType: data.eventType,
            content: data.content,
            metadata: {},
          };

          // Ingest interaction
          const interactionId = await ingestInteractionWorkflow(interactionData);

          // Verify interaction was stored
          const interaction = await db('customer_interactions')
            .where({ id: interactionId })
            .first();
          
          expect(interaction).toBeDefined();
          expect(interaction.customer_id).toBe(testCustomerId);

          // Verify customer was updated atomically
          const customerAfter = await db('customers')
            .select('interaction_count', 'last_seen_at')
            .where({ id: testCustomerId })
            .first();

          expect(customerAfter.interaction_count).toBe(customerBefore.interaction_count + 1);
          expect(new Date(customerAfter.last_seen_at).getTime()).toBeGreaterThanOrEqual(
            new Date(customerBefore.last_seen_at).getTime()
          );

          // Verify ML job was queued
          expect(mlAnalysisQueue.add).toHaveBeenCalledWith(
            'analyze-sentiment',
            expect.objectContaining({
              interactionId,
              content: data.content,
              customerId: testCustomerId,
            }),
            expect.any(Object)
          );

          // Cleanup for next iteration
          await db('customer_interactions').where({ id: interactionId }).del();
          await db('customers')
            .where({ id: testCustomerId })
            .update({
              interaction_count: customerBefore.interaction_count,
              last_seen_at: customerBefore.last_seen_at,
            });
        }
      ),
      { numRuns: 20 } // Run 20 times to test atomicity
    );
  });

  /**
   * Property: Failed ingestion rolls back all changes
   * 
   * If validation fails or enrichment fails:
   * - No interaction is stored in database
   * - Customer.interaction_count remains unchanged
   * - Customer.last_seen_at remains unchanged
   * - No ML analysis job is queued
   */
  test('Property: Failed ingestion is atomic - no partial updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('web', 'mobile', 'email', 'chat', 'phone'),
          eventType: fc.constant(''), // Invalid: empty eventType
          content: fc.string({ minLength: 1, maxLength: 500 }),
        }),
        async (data) => {
          // Get initial customer state
          const customerBefore = await db('customers')
            .select('interaction_count', 'last_seen_at')
            .where({ id: testCustomerId })
            .first();

          const initialInteractionCount = await db('customer_interactions')
            .where({ customer_id: testCustomerId })
            .count('* as count')
            .first();

          const interactionData: InteractionData = {
            customerId: testCustomerId,
            timestamp: new Date(),
            channel: data.channel as any,
            eventType: data.eventType, // Invalid
            content: data.content,
            metadata: {},
          };

          // Attempt to ingest (should fail validation)
          let error: any;
          try {
            await ingestInteractionWorkflow(interactionData);
          } catch (e) {
            error = e;
          }

          // Verify validation failed
          expect(error).toBeInstanceOf(ValidationError);

          // Verify no interaction was stored
          const finalInteractionCount = await db('customer_interactions')
            .where({ customer_id: testCustomerId })
            .count('* as count')
            .first();
          
          expect(finalInteractionCount.count).toBe(initialInteractionCount.count);

          // Verify customer state unchanged
          const customerAfter = await db('customers')
            .select('interaction_count', 'last_seen_at')
            .where({ id: testCustomerId })
            .first();

          expect(customerAfter.interaction_count).toBe(customerBefore.interaction_count);
          expect(new Date(customerAfter.last_seen_at).getTime()).toBe(
            new Date(customerBefore.last_seen_at).getTime()
          );

          // Verify no ML job was queued
          expect(mlAnalysisQueue.add).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Transaction rollback on database failure
   * 
   * Simulates database transaction failure to verify rollback behavior
   */
  test('Property: Database transaction failure rolls back all changes', async () => {
    // Get initial customer state
    const customerBefore = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    const initialInteractionCount = await db('customer_interactions')
      .where({ customer_id: testCustomerId })
      .count('* as count')
      .first();

    // Create interaction with non-existent customer (will fail enrichment)
    const interactionData: InteractionData = {
      customerId: '00000000-0000-0000-0000-000000000000', // Non-existent
      timestamp: new Date(),
      channel: 'web',
      eventType: 'test-event',
      content: 'test content',
      metadata: {},
    };

    // Attempt to ingest (should fail)
    let error: any;
    try {
      await ingestInteractionWorkflow(interactionData);
    } catch (e) {
      error = e;
    }

    // Verify error occurred
    expect(error).toBeDefined();
    expect(error.message).toContain('Customer not found');

    // Verify no interaction was stored for our test customer
    const finalInteractionCount = await db('customer_interactions')
      .where({ customer_id: testCustomerId })
      .count('* as count')
      .first();
    
    expect(finalInteractionCount.count).toBe(initialInteractionCount.count);

    // Verify test customer state unchanged
    const customerAfter = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    expect(customerAfter.interaction_count).toBe(customerBefore.interaction_count);
  });

  /**
   * Property: Message queue failure doesn't affect database transaction
   * 
   * Even if ML job queueing fails, the database transaction should succeed
   * (queue operations are outside the transaction)
   */
  test('Property: Queue failure does not rollback database transaction', async () => {
    // Mock queue failure
    (mlAnalysisQueue.add as jest.Mock).mockRejectedValueOnce(new Error('Queue unavailable'));

    const customerBefore = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    const interactionData: InteractionData = {
      customerId: testCustomerId,
      timestamp: new Date(),
      channel: 'web',
      eventType: 'test-event',
      content: 'test content',
      metadata: {},
    };

    // Ingest interaction (queue will fail but transaction should succeed)
    let interactionId: string | undefined;
    try {
      interactionId = await ingestInteractionWorkflow(interactionData);
    } catch (error) {
      // Queue failure might propagate, but database should be committed
    }

    // Even if queue fails, database transaction should have succeeded
    // Verify customer was updated
    const customerAfter = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    // Customer should be updated (transaction succeeded)
    expect(customerAfter.interaction_count).toBe(customerBefore.interaction_count + 1);

    // Cleanup
    if (interactionId) {
      await db('customer_interactions').where({ id: interactionId }).del();
      await db('customers')
        .where({ id: testCustomerId })
        .update({
          interaction_count: customerBefore.interaction_count,
          last_seen_at: customerBefore.last_seen_at,
        });
    }

    // Restore mock
    (mlAnalysisQueue.add as jest.Mock).mockResolvedValue({ id: 'mock-job-id' });
  });
});
