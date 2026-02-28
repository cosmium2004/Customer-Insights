/**
 * Integration Tests for Data Ingestion
 * 
 * Tests end-to-end ingestion flow from API to database
 * **Validates: Requirements 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9**
 */

import request from 'supertest';
import app from '../index';
import { getDbConnection } from '../config/database';
import { mlAnalysisQueue } from '../config/queue';
import { emitToOrganization } from '../config/websocket';
import jwt from 'jsonwebtoken';

// Mock the queue and websocket
jest.mock('../config/queue', () => ({
  mlAnalysisQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
}));

jest.mock('../config/websocket', () => ({
  emitToOrganization: jest.fn(),
  initializeWebSocket: jest.fn(),
  getWebSocketServer: jest.fn(),
}));

describe('Data Ingestion Integration Tests', () => {
  let db: any;
  let testOrganizationId: string;
  let testCustomerId: string;
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    db = getDbConnection();

    // Create test organization
    const [org] = await db('organizations')
      .insert({ name: 'Test Org for Integration' })
      .returning('id');
    testOrganizationId = org.id;

    // Create test user
    const [user] = await db('users')
      .insert({
        email: 'test-integration@example.com',
        password_hash: 'dummy-hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'admin',
        organization_id: testOrganizationId,
      })
      .returning('id');
    testUserId = user.id;

    // Generate auth token
    authToken = jwt.sign(
      {
        userId: testUserId,
        email: 'test-integration@example.com',
        role: 'admin',
        organizationId: testOrganizationId,
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test customer
    const [customer] = await db('customers')
      .insert({
        organization_id: testOrganizationId,
        external_id: 'test-customer-integration',
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
    await db('users').where({ id: testUserId }).del();
    await db('organizations').where({ id: testOrganizationId }).del();
    await db.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test: End-to-end ingestion flow from API to database
   * Requirements: 2.1, 2.4
   */
  test('POST /api/data/ingest - successful end-to-end ingestion', async () => {
    const interactionData = {
      customerId: testCustomerId,
      timestamp: new Date().toISOString(),
      channel: 'web',
      eventType: 'page_view',
      content: 'User viewed product page',
      metadata: {
        url: '/products/123',
        device: 'desktop',
      },
    };

    const response = await request(app)
      .post('/api/data/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .send(interactionData)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      interactionId: expect.any(String),
      message: 'Interaction ingested successfully',
    });

    // Verify interaction was stored in database
    const interaction = await db('customer_interactions')
      .where({ id: response.body.interactionId })
      .first();

    expect(interaction).toBeDefined();
    expect(interaction.customer_id).toBe(testCustomerId);
    expect(interaction.channel).toBe('web');
    expect(interaction.event_type).toBe('page_view');
    expect(interaction.content).toBe('User viewed product page');

    // Cleanup
    await db('customer_interactions').where({ id: response.body.interactionId }).del();
  });

  /**
   * Test: Customer record is updated atomically
   * Requirements: 2.5, 2.6
   */
  test('POST /api/data/ingest - customer record updated atomically', async () => {
    // Get initial customer state
    const customerBefore = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    const interactionData = {
      customerId: testCustomerId,
      timestamp: new Date().toISOString(),
      channel: 'mobile',
      eventType: 'button_click',
      content: 'User clicked add to cart',
      metadata: {},
    };

    const response = await request(app)
      .post('/api/data/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .send(interactionData)
      .expect(201);

    // Verify customer was updated
    const customerAfter = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    expect(customerAfter.interaction_count).toBe(customerBefore.interaction_count + 1);
    expect(new Date(customerAfter.last_seen_at).getTime()).toBeGreaterThanOrEqual(
      new Date(customerBefore.last_seen_at).getTime()
    );

    // Cleanup
    await db('customer_interactions').where({ id: response.body.interactionId }).del();
    await db('customers')
      .where({ id: testCustomerId })
      .update({
        interaction_count: customerBefore.interaction_count,
        last_seen_at: customerBefore.last_seen_at,
      });
  });

  /**
   * Test: ML analysis job is queued
   * Requirements: 2.7
   */
  test('POST /api/data/ingest - ML analysis job queued', async () => {
    const interactionData = {
      customerId: testCustomerId,
      timestamp: new Date().toISOString(),
      channel: 'chat',
      eventType: 'message',
      content: 'I love this product!',
      metadata: {},
    };

    const response = await request(app)
      .post('/api/data/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .send(interactionData)
      .expect(201);

    // Verify ML job was queued
    expect(mlAnalysisQueue.add).toHaveBeenCalledWith(
      'analyze-sentiment',
      expect.objectContaining({
        interactionId: response.body.interactionId,
        content: 'I love this product!',
        customerId: testCustomerId,
        organizationId: testOrganizationId,
      }),
      expect.any(Object)
    );

    // Cleanup
    await db('customer_interactions').where({ id: response.body.interactionId }).del();
  });

  /**
   * Test: WebSocket event is emitted
   * Requirements: 2.8
   */
  test('POST /api/data/ingest - WebSocket event emitted', async () => {
    const interactionData = {
      customerId: testCustomerId,
      timestamp: new Date().toISOString(),
      channel: 'email',
      eventType: 'email_opened',
      content: 'User opened promotional email',
      metadata: {},
    };

    const response = await request(app)
      .post('/api/data/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .send(interactionData)
      .expect(201);

    // Verify WebSocket event was emitted
    expect(emitToOrganization).toHaveBeenCalledWith(
      testOrganizationId,
      'interaction.created',
      expect.objectContaining({
        interactionId: response.body.interactionId,
        customerId: testCustomerId,
        organizationId: testOrganizationId,
      })
    );

    // Cleanup
    await db('customer_interactions').where({ id: response.body.interactionId }).del();
  });

  /**
   * Test: Transaction rollback on failure
   * Requirements: 2.9
   */
  test('POST /api/data/ingest - transaction rollback on validation failure', async () => {
    // Get initial customer state
    const customerBefore = await db('customers')
      .select('interaction_count', 'last_seen_at')
      .where({ id: testCustomerId })
      .first();

    const initialInteractionCount = await db('customer_interactions')
      .where({ customer_id: testCustomerId })
      .count('* as count')
      .first();

    // Send invalid data (empty eventType)
    const invalidData = {
      customerId: testCustomerId,
      timestamp: new Date().toISOString(),
      channel: 'web',
      eventType: '', // Invalid
      content: 'Test content',
      metadata: {},
    };

    const response = await request(app)
      .post('/api/data/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .send(invalidData)
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'eventType',
          message: expect.any(String),
        }),
      ])
    );

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

    // Verify no WebSocket event was emitted
    expect(emitToOrganization).not.toHaveBeenCalled();
  });

  /**
   * Test: Batch ingestion endpoint
   * Requirements: 2.11, 15.1-15.6
   */
  test('POST /api/data/ingest/batch - successful batch processing', async () => {
    const interactions = [
      {
        customerId: testCustomerId,
        timestamp: new Date().toISOString(),
        channel: 'web',
        eventType: 'page_view',
        content: 'Viewed homepage',
        metadata: {},
      },
      {
        customerId: testCustomerId,
        timestamp: new Date().toISOString(),
        channel: 'mobile',
        eventType: 'button_click',
        content: 'Clicked search',
        metadata: {},
      },
      {
        customerId: testCustomerId,
        timestamp: new Date().toISOString(),
        channel: 'chat',
        eventType: 'message',
        content: 'Asked about pricing',
        metadata: {},
      },
    ];

    const response = await request(app)
      .post('/api/data/ingest/batch')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ interactions })
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      summary: {
        total: 3,
        successful: 3,
        failed: 0,
      },
    });

    // Verify interactions were stored
    const storedInteractions = await db('customer_interactions')
      .where({ customer_id: testCustomerId })
      .whereIn('event_type', ['page_view', 'button_click', 'message'])
      .orderBy('created_at', 'desc')
      .limit(3);

    expect(storedInteractions).toHaveLength(3);

    // Cleanup
    await db('customer_interactions')
      .where({ customer_id: testCustomerId })
      .whereIn('event_type', ['page_view', 'button_click', 'message'])
      .del();
  });

  /**
   * Test: Batch ingestion with partial failures
   * Requirements: 15.4, 15.5
   */
  test('POST /api/data/ingest/batch - handles partial failures', async () => {
    const interactions = [
      {
        customerId: testCustomerId,
        timestamp: new Date().toISOString(),
        channel: 'web',
        eventType: 'valid_event',
        content: 'Valid interaction',
        metadata: {},
      },
      {
        customerId: testCustomerId,
        timestamp: new Date().toISOString(),
        channel: 'web',
        eventType: '', // Invalid
        content: 'Invalid interaction',
        metadata: {},
      },
    ];

    const response = await request(app)
      .post('/api/data/ingest/batch')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ interactions })
      .expect(200);

    expect(response.body.summary.total).toBe(2);
    expect(response.body.summary.failed).toBeGreaterThan(0);
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors.length).toBeGreaterThan(0);

    // Cleanup any successful insertions
    await db('customer_interactions')
      .where({ customer_id: testCustomerId, event_type: 'valid_event' })
      .del();
  });

  /**
   * Test: Authentication required
   * Requirements: 7.6
   */
  test('POST /api/data/ingest - requires authentication', async () => {
    const interactionData = {
      customerId: testCustomerId,
      timestamp: new Date().toISOString(),
      channel: 'web',
      eventType: 'test_event',
      content: 'Test content',
      metadata: {},
    };

    await request(app)
      .post('/api/data/ingest')
      .send(interactionData)
      .expect(401);
  });

  /**
   * Test: Invalid customer ID
   * Requirements: 2.2
   */
  test('POST /api/data/ingest - rejects non-existent customer', async () => {
    const interactionData = {
      customerId: '00000000-0000-0000-0000-000000000000',
      timestamp: new Date().toISOString(),
      channel: 'web',
      eventType: 'test_event',
      content: 'Test content',
      metadata: {},
    };

    const response = await request(app)
      .post('/api/data/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .send(interactionData)
      .expect(400);

    expect(response.body.error).toBe('Invalid customer');
  });
});
