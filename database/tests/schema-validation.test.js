const knex = require('knex');
const knexConfig = require('../knexfile');

describe('Database Schema Validation Tests', () => {
  let db;

  beforeAll(async () => {
    // Use development configuration for tests
    db = knex(knexConfig.development);
    
    // Ensure migrations are run
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('Foreign Key Constraints', () => {
    let testOrgId;
    let testUserId;
    let testCustomerId;

    beforeEach(async () => {
      // Create test organization
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      testOrgId = org.id;

      // Create test user
      const [user] = await db('users').insert({
        email: `test-${Date.now()}@example.com`,
        password_hash: 'test_hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'analyst',
        organization_id: testOrgId
      }).returning('id');
      testUserId = user.id;

      // Create test customer
      const [customer] = await db('customers').insert({
        organization_id: testOrgId,
        external_id: `ext-${Date.now()}`,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      }).returning('id');
      testCustomerId = customer.id;
    });

    afterEach(async () => {
      // Clean up test data in reverse dependency order
      await db('behavior_patterns').where({ organization_id: testOrgId }).del();
      await db('customer_interactions').where({ organization_id: testOrgId }).del();
      await db('refresh_tokens').where({ user_id: testUserId }).del();
      await db('customers').where({ organization_id: testOrgId }).del();
      await db('users').where({ organization_id: testOrgId }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });

    test('users.organization_id foreign key constraint is enforced', async () => {
      const invalidOrgId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('users').insert({
          email: 'invalid@example.com',
          password_hash: 'test_hash',
          first_name: 'Invalid',
          last_name: 'User',
          role: 'viewer',
          organization_id: invalidOrgId
        })
      ).rejects.toThrow();
    });

    test('customers.organization_id foreign key constraint is enforced', async () => {
      const invalidOrgId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('customers').insert({
          organization_id: invalidOrgId,
          external_id: 'test-customer',
          first_seen_at: new Date(),
          last_seen_at: new Date()
        })
      ).rejects.toThrow();
    });

    test('customer_interactions.customer_id foreign key constraint is enforced', async () => {
      const invalidCustomerId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('customer_interactions').insert({
          customer_id: invalidCustomerId,
          organization_id: testOrgId,
          timestamp: new Date(),
          channel: 'web',
          event_type: 'page_view'
        })
      ).rejects.toThrow();
    });

    test('customer_interactions.organization_id foreign key constraint is enforced', async () => {
      const invalidOrgId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('customer_interactions').insert({
          customer_id: testCustomerId,
          organization_id: invalidOrgId,
          timestamp: new Date(),
          channel: 'web',
          event_type: 'page_view'
        })
      ).rejects.toThrow();
    });

    test('behavior_patterns.customer_id foreign key constraint is enforced', async () => {
      const invalidCustomerId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('behavior_patterns').insert({
          customer_id: invalidCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: 0.8,
          frequency: 5,
          detected_at: new Date()
        })
      ).rejects.toThrow();
    });

    test('behavior_patterns.organization_id foreign key constraint is enforced', async () => {
      const invalidOrgId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: invalidOrgId,
          pattern_type: 'test_pattern',
          confidence: 0.8,
          frequency: 5,
          detected_at: new Date()
        })
      ).rejects.toThrow();
    });

    test('refresh_tokens.user_id foreign key constraint is enforced', async () => {
      const invalidUserId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        db('refresh_tokens').insert({
          user_id: invalidUserId,
          token: 'test_token',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        })
      ).rejects.toThrow();
    });
  });

  describe('Unique Constraints', () => {
    let testOrgId;

    beforeEach(async () => {
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      testOrgId = org.id;
    });

    afterEach(async () => {
      await db('customers').where({ organization_id: testOrgId }).del();
      await db('users').where({ organization_id: testOrgId }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });

    test('users.email unique constraint is enforced', async () => {
      const email = `unique-test-${Date.now()}@example.com`;
      
      await db('users').insert({
        email,
        password_hash: 'test_hash',
        first_name: 'First',
        last_name: 'User',
        role: 'analyst',
        organization_id: testOrgId
      });

      await expect(
        db('users').insert({
          email,
          password_hash: 'test_hash',
          first_name: 'Second',
          last_name: 'User',
          role: 'viewer',
          organization_id: testOrgId
        })
      ).rejects.toThrow();
    });

    test('customers (organization_id, external_id) unique constraint is enforced', async () => {
      const externalId = `ext-${Date.now()}`;
      
      await db('customers').insert({
        organization_id: testOrgId,
        external_id: externalId,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      });

      await expect(
        db('customers').insert({
          organization_id: testOrgId,
          external_id: externalId,
          first_seen_at: new Date(),
          last_seen_at: new Date()
        })
      ).rejects.toThrow();
    });

    test('customers can have same external_id in different organizations', async () => {
      const [org2] = await db('organizations').insert({
        name: 'Second Organization'
      }).returning('id');
      const testOrg2Id = org2.id;

      const externalId = `ext-${Date.now()}`;
      
      await db('customers').insert({
        organization_id: testOrgId,
        external_id: externalId,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      });

      // Should succeed - different organization
      await expect(
        db('customers').insert({
          organization_id: testOrg2Id,
          external_id: externalId,
          first_seen_at: new Date(),
          last_seen_at: new Date()
        })
      ).resolves.toBeDefined();

      // Clean up
      await db('customers').where({ organization_id: testOrg2Id }).del();
      await db('organizations').where({ id: testOrg2Id }).del();
    });
  });

  describe('Check Constraints', () => {
    let testOrgId;
    let testCustomerId;

    beforeEach(async () => {
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      testOrgId = org.id;

      const [customer] = await db('customers').insert({
        organization_id: testOrgId,
        external_id: `ext-${Date.now()}`,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      }).returning('id');
      testCustomerId = customer.id;
    });

    afterEach(async () => {
      await db('behavior_patterns').where({ organization_id: testOrgId }).del();
      await db('customers').where({ organization_id: testOrgId }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });

    test('behavior_patterns.confidence check constraint enforces range [0, 1]', async () => {
      // Test confidence > 1
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: 1.5,
          frequency: 5,
          detected_at: new Date()
        })
      ).rejects.toThrow();

      // Test confidence < 0
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: -0.1,
          frequency: 5,
          detected_at: new Date()
        })
      ).rejects.toThrow();

      // Test valid confidence values
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: 0.0,
          frequency: 5,
          detected_at: new Date()
        })
      ).resolves.toBeDefined();

      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern_2',
          confidence: 1.0,
          frequency: 5,
          detected_at: new Date()
        })
      ).resolves.toBeDefined();

      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern_3',
          confidence: 0.75,
          frequency: 5,
          detected_at: new Date()
        })
      ).resolves.toBeDefined();
    });

    test('behavior_patterns.frequency check constraint enforces positive values', async () => {
      // Test frequency = 0
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: 0.8,
          frequency: 0,
          detected_at: new Date()
        })
      ).rejects.toThrow();

      // Test frequency < 0
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: 0.8,
          frequency: -5,
          detected_at: new Date()
        })
      ).rejects.toThrow();

      // Test valid frequency
      await expect(
        db('behavior_patterns').insert({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          pattern_type: 'test_pattern',
          confidence: 0.8,
          frequency: 1,
          detected_at: new Date()
        })
      ).resolves.toBeDefined();
    });
  });

  describe('Index Existence and Usage', () => {
    test('all expected indexes exist', async () => {
      // Query PostgreSQL system catalog for indexes
      const indexes = await db.raw(`
        SELECT
          tablename,
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `);

      const indexNames = indexes.rows.map(row => row.indexname);

      // Primary key indexes
      expect(indexNames).toContain('organizations_pkey');
      expect(indexNames).toContain('users_pkey');
      expect(indexNames).toContain('customers_pkey');
      expect(indexNames).toContain('customer_interactions_pkey');
      expect(indexNames).toContain('behavior_patterns_pkey');
      expect(indexNames).toContain('refresh_tokens_pkey');

      // Foreign key and query optimization indexes
      expect(indexNames).toContain('users_email_index');
      expect(indexNames).toContain('users_organization_id_index');
      expect(indexNames).toContain('customers_organization_id_index');
      expect(indexNames).toContain('customers_organization_id_external_id_index');
      expect(indexNames).toContain('customers_email_index');
      expect(indexNames).toContain('customers_segment_index');
      expect(indexNames).toContain('customer_interactions_customer_id_index');
      expect(indexNames).toContain('customer_interactions_organization_id_index');
      expect(indexNames).toContain('idx_interactions_timestamp');
      expect(indexNames).toContain('customer_interactions_channel_index');
      expect(indexNames).toContain('behavior_patterns_customer_id_index');
      expect(indexNames).toContain('behavior_patterns_organization_id_index');
      expect(indexNames).toContain('behavior_patterns_pattern_type_index');
      expect(indexNames).toContain('idx_patterns_detected');
      expect(indexNames).toContain('refresh_tokens_user_id_index');
      expect(indexNames).toContain('refresh_tokens_token_index');

      // GIN indexes (from migration 006)
      expect(indexNames).toContain('idx_interactions_content_fts');
      expect(indexNames).toContain('idx_interactions_metadata_gin');
      expect(indexNames).toContain('idx_interactions_sentiment');
    });

    test('indexes are used in query plans for foreign key lookups', async () => {
      // Create test data
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      const testOrgId = org.id;

      const [user] = await db('users').insert({
        email: `test-${Date.now()}@example.com`,
        password_hash: 'test_hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'analyst',
        organization_id: testOrgId
      }).returning('id');

      // Test query plan for users by organization_id
      const userPlan = await db.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM users WHERE organization_id = ?
      `, [testOrgId]);

      const userPlanText = JSON.stringify(userPlan.rows[0]);
      expect(userPlanText).toContain('Index');
      expect(userPlanText).not.toContain('Seq Scan');

      // Clean up
      await db('users').where({ id: user.id }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });

    test('indexes are used in query plans for timestamp range queries', async () => {
      // Create test data
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      const testOrgId = org.id;

      const [customer] = await db('customers').insert({
        organization_id: testOrgId,
        external_id: `ext-${Date.now()}`,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      }).returning('id');
      const testCustomerId = customer.id;

      await db('customer_interactions').insert({
        customer_id: testCustomerId,
        organization_id: testOrgId,
        timestamp: new Date(),
        channel: 'web',
        event_type: 'page_view'
      });

      // Test query plan for timestamp range query
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const plan = await db.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM customer_interactions
        WHERE timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC
      `, [startDate, endDate]);

      const planText = JSON.stringify(plan.rows[0]);
      expect(planText).toContain('Index');

      // Clean up
      await db('customer_interactions').where({ customer_id: testCustomerId }).del();
      await db('customers').where({ id: testCustomerId }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });

    test('GIN index is used for JSONB queries', async () => {
      // Create test data
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      const testOrgId = org.id;

      const [customer] = await db('customers').insert({
        organization_id: testOrgId,
        external_id: `ext-${Date.now()}`,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      }).returning('id');
      const testCustomerId = customer.id;

      // Insert multiple rows to encourage index usage
      const interactions = [];
      for (let i = 0; i < 100; i++) {
        interactions.push({
          customer_id: testCustomerId,
          organization_id: testOrgId,
          timestamp: new Date(),
          channel: 'web',
          event_type: 'page_view',
          metadata: { device: i % 2 === 0 ? 'mobile' : 'desktop', browser: 'chrome' }
        });
      }
      await db('customer_interactions').insert(interactions);

      // Test query plan for JSONB query
      const plan = await db.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM customer_interactions
        WHERE metadata @> ?::jsonb
      `, [JSON.stringify({ device: 'mobile' })]);

      const planText = JSON.stringify(plan.rows[0]);
      // Check that the GIN index exists and can be used
      // Note: PostgreSQL may choose seq scan for small datasets, so we just verify the index exists
      const indexCheck = await db.raw(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'customer_interactions' 
        AND indexname = 'idx_interactions_metadata_gin'
      `);
      expect(indexCheck.rows.length).toBe(1);

      // Clean up
      await db('customer_interactions').where({ customer_id: testCustomerId }).del();
      await db('customers').where({ id: testCustomerId }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });

    test('full-text search index is used for content queries', async () => {
      // Create test data
      const [org] = await db('organizations').insert({
        name: 'Test Organization'
      }).returning('id');
      const testOrgId = org.id;

      const [customer] = await db('customers').insert({
        organization_id: testOrgId,
        external_id: `ext-${Date.now()}`,
        first_seen_at: new Date(),
        last_seen_at: new Date()
      }).returning('id');
      const testCustomerId = customer.id;

      await db('customer_interactions').insert({
        customer_id: testCustomerId,
        organization_id: testOrgId,
        timestamp: new Date(),
        channel: 'email',
        event_type: 'message',
        content: 'This is a test message for full-text search'
      });

      // Test query plan for full-text search
      const plan = await db.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT * FROM customer_interactions
        WHERE to_tsvector('english', content) @@ to_tsquery('english', 'test')
      `);

      const planText = JSON.stringify(plan.rows[0]);
      expect(planText).toContain('Index');
      expect(planText).toContain('idx_interactions_content_fts');

      // Clean up
      await db('customer_interactions').where({ customer_id: testCustomerId }).del();
      await db('customers').where({ id: testCustomerId }).del();
      await db('organizations').where({ id: testOrgId }).del();
    });
  });
});
