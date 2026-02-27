import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService';
import { getDbConnection, closeDbConnection } from '../config/database';

/**
 * Property Test 1: Authentication Token Validity
 * 
 * Validates Requirements: 1.1, 1.2, 1.6, 9.3
 * 
 * This property test verifies that all generated tokens have:
 * - Valid signatures that can be verified
 * - Non-expired timestamps
 * - Reference to existing users
 * 
 * Tests with:
 * - Randomly generated user data
 * - Expired tokens
 * - Tampered signatures
 */

describe('Property Test: Authentication Token Validity', () => {
  let authService: AuthService;
  let testOrganizationId: string;
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    const db = getDbConnection();
    authService = new AuthService(db);

    // Create a test organization for all property tests
    const [org] = await db('organizations')
      .insert({
        name: 'Property Test Organization',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testOrganizationId = org.id;
  });

  afterAll(async () => {
    const db = getDbConnection();
    // Clean up all created test users
    if (createdUserIds.length > 0) {
      await db('refresh_tokens').whereIn('user_id', createdUserIds).delete();
      await db('users').whereIn('id', createdUserIds).delete();
    }
    if (testOrganizationId) {
      await db('organizations').where({ id: testOrganizationId }).delete();
    }
    await closeDbConnection();
  });

  // Arbitrary for generating valid user data
  const userArbitrary = fc.record({
    email: fc.emailAddress(),
    firstName: fc.string({ minLength: 1, maxLength: 50 }),
    lastName: fc.string({ minLength: 1, maxLength: 50 }),
    role: fc.constantFrom('admin', 'analyst', 'viewer'),
    permissions: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  });

  /**
   * Property 1.1: All generated access tokens have valid signatures
   * Requirement 1.6, 9.3
   */
  it('should generate tokens with valid signatures that can be verified', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        const db = getDbConnection();
        // Create user in database
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: userData.email,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate token
        const accessToken = authService.generateAccessToken(user);

        // Verify token
        const decoded = authService.verifyToken(accessToken, false);

        // Property: Token must be verifiable and contain correct user data
        expect(decoded).not.toBeNull();
        expect(decoded?.userId).toBe(user.id);
        expect(decoded?.email).toBe(user.email);
        expect(decoded?.role).toBe(user.role);
        expect(decoded?.organizationId).toBe(user.organization_id);
      }),
      { numRuns: 20 } // Run 20 times with different random data
    );
  });

  /**
   * Property 1.2: All generated tokens have non-expired timestamps
   * Requirement 1.2, 1.6
   */
  it('should generate tokens with non-expired timestamps', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        const db = getDbConnection();
        // Create user in database
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate token
        const accessToken = authService.generateAccessToken(user);

        // Decode without verification to check expiration
        const decoded = jwt.decode(accessToken) as any;

        // Property: Token must have expiration time in the future
        const now = Math.floor(Date.now() / 1000);
        expect(decoded.exp).toBeGreaterThan(now);
        expect(decoded.iat).toBeLessThanOrEqual(now);

        // Property: Token should be valid for approximately 1 hour
        const expirationDuration = decoded.exp - decoded.iat;
        expect(expirationDuration).toBeGreaterThanOrEqual(3590); // 1 hour - 10 seconds tolerance
        expect(expirationDuration).toBeLessThanOrEqual(3610); // 1 hour + 10 seconds tolerance
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 1.3: Expired tokens are rejected
   * Requirement 1.6, 9.3
   */
  it('should reject expired tokens', async () => {
    const db = getDbConnection();
    // Create a user
    const passwordHash = await authService.hashPassword('TestPassword123!');
    const [user] = await db('users')
      .insert({
        email: `expired-test-${Date.now()}@example.com`,
        password_hash: passwordHash,
        first_name: 'Expired',
        last_name: 'Test',
        role: 'analyst',
        permissions: JSON.stringify([]),
        organization_id: testOrganizationId,
      })
      .returning('*');

    createdUserIds.push(user.id);

    // Generate an expired token (expires in -1 hour)
    const expiredToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: [],
        organizationId: user.organization_id,
      },
      process.env.JWT_SECRET || '',
      {
        expiresIn: '-1h',
        algorithm: 'HS256',
      }
    );

    // Property: Expired token must be rejected
    const decoded = authService.verifyToken(expiredToken, false);
    expect(decoded).toBeNull();
  });

  /**
   * Property 1.4: Tokens with tampered signatures are rejected
   * Requirement 9.3
   */
  it('should reject tokens with tampered signatures', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        const db = getDbConnection();
        // Create user in database
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `tamper-${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate valid token
        const validToken = authService.generateAccessToken(user);

        // Tamper with the token by modifying a character in the signature
        const parts = validToken.split('.');
        const tamperedSignature = parts[2].split('').reverse().join('');
        const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

        // Property: Tampered token must be rejected
        const decoded = authService.verifyToken(tamperedToken, false);
        expect(decoded).toBeNull();
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 1.5: Tokens reference existing users
   * Requirement 1.1, 1.2
   */
  it('should generate tokens that reference existing users in database', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        const db = getDbConnection();
        // Create user in database
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `ref-${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate token
        const accessToken = authService.generateAccessToken(user);

        // Verify token
        const decoded = authService.verifyToken(accessToken, false);

        // Property: Token must reference a user that exists in database
        const dbUser = await db('users').where({ id: decoded?.userId }).first();
        expect(dbUser).toBeDefined();
        expect(dbUser.id).toBe(user.id);
        expect(dbUser.email).toBe(user.email);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 1.6: Refresh tokens have valid signatures and 7-day expiration
   * Requirement 1.2, 1.10
   */
  it('should generate refresh tokens with valid signatures and 7-day expiration', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        const db = getDbConnection();
        // Create user in database
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `refresh-${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate refresh token
        const refreshToken = authService.generateRefreshToken(user.id);

        // Verify refresh token
        const decoded = authService.verifyToken(refreshToken, true);

        // Property: Refresh token must be verifiable
        expect(decoded).not.toBeNull();
        expect(decoded?.userId).toBe(user.id);

        // Decode to check expiration
        const decodedRaw = jwt.decode(refreshToken) as any;
        const expirationDuration = decodedRaw.exp - decodedRaw.iat;

        // Property: Refresh token should be valid for approximately 7 days
        const sevenDaysInSeconds = 7 * 24 * 60 * 60;
        expect(expirationDuration).toBeGreaterThanOrEqual(sevenDaysInSeconds - 60);
        expect(expirationDuration).toBeLessThanOrEqual(sevenDaysInSeconds + 60);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 1.7: Tokens with invalid secret are rejected
   * Requirement 9.3
   */
  it('should reject tokens signed with wrong secret', async () => {
    const db = getDbConnection();
    // Create a user
    const passwordHash = await authService.hashPassword('TestPassword123!');
    const [user] = await db('users')
      .insert({
        email: `wrong-secret-${Date.now()}@example.com`,
        password_hash: passwordHash,
        first_name: 'Wrong',
        last_name: 'Secret',
        role: 'analyst',
        permissions: JSON.stringify([]),
        organization_id: testOrganizationId,
      })
      .returning('*');

    createdUserIds.push(user.id);

    // Generate token with wrong secret
    const tokenWithWrongSecret = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: [],
        organizationId: user.organization_id,
      },
      'wrong-secret-key-that-is-at-least-32-characters-long',
      {
        expiresIn: '1h',
        algorithm: 'HS256',
      }
    );

    // Property: Token signed with wrong secret must be rejected
    const decoded = authService.verifyToken(tokenWithWrongSecret, false);
    expect(decoded).toBeNull();
  });

  /**
   * Property 1.8: Token payload contains all required fields
   * Requirement 1.1, 1.2
   */
  it('should generate tokens with all required payload fields', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        const db = getDbConnection();
        // Create user in database
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `payload-${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate token
        const accessToken = authService.generateAccessToken(user);

        // Decode token
        const decoded = jwt.decode(accessToken) as any;

        // Property: Token must contain all required fields
        expect(decoded).toHaveProperty('userId');
        expect(decoded).toHaveProperty('email');
        expect(decoded).toHaveProperty('role');
        expect(decoded).toHaveProperty('permissions');
        expect(decoded).toHaveProperty('organizationId');
        expect(decoded).toHaveProperty('iat');
        expect(decoded).toHaveProperty('exp');

        // Property: Fields must match user data
        expect(decoded.userId).toBe(user.id);
        expect(decoded.email).toBe(user.email);
        expect(decoded.role).toBe(user.role);
        expect(decoded.organizationId).toBe(user.organization_id);
      }),
      { numRuns: 20 }
    );
  });
});
