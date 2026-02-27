import { AuthService } from '../services/authService';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDbConnection, closeDbConnection } from '../config/database';

describe('AuthService Unit Tests', () => {
  let authService: AuthService;
  let testOrganizationId: string;
  let testUserId: string;

  beforeAll(async () => {
    const db = getDbConnection();
    authService = new AuthService(db);

    // Create a test organization
    const [org] = await db('organizations')
      .insert({
        name: 'Test Organization',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testOrganizationId = org.id;

    // Create a test user
    const passwordHash = await authService.hashPassword('TestPassword123!');
    const [user] = await db('users')
      .insert({
        email: 'testuser@example.com',
        password_hash: passwordHash,
        first_name: 'Test',
        last_name: 'User',
        role: 'analyst',
        permissions: JSON.stringify(['read', 'write']),
        organization_id: testOrganizationId,
      })
      .returning('*');
    testUserId = user.id;
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
  });

  afterEach(async () => {
    const db = getDbConnection();
    // Clean up refresh tokens after each test
    if (testUserId) {
      await db('refresh_tokens').where({ user_id: testUserId }).delete();
    }
  });

  describe('Password Hashing', () => {
    it('should hash password using bcrypt with 10 rounds', async () => {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2b$10$')).toBe(true); // bcrypt format with 10 rounds
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
    });

    it('should produce valid hashes that can be verified', async () => {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);

      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('Password Comparison', () => {
    it('should return true for valid password', async () => {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);

      const result = await authService.comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await authService.hashPassword(password);

      const result = await authService.comparePassword(wrongPassword, hash);
      expect(result).toBe(false);
    });

    it('should use constant-time comparison', async () => {
      const password = 'TestPassword123!';
      const hash = await authService.hashPassword(password);

      // Measure time for correct password
      const start1 = process.hrtime.bigint();
      await authService.comparePassword(password, hash);
      const end1 = process.hrtime.bigint();
      const time1 = Number(end1 - start1);

      // Measure time for incorrect password
      const start2 = process.hrtime.bigint();
      await authService.comparePassword('WrongPassword123!', hash);
      const end2 = process.hrtime.bigint();
      const time2 = Number(end2 - start2);

      // Times should be similar (within 50% variance due to system noise)
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(1.5);
    });
  });

  describe('Access Token Generation', () => {
    it('should generate valid JWT access token', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const token = authService.generateAccessToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should include correct payload in access token', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const token = authService.generateAccessToken(user);

      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.role).toBe(user.role);
      expect(decoded.organizationId).toBe(user.organization_id);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should generate token with 1-hour expiration', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const token = authService.generateAccessToken(user);

      const decoded = jwt.decode(token) as any;
      const expirationTime = decoded.exp - decoded.iat;
      expect(expirationTime).toBe(3600); // 1 hour = 3600 seconds
    });

    it('should sign token with HS256 algorithm', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const token = authService.generateAccessToken(user);

      const decoded = jwt.decode(token, { complete: true }) as any;
      expect(decoded.header.alg).toBe('HS256');
    });
  });

  describe('Refresh Token Generation', () => {
    it('should generate valid JWT refresh token', () => {
      const token = authService.generateRefreshToken(testUserId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include userId in refresh token payload', () => {
      const token = authService.generateRefreshToken(testUserId);

      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.type).toBe('refresh');
    });

    it('should generate token with 7-day expiration', () => {
      const token = authService.generateRefreshToken(testUserId);

      const decoded = jwt.decode(token) as any;
      const expirationTime = decoded.exp - decoded.iat;
      expect(expirationTime).toBe(604800); // 7 days = 604800 seconds
    });
  });

  describe('Token Verification', () => {
    it('should verify valid access token', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const token = authService.generateAccessToken(user);

      const decoded = authService.verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(user.id);
      expect(decoded?.email).toBe(user.email);
    });

    it('should verify valid refresh token', () => {
      const token = authService.generateRefreshToken(testUserId);

      const decoded = authService.verifyToken(token, true);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(testUserId);
    });

    it('should reject expired token', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      
      // Create token with immediate expiration
      const expiredToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          organizationId: user.organization_id,
        },
        process.env.JWT_SECRET || '',
        { expiresIn: '0s', algorithm: 'HS256' }
      );

      // Wait a moment to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      const decoded = authService.verifyToken(expiredToken);
      expect(decoded).toBeNull();
    });

    it('should reject token with invalid signature', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      
      // Create token with wrong secret
      const tamperedToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          organizationId: user.organization_id,
        },
        'wrong-secret-key-that-does-not-match',
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      const decoded = authService.verifyToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should reject tampered token payload', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const token = authService.generateAccessToken(user);

      // Tamper with the token by modifying the payload
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: 'tampered-id', role: 'admin' })
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const decoded = authService.verifyToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should reject malformed token', () => {
      const decoded = authService.verifyToken('not-a-valid-jwt-token');
      expect(decoded).toBeNull();
    });

    it('should reject empty token', () => {
      const decoded = authService.verifyToken('');
      expect(decoded).toBeNull();
    });
  });

  describe('Refresh Token Storage and Validation', () => {
    it('should store refresh token in database', async () => {
      const db = getDbConnection();
      const token = authService.generateRefreshToken(testUserId);
      await authService.storeRefreshToken(testUserId, token);

      const storedToken = await db('refresh_tokens')
        .where({ token })
        .first();

      expect(storedToken).toBeDefined();
      expect(storedToken.user_id).toBe(testUserId);
      expect(storedToken.token).toBe(token);
      expect(storedToken.expires_at).toBeDefined();
    });

    it('should validate valid refresh token from database', async () => {
      const token = authService.generateRefreshToken(testUserId);
      await authService.storeRefreshToken(testUserId, token);

      const userId = await authService.validateRefreshToken(token);
      expect(userId).toBe(testUserId);
    });

    it('should reject refresh token not in database', async () => {
      const token = authService.generateRefreshToken(testUserId);
      // Don't store it in database

      const userId = await authService.validateRefreshToken(token);
      expect(userId).toBeNull();
    });

    it('should reject expired refresh token from database', async () => {
      const db = getDbConnection();
      const token = authService.generateRefreshToken(testUserId);
      
      // Store with past expiration date
      await db('refresh_tokens').insert({
        user_id: testUserId,
        token: token,
        expires_at: new Date(Date.now() - 1000), // 1 second ago
      });

      const userId = await authService.validateRefreshToken(token);
      expect(userId).toBeNull();
    });
  });

  describe('Token Revocation', () => {
    it('should revoke specific refresh token', async () => {
      const db = getDbConnection();
      const token = authService.generateRefreshToken(testUserId);
      await authService.storeRefreshToken(testUserId, token);

      await authService.revokeRefreshToken(token);

      const storedToken = await db('refresh_tokens')
        .where({ token })
        .first();

      expect(storedToken).toBeUndefined();
    });

    it('should revoke all user tokens', async () => {
      const db = getDbConnection();
      const token1 = authService.generateRefreshToken(testUserId);
      const token2 = authService.generateRefreshToken(testUserId);
      
      await authService.storeRefreshToken(testUserId, token1);
      await authService.storeRefreshToken(testUserId, token2);

      await authService.revokeAllUserTokens(testUserId);

      const tokens = await db('refresh_tokens')
        .where({ user_id: testUserId });

      expect(tokens).toHaveLength(0);
    });
  });

  describe('Token Generation Combined', () => {
    it('should generate both access and refresh tokens', async () => {
      const db = getDbConnection();
      const user = await db('users').where({ id: testUserId }).first();
      const tokens = authService.generateTokens(user);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');

      // Verify both tokens are valid
      const accessDecoded = authService.verifyToken(tokens.accessToken);
      const refreshDecoded = authService.verifyToken(tokens.refreshToken, true);

      expect(accessDecoded).not.toBeNull();
      expect(refreshDecoded).not.toBeNull();
      expect(accessDecoded?.userId).toBe(user.id);
      expect(refreshDecoded?.userId).toBe(user.id);
    });
  });
});
