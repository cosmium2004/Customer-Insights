/**
 * Cache Service Unit Tests
 * 
 * Tests cache key generation, set/get operations, expiration, and invalidation
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9
 */

import * as cacheService from '../services/cacheService';
import { getRedisClient } from '../config/redis';

// Mock Redis client
jest.mock('../config/redis', () => ({
  getRedisClient: jest.fn(),
}));

describe('Cache Service', () => {
  let mockRedis: any;

  beforeEach(() => {
    // Create mock Redis client
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      info: jest.fn(),
      dbsize: jest.fn(),
      flushdb: jest.fn(),
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for same endpoint and params', () => {
      const endpoint = 'insights';
      const params = { organizationId: '123', startDate: '2024-01-01' };

      const key1 = cacheService.generateCacheKey(endpoint, params);
      const key2 = cacheService.generateCacheKey(endpoint, params);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^insights:[a-f0-9]{64}$/);
    });

    it('should generate different keys for different params', () => {
      const endpoint = 'insights';
      const params1 = { organizationId: '123' };
      const params2 = { organizationId: '456' };

      const key1 = cacheService.generateCacheKey(endpoint, params1);
      const key2 = cacheService.generateCacheKey(endpoint, params2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different endpoints', () => {
      const params = { organizationId: '123' };

      const key1 = cacheService.generateCacheKey('insights', params);
      const key2 = cacheService.generateCacheKey('metrics', params);

      expect(key1).not.toBe(key2);
    });

    it('should generate ML cache keys in correct format', () => {
      const modelType = 'sentiment';
      const text = 'This is a test';

      const key = cacheService.generateMLCacheKey(modelType, text);

      expect(key).toMatch(/^ml:sentiment:[a-f0-9]{64}$/);
    });

    it('should generate consistent ML cache keys for same text', () => {
      const modelType = 'sentiment';
      const text = 'This is a test';

      const key1 = cacheService.generateMLCacheKey(modelType, text);
      const key2 = cacheService.generateMLCacheKey(modelType, text);

      expect(key1).toBe(key2);
    });

    it('should generate different ML cache keys for different texts', () => {
      const modelType = 'sentiment';

      const key1 = cacheService.generateMLCacheKey(modelType, 'Text 1');
      const key2 = cacheService.generateMLCacheKey(modelType, 'Text 2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('Cache Set and Get Operations', () => {
    it('should set value in cache with TTL', async () => {
      const key = 'test:key';
      const value = { data: 'test' };
      const ttl = 300;

      await cacheService.set(key, value, ttl);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        key,
        ttl,
        JSON.stringify(value)
      );
    });

    it('should get value from cache', async () => {
      const key = 'test:key';
      const value = { data: 'test' };

      mockRedis.get.mockResolvedValue(JSON.stringify(value));

      const result = await cacheService.get(key);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(value);
    });

    it('should return null for cache miss', async () => {
      const key = 'test:key';

      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get(key);

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully on get', async () => {
      const key = 'test:key';

      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get(key);

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully on set', async () => {
      const key = 'test:key';
      const value = { data: 'test' };
      const ttl = 300;

      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cacheService.set(key, value, ttl)).resolves.not.toThrow();
    });
  });

  describe('Cache Delete Operations', () => {
    it('should delete single key', async () => {
      const key = 'test:key';

      await cacheService.del(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should delete keys matching pattern', async () => {
      const pattern = 'user:*';
      const keys = ['user:1', 'user:2', 'user:3'];

      // Mock SCAN to return keys
      mockRedis.scan
        .mockResolvedValueOnce(['0', keys])
        .mockResolvedValueOnce(['0', []]);

      await cacheService.delPattern(pattern);

      expect(mockRedis.scan).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith(...keys);
    });

    it('should handle empty pattern match', async () => {
      const pattern = 'nonexistent:*';

      mockRedis.scan.mockResolvedValue(['0', []]);

      await cacheService.delPattern(pattern);

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('Cache Existence and TTL', () => {
    it('should check if key exists', async () => {
      const key = 'test:key';

      mockRedis.exists.mockResolvedValue(1);

      const result = await cacheService.exists(key);

      expect(mockRedis.exists).toHaveBeenCalledWith(key);
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      const key = 'test:key';

      mockRedis.exists.mockResolvedValue(0);

      const result = await cacheService.exists(key);

      expect(result).toBe(false);
    });

    it('should get TTL for key', async () => {
      const key = 'test:key';
      const ttl = 300;

      mockRedis.ttl.mockResolvedValue(ttl);

      const result = await cacheService.ttl(key);

      expect(mockRedis.ttl).toHaveBeenCalledWith(key);
      expect(result).toBe(ttl);
    });

    it('should return -2 for non-existent key', async () => {
      const key = 'test:key';

      mockRedis.ttl.mockResolvedValue(-2);

      const result = await cacheService.ttl(key);

      expect(result).toBe(-2);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate user tokens', async () => {
      const userId = 'user-123';

      mockRedis.scan.mockResolvedValue(['0', [`token:${userId}:abc`]]);

      await cacheService.invalidateUserTokens(userId);

      expect(mockRedis.scan).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should invalidate customer cache', async () => {
      const customerId = 'customer-123';

      mockRedis.scan
        .mockResolvedValueOnce(['0', [`customer:${customerId}:profile`]])
        .mockResolvedValueOnce(['0', [`insights:*:customer:${customerId}:*`]]);

      await cacheService.invalidateCustomerCache(customerId);

      expect(mockRedis.scan).toHaveBeenCalled();
    });

    it('should invalidate organization cache', async () => {
      const organizationId = 'org-123';

      mockRedis.scan.mockResolvedValue(['0', [`*:org:${organizationId}:*`]]);

      await cacheService.invalidateOrganizationCache(organizationId);

      expect(mockRedis.scan).toHaveBeenCalled();
    });

    it('should invalidate dashboard cache', async () => {
      const organizationId = 'org-123';

      mockRedis.scan
        .mockResolvedValueOnce(['0', [`dashboard:*:org:${organizationId}:*`]])
        .mockResolvedValueOnce(['0', [`metrics:*:org:${organizationId}:*`]])
        .mockResolvedValueOnce(['0', [`trends:*:org:${organizationId}:*`]]);

      await cacheService.invalidateDashboardCache(organizationId);

      expect(mockRedis.scan).toHaveBeenCalled();
    });
  });

  describe('Cache Statistics', () => {
    it('should get cache statistics', async () => {
      const infoResponse = '# Stats\r\nkeyspace_hits:1000\r\nkeyspace_misses:200\r\n';

      mockRedis.info.mockResolvedValue(infoResponse);
      mockRedis.dbsize.mockResolvedValue(500);

      const stats = await cacheService.getCacheStats();

      expect(stats.hits).toBe(1000);
      expect(stats.misses).toBe(200);
      expect(stats.hitRate).toBe('83.33%');
      expect(stats.totalKeys).toBe(500);
    });

    it('should handle missing stats gracefully', async () => {
      mockRedis.info.mockResolvedValue('');
      mockRedis.dbsize.mockResolvedValue(0);

      const stats = await cacheService.getCacheStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe('0.00%');
    });
  });

  describe('Cache Flush', () => {
    it('should flush all cache', async () => {
      await cacheService.flushAll();

      expect(mockRedis.flushdb).toHaveBeenCalled();
    });

    it('should handle flush errors gracefully', async () => {
      mockRedis.flushdb.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cacheService.flushAll()).resolves.not.toThrow();
    });
  });
});
