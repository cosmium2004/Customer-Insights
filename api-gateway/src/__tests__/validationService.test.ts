/**
 * Unit tests for validation service
 * Tests validation of interaction data against schema requirements
 */

import { validateInteraction, InteractionData } from '../services/validationService';

describe('validateInteraction', () => {
  const validInteractionData: InteractionData = {
    customerId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    channel: 'web',
    eventType: 'page_view',
    content: 'User viewed product page',
    metadata: {}
  };

  describe('valid data', () => {
    it('should accept valid interaction data', () => {
      const result = validateInteraction(validInteractionData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid data for all channels', () => {
      const channels: Array<InteractionData['channel']> = ['web', 'mobile', 'email', 'chat', 'phone'];
      
      channels.forEach(channel => {
        const data = {
          ...validInteractionData,
          channel,
          content: channel === 'phone' ? undefined : 'Some content'
        };
        const result = validateInteraction(data);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should accept phone channel without content', () => {
      const data = {
        ...validInteractionData,
        channel: 'phone' as const,
        content: undefined
      };
      const result = validateInteraction(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('customerId validation', () => {
    it('should reject missing customerId', () => {
      const data = { ...validInteractionData, customerId: undefined };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'customerId',
        message: 'customerId is required'
      });
    });

    it('should reject non-string customerId', () => {
      const data = { ...validInteractionData, customerId: 123 as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'customerId',
        message: 'customerId must be a string'
      });
    });

    it('should reject invalid UUID format', () => {
      const data = { ...validInteractionData, customerId: 'not-a-uuid' };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'customerId',
        message: 'customerId must be a valid UUID format'
      });
    });

    it('should accept valid UUID in different cases', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '550E8400-E29B-41D4-A716-446655440000',
        '550e8400-E29B-41d4-A716-446655440000'
      ];

      uuids.forEach(uuid => {
        const data = { ...validInteractionData, customerId: uuid };
        const result = validateInteraction(data);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('timestamp validation', () => {
    it('should reject missing timestamp', () => {
      const data = { ...validInteractionData, timestamp: undefined as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'timestamp',
        message: 'timestamp is required'
      });
    });

    it('should reject invalid date', () => {
      const data = { ...validInteractionData, timestamp: 'invalid-date' as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'timestamp',
        message: 'timestamp must be a valid date'
      });
    });

    it('should reject future timestamp', () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future
      const data = { ...validInteractionData, timestamp: futureDate };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'timestamp',
        message: 'timestamp cannot be in the future'
      });
    });

    it('should accept current timestamp', () => {
      const data = { ...validInteractionData, timestamp: new Date() };
      const result = validateInteraction(data);
      expect(result.valid).toBe(true);
    });

    it('should accept past timestamp', () => {
      const pastDate = new Date('2020-01-01T00:00:00Z');
      const data = { ...validInteractionData, timestamp: pastDate };
      const result = validateInteraction(data);
      expect(result.valid).toBe(true);
    });

    it('should accept timestamp as string', () => {
      const data = { ...validInteractionData, timestamp: '2024-01-15T10:00:00Z' as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('channel validation', () => {
    it('should reject missing channel', () => {
      const data = { ...validInteractionData, channel: undefined as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'channel',
        message: 'channel is required'
      });
    });

    it('should reject non-string channel', () => {
      const data = { ...validInteractionData, channel: 123 as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'channel',
        message: 'channel must be a string'
      });
    });

    it('should reject invalid channel value', () => {
      const data = { ...validInteractionData, channel: 'invalid' as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'channel',
        message: 'channel must be one of: web, mobile, email, chat, phone'
      });
    });
  });

  describe('eventType validation', () => {
    it('should reject missing eventType', () => {
      const data = { ...validInteractionData, eventType: undefined as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'eventType',
        message: 'eventType is required'
      });
    });

    it('should reject non-string eventType', () => {
      const data = { ...validInteractionData, eventType: 123 as any };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'eventType',
        message: 'eventType must be a string'
      });
    });

    it('should reject empty eventType', () => {
      const data = { ...validInteractionData, eventType: '' };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'eventType',
        message: 'eventType must be a non-empty string'
      });
    });

    it('should reject whitespace-only eventType', () => {
      const data = { ...validInteractionData, eventType: '   ' };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'eventType',
        message: 'eventType must be a non-empty string'
      });
    });
  });

  describe('content validation for text-based channels', () => {
    const textChannels: Array<InteractionData['channel']> = ['web', 'mobile', 'email', 'chat'];

    textChannels.forEach(channel => {
      describe(`${channel} channel`, () => {
        it('should reject missing content', () => {
          const data = { ...validInteractionData, channel, content: undefined };
          const result = validateInteraction(data);
          expect(result.valid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'content',
            message: `content is required for ${channel} channel`
          });
        });

        it('should reject non-string content', () => {
          const data = { ...validInteractionData, channel, content: 123 as any };
          const result = validateInteraction(data);
          expect(result.valid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'content',
            message: 'content must be a string'
          });
        });

        it('should reject empty content', () => {
          const data = { ...validInteractionData, channel, content: '' };
          const result = validateInteraction(data);
          expect(result.valid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'content',
            message: `content must be non-empty for ${channel} channel`
          });
        });

        it('should reject whitespace-only content', () => {
          const data = { ...validInteractionData, channel, content: '   ' };
          const result = validateInteraction(data);
          expect(result.valid).toBe(false);
          expect(result.errors).toContainEqual({
            field: 'content',
            message: `content must be non-empty for ${channel} channel`
          });
        });

        it('should accept valid content', () => {
          const data = { ...validInteractionData, channel, content: 'Valid content' };
          const result = validateInteraction(data);
          expect(result.valid).toBe(true);
        });
      });
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const data = {
        customerId: 'invalid-uuid',
        timestamp: new Date(Date.now() + 1000 * 60 * 60),
        channel: 'invalid' as any,
        eventType: '',
        content: ''
      };
      const result = validateInteraction(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {
    it('should handle null data', () => {
      const result = validateInteraction(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty object', () => {
      const result = validateInteraction({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept optional metadata', () => {
      const data = {
        ...validInteractionData,
        metadata: { key: 'value', nested: { data: 123 } }
      };
      const result = validateInteraction(data);
      expect(result.valid).toBe(true);
    });
  });
});
