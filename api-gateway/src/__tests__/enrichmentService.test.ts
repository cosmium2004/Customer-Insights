/**
 * Unit tests for enrichment service
 * Tests enrichment of interaction data with organization context,
 * customer segment, device info, and geolocation
 */

import { enrichInteraction, EnrichedInteraction } from '../services/enrichmentService';
import { InteractionData } from '../services/validationService';
import * as database from '../config/database';

// Create a shared mock query object
const mockQuery = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn()
};

// Mock the database module
jest.mock('../config/database', () => ({
  getDbConnection: jest.fn(() => jest.fn(() => mockQuery))
}));

describe('enrichInteraction', () => {
  const baseInteractionData: InteractionData = {
    customerId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    channel: 'web',
    eventType: 'page_view',
    content: 'User viewed product page',
    metadata: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('organization context enrichment', () => {
    it('should add organizationId from customer record', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const result = await enrichInteraction(baseInteractionData);

      expect(result.organizationId).toBe(mockCustomer.organization_id);
    });

    it('should throw error if customer not found', async () => {
      mockQuery.first.mockResolvedValue(null);

      await expect(enrichInteraction(baseInteractionData))
        .rejects
        .toThrow(`Customer not found: ${baseInteractionData.customerId}`);
    });
  });

  describe('customer segment enrichment', () => {
    it('should add customer segment if available', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: 'premium'
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const result = await enrichInteraction(baseInteractionData);

      expect(result.customerSegment).toBe('premium');
    });

    it('should not add customerSegment if not available', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const result = await enrichInteraction(baseInteractionData);

      expect(result.customerSegment).toBeUndefined();
    });
  });

  describe('device information normalization', () => {
    it('should normalize device info from metadata', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithDevice: InteractionData = {
        ...baseInteractionData,
        metadata: {
          device: 'Desktop',
          os: 'Windows 10',
          browser: 'Chrome',
          version: '120.0'
        }
      };

      const result = await enrichInteraction(dataWithDevice);

      expect(result.deviceInfo).toEqual({
        type: 'desktop',
        os: 'Windows 10',
        browser: 'Chrome',
        version: '120.0'
      });
    });

    it('should handle alternative device field names', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithDevice: InteractionData = {
        ...baseInteractionData,
        metadata: {
          deviceType: 'Mobile',
          operatingSystem: 'iOS 17',
          userAgent: 'Safari',
          browserVersion: '17.2'
        }
      };

      const result = await enrichInteraction(dataWithDevice);

      expect(result.deviceInfo).toEqual({
        type: 'mobile',
        os: 'iOS 17',
        browser: 'Safari',
        version: '17.2'
      });
    });

    it('should not add deviceInfo if no device data in metadata', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const result = await enrichInteraction(baseInteractionData);

      expect(result.deviceInfo).toBeUndefined();
    });

    it('should handle partial device information', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithDevice: InteractionData = {
        ...baseInteractionData,
        metadata: {
          device: 'Tablet',
          os: 'Android 13'
        }
      };

      const result = await enrichInteraction(dataWithDevice);

      expect(result.deviceInfo).toEqual({
        type: 'tablet',
        os: 'Android 13'
      });
    });
  });

  describe('geolocation extraction', () => {
    it('should extract geolocation from nested object', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithGeo: InteractionData = {
        ...baseInteractionData,
        metadata: {
          geolocation: {
            country: 'USA',
            region: 'California',
            city: 'San Francisco',
            latitude: 37.7749,
            longitude: -122.4194
          }
        }
      };

      const result = await enrichInteraction(dataWithGeo);

      expect(result.geolocation).toEqual({
        country: 'USA',
        region: 'California',
        city: 'San Francisco',
        latitude: 37.7749,
        longitude: -122.4194
      });
    });

    it('should extract geolocation from flat structure', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithGeo: InteractionData = {
        ...baseInteractionData,
        metadata: {
          country: 'UK',
          region: 'England',
          city: 'London',
          lat: 51.5074,
          lng: -0.1278
        }
      };

      const result = await enrichInteraction(dataWithGeo);

      expect(result.geolocation).toEqual({
        country: 'UK',
        region: 'England',
        city: 'London',
        latitude: 51.5074,
        longitude: -0.1278
      });
    });

    it('should handle alternative geolocation field names', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithGeo: InteractionData = {
        ...baseInteractionData,
        metadata: {
          geo: {
            country: 'Canada',
            state: 'Ontario',
            city: 'Toronto',
            lat: 43.6532,
            lon: -79.3832
          }
        }
      };

      const result = await enrichInteraction(dataWithGeo);

      expect(result.geolocation).toEqual({
        country: 'Canada',
        region: 'Ontario',
        city: 'Toronto',
        latitude: 43.6532,
        longitude: -79.3832
      });
    });

    it('should not add geolocation if no geo data in metadata', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const result = await enrichInteraction(baseInteractionData);

      expect(result.geolocation).toBeUndefined();
    });

    it('should handle partial geolocation data', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithGeo: InteractionData = {
        ...baseInteractionData,
        metadata: {
          country: 'Germany',
          city: 'Berlin'
        }
      };

      const result = await enrichInteraction(dataWithGeo);

      expect(result.geolocation).toEqual({
        country: 'Germany',
        city: 'Berlin'
      });
    });
  });

  describe('complete enrichment', () => {
    it('should enrich with all available data', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: 'enterprise'
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const completeData: InteractionData = {
        ...baseInteractionData,
        metadata: {
          device: 'Desktop',
          os: 'macOS',
          browser: 'Safari',
          version: '17.0',
          geolocation: {
            country: 'USA',
            region: 'New York',
            city: 'New York City',
            latitude: 40.7128,
            longitude: -74.0060
          }
        }
      };

      const result = await enrichInteraction(completeData);

      expect(result).toMatchObject({
        customerId: baseInteractionData.customerId,
        timestamp: baseInteractionData.timestamp,
        channel: baseInteractionData.channel,
        eventType: baseInteractionData.eventType,
        content: baseInteractionData.content,
        organizationId: mockCustomer.organization_id,
        customerSegment: mockCustomer.segment,
        deviceInfo: {
          type: 'desktop',
          os: 'macOS',
          browser: 'Safari',
          version: '17.0'
        },
        geolocation: {
          country: 'USA',
          region: 'New York',
          city: 'New York City',
          latitude: 40.7128,
          longitude: -74.0060
        }
      });
    });

    it('should preserve original data fields', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const result = await enrichInteraction(baseInteractionData);

      expect(result.customerId).toBe(baseInteractionData.customerId);
      expect(result.timestamp).toBe(baseInteractionData.timestamp);
      expect(result.channel).toBe(baseInteractionData.channel);
      expect(result.eventType).toBe(baseInteractionData.eventType);
      expect(result.content).toBe(baseInteractionData.content);
      expect(result.metadata).toBe(baseInteractionData.metadata);
    });
  });

  describe('edge cases', () => {
    it('should handle metadata with non-standard types', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithMixedTypes: InteractionData = {
        ...baseInteractionData,
        metadata: {
          device: 123, // Should be converted to string
          latitude: '37.7749', // Should be converted to number
          longitude: '-122.4194'
        }
      };

      const result = await enrichInteraction(dataWithMixedTypes);

      expect(result.deviceInfo?.type).toBe('123');
      expect(result.geolocation?.latitude).toBe(37.7749);
      expect(result.geolocation?.longitude).toBe(-122.4194);
    });

    it('should handle undefined metadata', async () => {
      const mockCustomer = {
        organization_id: '123e4567-e89b-12d3-a456-426614174000',
        segment: null
      };

      mockQuery.first.mockResolvedValue(mockCustomer);

      const dataWithoutMetadata: InteractionData = {
        ...baseInteractionData,
        metadata: undefined
      };

      const result = await enrichInteraction(dataWithoutMetadata);

      expect(result.deviceInfo).toBeUndefined();
      expect(result.geolocation).toBeUndefined();
    });
  });
});
