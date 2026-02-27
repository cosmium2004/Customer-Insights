import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/authRoutes';
import { getDbConnection, closeDbConnection } from '../config/database';
import redis from '../middleware/rateLimiter';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler); // Add error handler middleware

describe('Authentication Endpoints', () => {
  let testOrganizationId: string;
  let testUserId: string;
  let testRefreshToken: string;

  beforeAll(async () => {
    const db = getDbConnection();
    // Create a test organization
    const [org] = await db('organizations')
      .insert({
        name: 'Test Organization',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testOrganizationId = org.id;
  });

  afterAll(async () => {
    const db = getDbConnection();
    // Clean up test data
    if (testUserId) {
      await db('refresh_tokens').where({ user_id: testUserId }).delete();
      await db('users').where({ id: testUserId }).delete();
    }
    if (testOrganizationId) {
      await db('organizations').where({ id: testOrganizationId }).delete();
    }
    await closeDbConnection();
    
    // Close Redis connection
    await redis.quit();
  });

  // Clear rate limit counters before each test to prevent interference
  beforeEach(async () => {
    // Clear all rate limit keys from Redis
    const keys = await redis.keys('rl:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User',
          organizationId: testOrganizationId,
          role: 'analyst',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.role).toBe('analyst');

      testUserId = response.body.user.id;
      testRefreshToken = response.body.refreshToken;
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test2@example.com',
          password: 'weak',
          firstName: 'Test',
          lastName: 'User',
          organizationId: testOrganizationId,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User',
          organizationId: testOrganizationId,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject duplicate email registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User',
          organizationId: testOrganizationId,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: testRefreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid or expired');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and revoke refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({
          refreshToken: testRefreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Logged out successfully');

      // Verify token is revoked
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: testRefreshToken,
        });

      expect(refreshResponse.status).toBe(401);
    });
  });
});
