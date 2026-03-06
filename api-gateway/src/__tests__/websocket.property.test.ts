/**
 * Property-Based Tests for Real-time Event Delivery
 * 
 * **Property 10: Real-time Event Delivery**
 * **Validates: Requirements 2.8, 6.2, 6.3, 6.4**
 * 
 * Tests that events are delivered to relevant clients within 1 second
 * Tests with WebSocket clients, latency measurement, network delay simulation
 */

import * as fc from 'fast-check';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { initializeWebSocket } from '../config/websocket';
import { emitInteractionCreated, emitSentimentAnalyzed } from '../services/websocketEventService';

describe('Property 10: Real-time Event Delivery', () => {
  let httpServer: any;
  let serverPort: number;
  let clients: ClientSocket[] = [];

  // Generate JWT token for testing
  function generateTestToken(userId: string, organizationId: string): string {
    return jwt.sign(
      {
        userId,
        email: `user-${userId}@test.com`,
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
    // Close all client connections
    clients.forEach((client) => {
      if (client.connected) {
        client.disconnect();
      }
    });

    // Close server
    httpServer.close(done);
  });

  afterEach(() => {
    // Disconnect all clients after each test
    clients.forEach((client) => {
      if (client.connected) {
        client.disconnect();
      }
    });
    clients = [];
  });

  /**
   * Property: Events are delivered to clients in the same organization within 1 second
   */
  test('Property: interaction.created events are delivered within 1 second to same organization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.uuid(), // customerId
        fc.uuid(), // interactionId
        fc.constantFrom('web', 'mobile', 'email', 'chat', 'phone'), // channel
        fc.string({ minLength: 1, maxLength: 50 }), // eventType
        async (organizationId, customerId, interactionId, channel, eventType) => {
          // Create authenticated client
          const token = generateTestToken('test-user-1', organizationId);
          const client = ioClient(`http://localhost:${serverPort}`, {
            auth: { token },
            transports: ['websocket'],
          });

          clients.push(client);

          // Wait for connection
          await new Promise<void>((resolve, reject) => {
            client.on('connect', () => resolve());
            client.on('connect_error', (error) => reject(error));
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
          });

          // Set up event listener with timestamp tracking
          const eventReceived = new Promise<number>((resolve) => {
            client.on('event', (data) => {
              const receiveTime = Date.now();
              resolve(receiveTime);
            });
          });

          // Emit event and track send time
          const sendTime = Date.now();
          await emitInteractionCreated({
            interactionId,
            customerId,
            organizationId,
            timestamp: new Date(),
            channel,
            eventType,
          });

          // Wait for event with timeout
          const receiveTime = await Promise.race([
            eventReceived,
            new Promise<number>((_, reject) =>
              setTimeout(() => reject(new Error('Event not received within timeout')), 2000)
            ),
          ]);

          // Calculate latency
          const latency = receiveTime - sendTime;

          // Verify event delivered within 1 second (Requirement 6.2)
          expect(latency).toBeLessThan(1000);

          client.disconnect();
        }
      ),
      {
        numRuns: 50, // Run 50 test cases
        timeout: 10000, // 10 second timeout per test
      }
    );
  }, 60000); // 60 second test timeout

  /**
   * Property: Events are NOT delivered to clients in different organizations
   */
  test('Property: events are filtered by organization (Requirement 6.4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId1
        fc.uuid(), // organizationId2
        fc.uuid(), // customerId
        fc.uuid(), // interactionId
        async (organizationId1, organizationId2, customerId, interactionId) => {
          // Ensure organizations are different
          fc.pre(organizationId1 !== organizationId2);

          // Create two clients in different organizations
          const token1 = generateTestToken('user-1', organizationId1);
          const token2 = generateTestToken('user-2', organizationId2);

          const client1 = ioClient(`http://localhost:${serverPort}`, {
            auth: { token: token1 },
            transports: ['websocket'],
          });

          const client2 = ioClient(`http://localhost:${serverPort}`, {
            auth: { token: token2 },
            transports: ['websocket'],
          });

          clients.push(client1, client2);

          // Wait for both connections
          await Promise.all([
            new Promise<void>((resolve, reject) => {
              client1.on('connect', () => resolve());
              client1.on('connect_error', (error) => reject(error));
              setTimeout(() => reject(new Error('Client1 connection timeout')), 5000);
            }),
            new Promise<void>((resolve, reject) => {
              client2.on('connect', () => resolve());
              client2.on('connect_error', (error) => reject(error));
              setTimeout(() => reject(new Error('Client2 connection timeout')), 5000);
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

          // Emit event to organizationId1
          await emitInteractionCreated({
            interactionId,
            customerId,
            organizationId: organizationId1,
            timestamp: new Date(),
            channel: 'web',
            eventType: 'test-event',
          });

          // Wait for event delivery
          await new Promise((resolve) => setTimeout(resolve, 200));

          // Verify only client1 received the event (Requirement 6.4)
          expect(client1Received).toBe(true);
          expect(client2Received).toBe(false);

          client1.disconnect();
          client2.disconnect();
        }
      ),
      {
        numRuns: 30,
        timeout: 10000,
      }
    );
  }, 60000);

  /**
   * Property: sentiment.analyzed events are delivered within 1 second
   */
  test('Property: sentiment.analyzed events are delivered within 1 second (Requirement 6.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.uuid(), // customerId
        fc.uuid(), // interactionId
        fc.double({ min: 0, max: 1 }), // positive score
        fc.double({ min: 0, max: 1 }), // negative score
        fc.double({ min: 0, max: 1 }), // neutral score
        async (organizationId, customerId, interactionId, positive, negative, neutral) => {
          // Normalize scores to sum to 1
          const total = positive + negative + neutral;
          const normalizedScores = {
            positive: positive / total,
            negative: negative / total,
            neutral: neutral / total,
          };

          const sentiment = Object.entries(normalizedScores).reduce((a, b) =>
            a[1] > b[1] ? a : b
          )[0] as 'positive' | 'negative' | 'neutral';

          const confidence = Math.max(normalizedScores.positive, normalizedScores.negative, normalizedScores.neutral);

          // Create authenticated client
          const token = generateTestToken('test-user', organizationId);
          const client = ioClient(`http://localhost:${serverPort}`, {
            auth: { token },
            transports: ['websocket'],
          });

          clients.push(client);

          // Wait for connection
          await new Promise<void>((resolve, reject) => {
            client.on('connect', () => resolve());
            client.on('connect_error', (error) => reject(error));
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
          });

          // Set up event listener
          const eventReceived = new Promise<number>((resolve) => {
            client.on('event', (data) => {
              const receiveTime = Date.now();
              resolve(receiveTime);
            });
          });

          // Emit sentiment event
          const sendTime = Date.now();
          await emitSentimentAnalyzed({
            interactionId,
            customerId,
            organizationId,
            sentiment: {
              label: sentiment,
              positive: normalizedScores.positive,
              negative: normalizedScores.negative,
              neutral: normalizedScores.neutral,
            },
            confidence,
          });

          // Wait for event
          const receiveTime = await Promise.race([
            eventReceived,
            new Promise<number>((_, reject) =>
              setTimeout(() => reject(new Error('Event not received')), 2000)
            ),
          ]);

          // Calculate latency
          const latency = receiveTime - sendTime;

          // Verify event delivered within 1 second (Requirement 6.3)
          expect(latency).toBeLessThan(1000);

          client.disconnect();
        }
      ),
      {
        numRuns: 50,
        timeout: 10000,
      }
    );
  }, 60000);

  /**
   * Property: Multiple concurrent clients receive events correctly
   */
  test('Property: multiple clients in same organization receive events', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.integer({ min: 2, max: 5 }), // number of clients
        fc.uuid(), // interactionId
        async (organizationId, clientCount, interactionId) => {
          // Create multiple clients in same organization
          const clientPromises = Array.from({ length: clientCount }, (_, i) => {
            const token = generateTestToken(`user-${i}`, organizationId);
            const client = ioClient(`http://localhost:${serverPort}`, {
              auth: { token },
              transports: ['websocket'],
            });

            clients.push(client);

            return new Promise<ClientSocket>((resolve, reject) => {
              client.on('connect', () => resolve(client));
              client.on('connect_error', (error) => reject(error));
              setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });
          });

          const connectedClients = await Promise.all(clientPromises);

          // Track which clients received the event
          const receivedFlags = new Array(clientCount).fill(false);

          connectedClients.forEach((client, index) => {
            client.on('event', () => {
              receivedFlags[index] = true;
            });
          });

          // Emit event
          await emitInteractionCreated({
            interactionId,
            customerId: 'test-customer',
            organizationId,
            timestamp: new Date(),
            channel: 'web',
            eventType: 'test-event',
          });

          // Wait for event delivery
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Verify all clients received the event
          expect(receivedFlags.every((flag) => flag === true)).toBe(true);

          // Disconnect all clients
          connectedClients.forEach((client) => client.disconnect());
        }
      ),
      {
        numRuns: 20,
        timeout: 15000,
      }
    );
  }, 60000);
});
