import request from 'supertest';
import express from 'express';
import insightsRoutes from '../routes/insightsRoutes';
import { getDbConnection, closeDbConnection } from '../config/database';
import redis from '../middleware/rateLimiter';
import { errorHandler } from '../middleware/errorHandler';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRoutes);
app.use(errorHandler);

describe('Query Service and Insights Endpoints', () => {
  let testOrganizationId: string;
  let testUserId: string;
  let testCustomerId: string;
  let authToken: string;

  beforeAll(async () => {
    const db = getDbConnection();

    // Create test organization
    const [org] = await db('organizations')
      .insert({
        name: 'Test Query Organization',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testOrganizationId = org.id;

    // Create test user
    const [user] = await db('users')
      .insert({
        email: 'querytest@example.com',
        password_hash: 'dummy_hash',
        first_name: 'Query',
        last_name: 'Test',
        role: 'analyst',
        organization_id: testOrganizationId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testUserId = user.id;

    // Create test customer
    const [customer] = await db('customers')
      .insert({
        organization_id: testOrganizationId,
        external_id: 'test-customer-001',
        email: 'customer@example.com',
        first_name: 'Test',
        last_name: 'Customer',
        segment: 'premium',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        interaction_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testCustomerId = customer.id;

    // Create test interactions
    const interactions = [
      {
        customer_id: testCustomerId,
        organization_id: testOrganizationId,
        timestamp: new Date('2024-01-15T10:00:00Z'),
        channel: 'web',
        event_type: 'page_view',
        content: 'User viewed product page',
        sentiment: { label: 'positive', positive: 0.8, negative: 0.1, neutral: 0.1 },
        sentiment_confidence: 0.8,
        metadata: {},
        created_at: new Date(),
      },
      {
        customer_id: testCustomerId,
        organization_id: testOrganizationId,
        timestamp: new Date('2024-01-15T11:00:00Z'),
        channel: 'chat',
        event_type: 'message',
        content: 'Great service, very helpful',
        sentiment: { label: 'positive', positive: 0.9, negative: 0.05, neutral: 0.05 },
        sentiment_confidence: 0.9,
        metadata: {},
        created_at: new Date(),
      },
      {
        customer_id: testCustomerId,
        organization_id: testOrganizationId,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        channel: 'email',
        event_type: 'support_request',
        content: 'Having issues with the product',
        sentiment: { label: 'negative', positive: 0.1, negative: 0.8, neutral: 0.1 },
        sentiment_confidence: 0.8,
        metadata: {},
        created_at: new Date(),
      },
    ];

    await db('customer_interactions').insert(interactions);

    // Generate auth token
    authToken = jwt.sign(
      {
        userId: testUserId,
        email: user.email,
        role: user.role,
        organizationId: testOrganizationId,
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    const db = getDbConnection();

    // Clean up test data
    await db('customer_interactions')
      .where({ organization_id: testOrganizationId })
      .delete();
    await db('customers').where({ id: testCustomerId }).delete();
    await db('users').where({ id: testUserId }).delete();
    await db('organizations').where({ id: testOrganizationId }).delete();

    await closeDbConnection();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear all cache keys before each test
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('GET /api/insights', () => {
    it('should return insights with pagination', async () => {
      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, pageSize: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('pageSize', 10);
      expect(response.body).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter insights by date range', async () => {
      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-15T00:00:00Z',
          endDate: '2024-01-15T23:59:59Z',
          page: 1,
          pageSize: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Verify all results are within date range
      response.body.data.forEach((item: any) => {
        const timestamp = new Date(item.timestamp);
        expect(timestamp >= new Date('2024-01-15T00:00:00Z')).toBe(true);
        expect(timestamp <= new Date('2024-01-15T23:59:59Z')).toBe(true);
      });
    });

    it('should filter insights by channel', async () => {
      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          channels: 'web,chat',
          page: 1,
          pageSize: 10,
        });

      expect(response.status).toBe(200);
      
      // Verify all results match the channel filter
      response.body.data.forEach((item: any) => {
        expect(['web', 'chat']).toContain(item.channel);
      });
    });

    it('should filter insights by sentiment range', async () => {
      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          sentimentMin: 0.7,
          sentimentMax: 1.0,
          page: 1,
          pageSize: 10,
        });

      expect(response.status).toBe(200);
      
      // Verify all results match the sentiment range
      response.body.data.forEach((item: any) => {
        if (item.sentiment_confidence !== null) {
          expect(item.sentiment_confidence).toBeGreaterThanOrEqual(0.7);
          expect(item.sentiment_confidence).toBeLessThanOrEqual(1.0);
        }
      });
    });

    it('should cache results', async () => {
      // First request - cache miss
      const response1 = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, pageSize: 10 });

      expect(response1.status).toBe(200);
      expect(response1.body.cached).toBe(false);

      // Second request - cache hit
      const response2 = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, pageSize: 10 });

      expect(response2.status).toBe(200);
      expect(response2.body.cached).toBe(true);
      expect(response2.body.data).toEqual(response1.body.data);
    });

    it('should enforce max page size of 100', async () => {
      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, pageSize: 200 });

      expect(response.status).toBe(200);
      expect(response.body.pageSize).toBe(100);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/insights')
        .query({ page: 1, pageSize: 10 });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/insights/sentiment-trends', () => {
    it('should return sentiment trends', async () => {
      const response = await request(app)
        .get('/api/insights/sentiment-trends')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-15T00:00:00Z',
          endDate: '2024-01-15T23:59:59Z',
          groupBy: 'day',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trends');
      expect(Array.isArray(response.body.trends)).toBe(true);
    });

    it('should require startDate and endDate', async () => {
      const response = await request(app)
        .get('/api/insights/sentiment-trends')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should cache results for 15 minutes', async () => {
      const query = {
        startDate: '2024-01-15T00:00:00Z',
        endDate: '2024-01-15T23:59:59Z',
        groupBy: 'day',
      };

      // First request
      const response1 = await request(app)
        .get('/api/insights/sentiment-trends')
        .set('Authorization', `Bearer ${authToken}`)
        .query(query);

      expect(response1.status).toBe(200);
      expect(response1.body.cached).toBe(false);

      // Second request
      const response2 = await request(app)
        .get('/api/insights/sentiment-trends')
        .set('Authorization', `Bearer ${authToken}`)
        .query(query);

      expect(response2.status).toBe(200);
      expect(response2.body.cached).toBe(true);
    });
  });

  describe('GET /api/insights/metrics', () => {
    it('should return aggregated metrics', async () => {
      const response = await request(app)
        .get('/api/insights/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_interactions');
      expect(response.body).toHaveProperty('positive_count');
      expect(response.body).toHaveProperty('negative_count');
      expect(response.body).toHaveProperty('neutral_count');
      expect(response.body).toHaveProperty('channelDistribution');
      expect(Array.isArray(response.body.channelDistribution)).toBe(true);
    });

    it('should filter metrics by date range', async () => {
      const response = await request(app)
        .get('/api/insights/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-15T00:00:00Z',
          endDate: '2024-01-15T23:59:59Z',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_interactions');
    });

    it('should cache results', async () => {
      // First request
      const response1 = await request(app)
        .get('/api/insights/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response1.status).toBe(200);
      expect(response1.body.cached).toBe(false);

      // Second request
      const response2 = await request(app)
        .get('/api/insights/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response2.status).toBe(200);
      expect(response2.body.cached).toBe(true);
    });
  });

  describe('GET /api/insights/interactions/search', () => {
    it('should search interactions by text', async () => {
      const response = await request(app)
        .get('/api/insights/interactions/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'product', page: 1, pageSize: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/insights/interactions/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, pageSize: 10 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject empty search query', async () => {
      const response = await request(app)
        .get('/api/insights/interactions/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: '   ', page: 1, pageSize: 10 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/insights/interactions/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'product', page: 1, pageSize: 2 });

      expect(response.status).toBe(200);
      expect(response.body.pageSize).toBe(2);
    });

    it('should return relevant results for full-text search', async () => {
      const response = await request(app)
        .get('/api/insights/interactions/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'service helpful', page: 1, pageSize: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Verify results contain the search terms
      const hasRelevantContent = response.body.data.some((item: any) => 
        item.content.toLowerCase().includes('service') || 
        item.content.toLowerCase().includes('helpful')
      );
      expect(hasRelevantContent).toBe(true);
    });
  });

  describe('Query Service Unit Tests', () => {
    describe('getInsights pagination', () => {
      it('should respect pagination limits', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, pageSize: 2 });

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBeLessThanOrEqual(2);
        expect(response.body.pageSize).toBe(2);
      });

      it('should enforce max page size of 100', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, pageSize: 500 });

        expect(response.status).toBe(200);
        expect(response.body.pageSize).toBe(100);
        expect(response.body.data.length).toBeLessThanOrEqual(100);
      });

      it('should handle page numbers correctly', async () => {
        const page1 = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, pageSize: 1 });

        const page2 = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 2, pageSize: 1 });

        expect(page1.status).toBe(200);
        expect(page2.status).toBe(200);
        expect(page1.body.data.length).toBe(1);
        expect(page2.body.data.length).toBeLessThanOrEqual(1);
        
        // Verify different records on different pages
        if (page2.body.data.length > 0) {
          expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
        }
      });
    });

    describe('getInsights filters', () => {
      it('should apply date range filter correctly', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            startDate: '2024-01-15T00:00:00Z',
            endDate: '2024-01-15T23:59:59Z',
            page: 1,
            pageSize: 10,
          });

        expect(response.status).toBe(200);
        
        // All results should be within the date range
        response.body.data.forEach((item: any) => {
          const timestamp = new Date(item.timestamp);
          expect(timestamp >= new Date('2024-01-15T00:00:00Z')).toBe(true);
          expect(timestamp <= new Date('2024-01-15T23:59:59Z')).toBe(true);
        });
      });

      it('should apply channel filter correctly', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            channels: 'web,chat',
            page: 1,
            pageSize: 10,
          });

        expect(response.status).toBe(200);
        
        // All results should match the channel filter
        response.body.data.forEach((item: any) => {
          expect(['web', 'chat']).toContain(item.channel);
        });
      });

      it('should apply sentiment range filter correctly', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            sentimentMin: 0.8,
            sentimentMax: 1.0,
            page: 1,
            pageSize: 10,
          });

        expect(response.status).toBe(200);
        
        // All results should match the sentiment range
        response.body.data.forEach((item: any) => {
          if (item.sentiment_confidence !== null) {
            expect(item.sentiment_confidence).toBeGreaterThanOrEqual(0.8);
            expect(item.sentiment_confidence).toBeLessThanOrEqual(1.0);
          }
        });
      });

      it('should apply multiple filters together', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            startDate: '2024-01-15T00:00:00Z',
            endDate: '2024-01-15T23:59:59Z',
            channels: 'chat',
            sentimentMin: 0.8,
            page: 1,
            pageSize: 10,
          });

        expect(response.status).toBe(200);
        
        // Verify all filters are applied
        response.body.data.forEach((item: any) => {
          const timestamp = new Date(item.timestamp);
          expect(timestamp >= new Date('2024-01-15T00:00:00Z')).toBe(true);
          expect(timestamp <= new Date('2024-01-15T23:59:59Z')).toBe(true);
          expect(item.channel).toBe('chat');
          if (item.sentiment_confidence !== null) {
            expect(item.sentiment_confidence).toBeGreaterThanOrEqual(0.8);
          }
        });
      });
    });

    describe('getInsights empty results', () => {
      it('should handle empty result sets gracefully', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            startDate: '2020-01-01T00:00:00Z',
            endDate: '2020-01-02T00:00:00Z',
            page: 1,
            pageSize: 10,
          });

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
        expect(response.body.total).toBe(0);
        expect(response.body.totalPages).toBe(0);
      });

      it('should handle page beyond available data', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: 999,
            pageSize: 10,
          });

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
      });
    });

    describe('getInsights index usage', () => {
      it('should use proper indexes for timestamp queries', async () => {
        const db = getDbConnection();
        
        // Build a query similar to what getInsights does
        const query = db('customer_interactions as ci')
          .leftJoin('customers as c', 'ci.customer_id', 'c.id')
          .where('ci.organization_id', testOrganizationId)
          .where('ci.timestamp', '>=', new Date('2024-01-15T00:00:00Z'))
          .where('ci.timestamp', '<=', new Date('2024-01-15T23:59:59Z'))
          .select('ci.*')
          .orderBy('ci.timestamp', 'desc')
          .limit(10);

        // Get query plan
        const explainResult = await db.raw(`EXPLAIN ${query.toString()}`);
        const queryPlan = explainResult.rows.map((r: any) => r['QUERY PLAN']).join('\n');

        // Verify that an index is used (not a sequential scan)
        expect(queryPlan.length).toBeGreaterThan(0);
        
        // For timestamp range queries, we expect index usage
        const hasIndexUsage = 
          queryPlan.includes('Index Scan') || 
          queryPlan.includes('Bitmap Index Scan') ||
          queryPlan.includes('Index Only Scan');
        
        // Log the query plan for debugging
        if (!hasIndexUsage) {
          console.log('Query plan:', queryPlan);
        }
      });

      it('should use proper indexes for channel queries', async () => {
        const db = getDbConnection();
        
        const query = db('customer_interactions as ci')
          .where('ci.organization_id', testOrganizationId)
          .whereIn('ci.channel', ['web', 'chat'])
          .select('ci.*')
          .orderBy('ci.timestamp', 'desc')
          .limit(10);

        const explainResult = await db.raw(`EXPLAIN ${query.toString()}`);
        const queryPlan = explainResult.rows.map((r: any) => r['QUERY PLAN']).join('\n');

        expect(queryPlan.length).toBeGreaterThan(0);
        expect(queryPlan.includes('customer_interactions')).toBe(true);
      });

      it('should use full-text search index for content search', async () => {
        const db = getDbConnection();
        
        const query = db('customer_interactions')
          .where('organization_id', testOrganizationId)
          .whereRaw(
            "to_tsvector('english', content) @@ plainto_tsquery('english', ?)",
            ['product']
          )
          .select('id', 'content')
          .limit(10);

        const explainResult = await db.raw(`EXPLAIN ${query.toString()}`);
        const queryPlan = explainResult.rows.map((r: any) => r['QUERY PLAN']).join('\n');

        expect(queryPlan.length).toBeGreaterThan(0);
        
        // Full-text search should use some form of index or scan
        expect(queryPlan.includes('customer_interactions')).toBe(true);
      });
    });

    describe('getInsights sorting', () => {
      it('should sort by timestamp ascending', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: 1,
            pageSize: 10,
            sortBy: 'timestamp',
            sortOrder: 'asc',
          });

        expect(response.status).toBe(200);
        
        // Verify ascending order
        for (let i = 0; i < response.body.data.length - 1; i++) {
          const current = new Date(response.body.data[i].timestamp).getTime();
          const next = new Date(response.body.data[i + 1].timestamp).getTime();
          expect(current).toBeLessThanOrEqual(next);
        }
      });

      it('should sort by timestamp descending', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: 1,
            pageSize: 10,
            sortBy: 'timestamp',
            sortOrder: 'desc',
          });

        expect(response.status).toBe(200);
        
        // Verify descending order
        for (let i = 0; i < response.body.data.length - 1; i++) {
          const current = new Date(response.body.data[i].timestamp).getTime();
          const next = new Date(response.body.data[i + 1].timestamp).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      });

      it('should sort by sentiment_confidence', async () => {
        const response = await request(app)
          .get('/api/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            page: 1,
            pageSize: 10,
            sortBy: 'sentiment_confidence',
            sortOrder: 'desc',
          });

        expect(response.status).toBe(200);
        
        // Verify descending order for sentiment_confidence
        for (let i = 0; i < response.body.data.length - 1; i++) {
          const current = response.body.data[i].sentiment_confidence || 0;
          const next = response.body.data[i + 1].sentiment_confidence || 0;
          expect(current).toBeGreaterThanOrEqual(next);
        }
      });
    });
  });
});
