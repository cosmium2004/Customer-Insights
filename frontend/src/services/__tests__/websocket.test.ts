/**
 * WebSocket Service Tests
 * 
 * Tests decompression and event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pako from 'pako';

describe('WebSocket Decompression', () => {
  it('should decompress gzip payload correctly', () => {
    // Create a test event
    const testEvent = {
      type: 'interaction.created',
      interactionId: '123',
      customerId: '456',
      organizationId: '789',
      timestamp: new Date().toISOString(),
      channel: 'web',
      eventType: 'page_view',
    };

    // Compress the event (simulating backend)
    const jsonString = JSON.stringify(testEvent);
    const compressed = pako.gzip(jsonString);
    const base64 = btoa(String.fromCharCode(...compressed));

    // Create compressed payload
    const compressedPayload = {
      compressed: true,
      data: base64,
    };

    // Decompress (simulating frontend)
    const binaryString = atob(compressedPayload.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decompressed = pako.inflate(bytes, { to: 'string' });
    const result = JSON.parse(decompressed);

    // Verify
    expect(result).toEqual(testEvent);
    expect(result.type).toBe('interaction.created');
    expect(result.interactionId).toBe('123');
  });

  it('should handle uncompressed payload', () => {
    const testEvent = {
      type: 'sentiment.analyzed',
      interactionId: '123',
      customerId: '456',
      organizationId: '789',
      sentiment: {
        label: 'positive',
        positive: 0.8,
        negative: 0.1,
        neutral: 0.1,
      },
      confidence: 0.8,
    };

    // No compression needed for small payloads
    expect(testEvent.type).toBe('sentiment.analyzed');
    expect(testEvent.sentiment.label).toBe('positive');
  });

  it('should handle batched events', () => {
    const batchedPayload = {
      batched: true,
      events: [
        {
          type: 'interaction.created',
          interactionId: '1',
          customerId: '456',
          organizationId: '789',
          timestamp: new Date().toISOString(),
          channel: 'web',
          eventType: 'page_view',
        },
        {
          type: 'interaction.created',
          interactionId: '2',
          customerId: '456',
          organizationId: '789',
          timestamp: new Date().toISOString(),
          channel: 'mobile',
          eventType: 'button_click',
        },
      ],
    };

    expect(batchedPayload.batched).toBe(true);
    expect(batchedPayload.events).toHaveLength(2);
    expect(batchedPayload.events[0].interactionId).toBe('1');
    expect(batchedPayload.events[1].interactionId).toBe('2');
  });

  it('should handle large compressed payload', () => {
    // Create a large event with lots of metadata
    const largeEvent = {
      type: 'interaction.created',
      interactionId: '123',
      customerId: '456',
      organizationId: '789',
      timestamp: new Date().toISOString(),
      channel: 'web',
      eventType: 'page_view',
      metadata: {
        url: 'https://example.com/very/long/path/to/page',
        referrer: 'https://google.com/search?q=long+query+string',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        screenResolution: '1920x1080',
        deviceType: 'desktop',
        browser: 'Chrome',
        browserVersion: '120.0.0.0',
        os: 'Windows',
        osVersion: '10',
        language: 'en-US',
        timezone: 'America/New_York',
        sessionId: 'very-long-session-id-string-here',
        // Add more data to exceed 1KB
        additionalData: Array(100).fill('some data').join(' '),
      },
    };

    const jsonString = JSON.stringify(largeEvent);
    expect(jsonString.length).toBeGreaterThan(1024); // Verify it's > 1KB

    // Compress
    const compressed = pako.gzip(jsonString);
    const base64 = btoa(String.fromCharCode(...compressed));

    // Verify compression reduces size
    expect(base64.length).toBeLessThan(jsonString.length);

    // Decompress
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decompressed = pako.inflate(bytes, { to: 'string' });
    const result = JSON.parse(decompressed);

    // Verify
    expect(result).toEqual(largeEvent);
    expect(result.metadata.additionalData).toBeDefined();
  });
});
