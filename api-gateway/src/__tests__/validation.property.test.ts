/**
 * Property-based tests for data validation completeness
 * 
 * **Property 9: Data Validation Completeness**
 * **Validates: Requirements 2.1, 7.1, 7.2, 7.3, 7.4, 7.5**
 * 
 * Tests that validation enforces all required constraints across all possible inputs
 */

import * as fc from 'fast-check';
import { validateInteraction, InteractionData } from '../services/validationService';

describe('Property Test: Data Validation Completeness', () => {
  describe('**Validates: Requirements 2.1, 7.1, 7.2, 7.3, 7.4, 7.5**', () => {
    // Custom arbitraries for generating test data
    const validUUID = fc.uuid();
    const invalidUUID = fc.oneof(
      fc.string().filter(s => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
      fc.constant(''),
      fc.constant('not-a-uuid'),
      fc.constant('12345678-1234-1234-1234-12345678901') // Too short
    );

    const pastDate = fc.date({ max: new Date() });
    const futureDate = fc.date({ min: new Date(Date.now() + 1000) });
    
    const validChannel = fc.constantFrom('web', 'mobile', 'email', 'chat', 'phone');
    const invalidChannel = fc.string().filter(s => !['web', 'mobile', 'email', 'chat', 'phone'].includes(s));
    
    const nonEmptyString = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);
    const emptyOrWhitespaceString = fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('\t\n')
    );

    const textBasedChannel = fc.constantFrom('web', 'mobile', 'email', 'chat');

    /**
     * Property: Valid interaction data always passes validation
     * 
     * For all valid combinations of customerId (UUID), timestamp (past), 
     * channel (valid enum), eventType (non-empty), and content (non-empty for text channels),
     * validation must succeed with no errors.
     */
    it('should accept all valid interaction data', () => {
      fc.assert(
        fc.property(
          validUUID,
          pastDate,
          validChannel,
          nonEmptyString,
          nonEmptyString,
          fc.record({}),
          (customerId, timestamp, channel, eventType, content, metadata) => {
            const data: InteractionData = {
              customerId,
              timestamp,
              channel,
              eventType,
              content,
              metadata
            };

            const result = validateInteraction(data);
            
            return result.valid === true && result.errors.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Invalid UUID format always fails validation
     * 
     * For all strings that are not valid UUIDs, validation must fail
     * with a customerId error.
     */
    it('should reject all invalid UUID formats', () => {
      fc.assert(
        fc.property(
          invalidUUID,
          pastDate,
          validChannel,
          nonEmptyString,
          (customerId, timestamp, channel, eventType) => {
            const data = {
              customerId,
              timestamp,
              channel,
              eventType,
              content: 'test content'
            };

            const result = validateInteraction(data);
            
            return result.valid === false && 
                   result.errors.some(e => e.field === 'customerId');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Future timestamps always fail validation
     * 
     * For all dates in the future, validation must fail with a timestamp error.
     */
    it('should reject all future timestamps', () => {
      fc.assert(
        fc.property(
          validUUID,
          futureDate,
          validChannel,
          nonEmptyString,
          (customerId, timestamp, channel, eventType) => {
            const data = {
              customerId,
              timestamp,
              channel,
              eventType,
              content: 'test content'
            };

            const result = validateInteraction(data);
            
            return result.valid === false && 
                   result.errors.some(e => e.field === 'timestamp' && e.message.includes('future'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Invalid channel values always fail validation
     * 
     * For all strings that are not valid channel enum values,
     * validation must fail with a channel error.
     */
    it('should reject all invalid channel values', () => {
      fc.assert(
        fc.property(
          validUUID,
          pastDate,
          invalidChannel,
          nonEmptyString,
          (customerId, timestamp, channel, eventType) => {
            const data = {
              customerId,
              timestamp,
              channel,
              eventType,
              content: 'test content'
            };

            const result = validateInteraction(data);
            
            return result.valid === false && 
                   result.errors.some(e => e.field === 'channel');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Empty or whitespace-only eventType always fails validation
     * 
     * For all empty or whitespace-only strings, validation must fail
     * with an eventType error.
     */
    it('should reject all empty or whitespace-only eventTypes', () => {
      fc.assert(
        fc.property(
          validUUID,
          pastDate,
          validChannel,
          emptyOrWhitespaceString,
          (customerId, timestamp, channel, eventType) => {
            const data = {
              customerId,
              timestamp,
              channel,
              eventType,
              content: 'test content'
            };

            const result = validateInteraction(data);
            
            return result.valid === false && 
                   result.errors.some(e => e.field === 'eventType');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Text-based channels require non-empty content
     * 
     * For all text-based channels (web, mobile, email, chat) with empty content,
     * validation must fail with a content error.
     */
    it('should reject empty content for all text-based channels', () => {
      fc.assert(
        fc.property(
          validUUID,
          pastDate,
          textBasedChannel,
          nonEmptyString,
          emptyOrWhitespaceString,
          (customerId, timestamp, channel, eventType, content) => {
            const data = {
              customerId,
              timestamp,
              channel,
              eventType,
              content
            };

            const result = validateInteraction(data);
            
            return result.valid === false && 
                   result.errors.some(e => e.field === 'content');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Phone channel does not require content
     * 
     * For phone channel, validation should succeed even without content.
     */
    it('should accept phone channel without content', () => {
      fc.assert(
        fc.property(
          validUUID,
          pastDate,
          nonEmptyString,
          (customerId, timestamp, eventType) => {
            const data = {
              customerId,
              timestamp,
              channel: 'phone' as const,
              eventType,
              content: undefined
            };

            const result = validateInteraction(data);
            
            return result.valid === true && result.errors.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Missing required fields always fail validation
     * 
     * For any data missing required fields, validation must fail
     * with appropriate field errors.
     */
    it('should reject data with missing required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            customerId: fc.option(validUUID, { nil: undefined }),
            timestamp: fc.option(pastDate, { nil: undefined }),
            channel: fc.option(validChannel, { nil: undefined }),
            eventType: fc.option(nonEmptyString, { nil: undefined })
          }),
          (data) => {
            // Only test cases where at least one field is missing
            if (!data.customerId || !data.timestamp || !data.channel || !data.eventType) {
              const result = validateInteraction(data);
              
              return result.valid === false && result.errors.length > 0;
            }
            return true; // Skip if all fields present
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Validation is deterministic
     * 
     * For the same input data, validation must always return the same result.
     */
    it('should return consistent results for the same input', () => {
      fc.assert(
        fc.property(
          fc.record({
            customerId: fc.oneof(validUUID, invalidUUID),
            timestamp: fc.oneof(pastDate, futureDate),
            channel: fc.oneof(validChannel, invalidChannel),
            eventType: fc.oneof(nonEmptyString, emptyOrWhitespaceString),
            content: fc.option(nonEmptyString, { nil: undefined })
          }),
          (data) => {
            const result1 = validateInteraction(data);
            const result2 = validateInteraction(data);
            
            return result1.valid === result2.valid && 
                   result1.errors.length === result2.errors.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Validation errors contain field names
     * 
     * For all invalid data, validation errors must include the field name
     * that failed validation.
     */
    it('should include field names in all validation errors', () => {
      fc.assert(
        fc.property(
          fc.record({
            customerId: fc.oneof(validUUID, invalidUUID, fc.constant(undefined)),
            timestamp: fc.oneof(pastDate, futureDate, fc.constant(undefined)),
            channel: fc.oneof(validChannel, invalidChannel, fc.constant(undefined)),
            eventType: fc.oneof(nonEmptyString, emptyOrWhitespaceString, fc.constant(undefined)),
            content: fc.option(fc.oneof(nonEmptyString, emptyOrWhitespaceString), { nil: undefined })
          }),
          (data) => {
            const result = validateInteraction(data);
            
            if (!result.valid) {
              return result.errors.every(error => 
                error.field && 
                typeof error.field === 'string' && 
                error.field.length > 0 &&
                error.message &&
                typeof error.message === 'string' &&
                error.message.length > 0
              );
            }
            return true; // Valid data has no errors
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Boundary value testing for timestamps
     * 
     * Test timestamps at exact boundaries (current time, just past, just future).
     */
    it('should handle timestamp boundary values correctly', () => {
      fc.assert(
        fc.property(
          validUUID,
          validChannel,
          nonEmptyString,
          fc.integer({ min: -1000, max: 1000 }), // milliseconds offset from now
          (customerId, channel, eventType, offset) => {
            const timestamp = new Date(Date.now() + offset);
            const data = {
              customerId,
              timestamp,
              channel,
              eventType,
              content: 'test content'
            };

            const result = validateInteraction(data);
            
            // Should be valid if offset is <= 0 (past or current)
            // Should be invalid if offset is > 0 (future)
            if (offset <= 0) {
              return result.valid === true;
            } else {
              return result.valid === false && 
                     result.errors.some(e => e.field === 'timestamp');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
