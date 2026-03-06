/**
 * Integration Tests for WebSocket Functionality
 * 
 * Tests WebSocket connection, event emission, filtering, reconnection, and buffering
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { initializeWebSocket } from '../config/websocket';
import { emitInteractionCreated, emitSentimentAnalyzed } from '../services/websocketEventService';
import * as eventBufferService from '../services/eventBufferService';

describe('WebSocket Integration Tests', () => {
  let httpServer: any;
  let serverPort: number;
  let client: ClientSocket;

  // Generate JWT token for testing
  function generateTestToken(userId: string, organizationId: string): string {
    return jwt.sign(
      {
        userId,
        email: `${userId}@test.com`,
        role: 'analyst',
        permissions: ['read', 'write'],
        organizationId,
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  }

  beforeAll((done) => {
    // Create HTTP server
    const app = express();
    httpServer = createServer(app);

    // Initialize WebSocket server
    initializeWebSocket(httpServer);

    // Start server on random port
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    // Close server
    httpServer.close(() => {
      // Give time for cleanup
      setTimeout(done, 100);
    });
  }, 10000);

  afterEach(() => {
    // Disconnect client after each test
    if (client && client.connected) {
      client.disconnect();
    }
  });

  /**
   * Test: WebSocket connection establishment (Requirement 6.1)
   */
  test('should establish WebSocket connection with valid JWT token', async () => {
    const token = generateTestToken('test-user', 'test-org');

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    expect(client.connected).toBe(true);
  });

  /**
   * Test: WebSocket connection rejection without token
   */
  test('should reject WebSocket connection without JWT token', async () => {
    client = ioClient(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
    });

    // Wait for connection error
    await expect(
      new Promise<void>((resolve, reject) => {
        client.on('connect', () => reject(new Error('Should not connect')));
        client.on('connect_error', (error) => resolve());
        setTimeout(() => reject(new Error('Timeout')), 5000);
      })
    ).resolves.toBeUndefined();

    expect(client.connected).toBe(false);
  });

  /**
   * Test: Event emission after interaction creation (Requirement 6.2)
   */
  test('should emit event after interaction creation', async () => {
    const organizationId = 'test-org-123';
    const token = generateTestToken('test-user', organizationId);

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Set up event listener
    const eventReceived = new Promise<any>((resolve) => {
      client.on('event', (data) => {
        resolve(data);
      });
    });

    // Emit interaction created event
    await emitInteractionCreated({
      interactionId: 'interaction-123',
      customerId: 'customer-123',
      organizationId,
      timestamp: new Date(),
      channel: 'web',
      eventType: 'page_view',
    });

    // Wait for event with timeout
    const receivedEvent = await Promise.race([
      eventReceived,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Event not received')), 2000)
      ),
    ]);

    expect(receivedEvent).toBeDefined();
    expect(receivedEvent.type).toBe('interaction.created');
    expect(receivedEvent.interactionId).toBe('interaction-123');
  });

  /**
   * Test: Event filtering by organization (Requirement 6.4)
   */
  test('should filter events by organization', async () => {
    const org1 = 'org-1';
    const org2 = 'org-2';

    // Create two clients in different organizations
    const token1 = generateTestToken('user-1', org1);
    const token2 = generateTestToken('user-2', org2);

    const client1 = ioClient(`http://localhost:${serverPort}`, {
      auth: { token: token1 },
      transports: ['websocket'],
    });

    const client2 = ioClient(`http://localhost:${serverPort}`, {
      auth: { token: token2 },
      transports: ['websocket'],
    });

    // Wait for both connections
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        client1.on('connect', () => resolve());
        client1.on('connect_error', (error) => reject(error));
        setTimeout(() => reject(new Error('Client1 timeout')), 5000);
      }),
      new Promise<void>((resolve, reject) => {
        client2.on('connect', () => resolve());
        client2.on('connect_error', (error) => reject(error));
        setTimeout(() => reject(new Error('Client2 timeout')), 5000);
      }),
    ]);

    // Track events received by each client
    let client1Received = false;
    let client2Received = false;

    client1.on('event', () => {
      client1Received = true;
    });

    client2.on('event', () => {
      client2Received = true;
    });

    // Emit event to org1
    await emitInteractionCreated({
      interactionId: 'interaction-123',
      customerId: 'customer-123',
      organizationId: org1,
      timestamp: new Date(),
      channel: 'web',
      eventType: 'test-event',
    });

    // Wait for event delivery
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify only client1 received the event
    expect(client1Received).toBe(true);
    expect(client2Received).toBe(false);

    // Cleanup
    client1.disconnect();
    client2.disconnect();
  });

  /**
   * Test: Reconnection after disconnect (Requirement 6.6)
   */
  test('should reconnect after disconnect', async () => {
    const token = generateTestToken('test-user', 'test-org');

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 100,
    });

    // Wait for initial connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    expect(client.connected).toBe(true);

    // Set up reconnection listener before disconnecting
    const reconnectPromise = new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      setTimeout(() => reject(new Error('Reconnection timeout')), 5000);
    });

    // Disconnect
    client.disconnect();
    expect(client.connected).toBe(false);

    // Manually reconnect (since we disconnected manually)
    client.connect();

    // Wait for reconnection
    await reconnectPromise;

    expect(client.connected).toBe(true);
  });

  /**
   * Test: Event buffering and sync (Requirement 6.7)
   */
  test('should sync missed events on reconnection', async () => {
    const userId = 'test-user-sync';
    const organizationId = 'test-org-sync';
    const token = generateTestToken(userId, organizationId);

    try {
      // Buffer some events for the user
      await eventBufferService.bufferEvent(userId, {
        eventId: 'event-1',
        type: 'interaction.created',
        timestamp: new Date(),
        data: { interactionId: 'int-1' },
      });

      await eventBufferService.bufferEvent(userId, {
        eventId: 'event-2',
        type: 'sentiment.analyzed',
        timestamp: new Date(),
        data: { interactionId: 'int-2' },
      });
    } catch (error) {
      // Skip test if Redis is not available
      console.warn('Skipping test: Redis not available');
      return;
    }

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    // Set up event sync listener
    const syncReceived = new Promise<any>((resolve) => {
      client.on('events-sync', (data) => {
        resolve(data);
      });
    });

    // Request event sync
    client.emit('sync-events', { clientId: userId });

    // Wait for sync response
    const syncData = await Promise.race([
      syncReceived,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout')), 5000)
      ),
    ]);

    expect(syncData).toBeDefined();
    expect(syncData.events).toHaveLength(2);
    expect(syncData.count).toBe(2);
  }, 15000);

  /**
   * Test: Buffer overflow handling (Requirement 6.8)
   */
  test('should handle buffer overflow', async () => {
    const userId = 'test-user-overflow';
    const organizationId = 'test-org-overflow';
    const token = generateTestToken(userId, organizationId);

    try {
      // Buffer more than 100 events to trigger overflow
      for (let i = 0; i < 105; i++) {
        await eventBufferService.bufferEvent(userId, {
          eventId: `event-${i}`,
          type: 'interaction.created',
          timestamp: new Date(),
          data: { interactionId: `int-${i}` },
        });
      }
    } catch (error) {
      // Skip test if Redis is not available
      console.warn('Skipping test: Redis not available');
      return;
    }

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    // Set up buffer overflow listener
    const overflowReceived = new Promise<any>((resolve) => {
      client.on('buffer-overflow', (data) => {
        resolve(data);
      });
    });

    // Request event sync
    client.emit('sync-events', { clientId: userId });

    // Wait for overflow notification
    const overflowData = await Promise.race([
      overflowReceived,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Overflow notification timeout')), 5000)
      ),
    ]);

    expect(overflowData).toBeDefined();
    expect(overflowData.message).toContain('overflowed');
  }, 15000);

  /**
   * Test: Sentiment analyzed event emission (Requirement 6.3)
   */
  test('should emit sentiment.analyzed event', async () => {
    const organizationId = 'test-org-sentiment';
    const token = generateTestToken('test-user', organizationId);

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Set up event listener
    const eventReceived = new Promise<any>((resolve) => {
      client.on('event', (data) => {
        resolve(data);
      });
    });

    // Emit sentiment analyzed event
    await emitSentimentAnalyzed({
      interactionId: 'interaction-456',
      customerId: 'customer-456',
      organizationId,
      sentiment: {
        label: 'positive',
        positive: 0.8,
        negative: 0.1,
        neutral: 0.1,
      },
      confidence: 0.8,
    });

    // Wait for event
    const receivedEvent = await Promise.race([
      eventReceived,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Event not received')), 2000)
      ),
    ]);

    expect(receivedEvent).toBeDefined();
    expect(receivedEvent.type).toBe('sentiment.analyzed');
    expect(receivedEvent.interactionId).toBe('interaction-456');
    expect(receivedEvent.sentiment.label).toBe('positive');
  });

  /**
   * Test: Heartbeat ping/pong (Requirement 6.5)
   */
  test('should maintain connection with heartbeat', async () => {
    const token = generateTestToken('test-user', 'test-org');

    client = ioClient(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Wait for 35 seconds to ensure heartbeat occurs (30s interval + buffer)
    await new Promise((resolve) => setTimeout(resolve, 35000));

    // Connection should still be alive
    expect(client.connected).toBe(true);
  }, 40000); // 40 second test timeout
});
