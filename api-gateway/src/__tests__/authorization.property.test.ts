import fc from 'fast-check';
import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService';
import { getDbConnection, closeDbConnection } from '../config/database';
import { authenticate } from '../middleware/authenticate';
import { requireRole, requirePermission, requireAnyPermission, requireAllPermissions } from '../middleware/authorize';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Property Test 8: User Authorization
 * 
 * Validates Requirements: 1.8, 1.9, 7.7, 7.8
 * 
 * This property test verifies that:
 * - All protected endpoints require valid tokens
 * - Endpoints enforce appropriate role-based permissions
 * - Missing tokens result in 401 Unauthorized
 * - Expired tokens result in 401 Unauthorized
 * - Insufficient permissions result in 403 Forbidden
 * 
 * Tests with:
 * - Missing tokens
 * - Expired tokens
 * - Invalid tokens
 * - Insufficient permissions
 * - Valid tokens with correct permissions
 */

describe('Property Test: User Authorization', () => {
  let authService: AuthService;
  let testOrganizationId: string;
  let createdUserIds: string[] = [];
  let testApp: Express;

  beforeAll(async () => {
    const db = getDbConnection();
    authService = new AuthService(db);

    // Create a test organization
    const [org] = await db('organizations')
      .insert({
        name: 'Authorization Test Organization',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    testOrganizationId = org.id;

    // Set up test Express app with protected routes
    testApp = express();
    testApp.use(express.json());

    // Public endpoint (no authentication required)
    testApp.get('/api/public', (req: Request, res: Response) => {
      res.json({ message: 'Public endpoint' });
    });

    // Protected endpoint (authentication required)
    testApp.get('/api/protected', authenticate, (req: Request, res: Response) => {
      res.json({ message: 'Protected endpoint', user: req.user });
    });

    // Admin-only endpoint
    testApp.get('/api/admin', authenticate, requireRole('admin'), (req: Request, res: Response) => {
      res.json({ message: 'Admin endpoint', user: req.user });
    });

    // Analyst-only endpoint
    testApp.get('/api/analyst', authenticate, requireRole('analyst'), (req: Request, res: Response) => {
      res.json({ message: 'Analyst endpoint', user: req.user });
    });

    // Viewer-only endpoint (all authenticated users can access)
    testApp.get('/api/viewer', authenticate, requireRole('viewer'), (req: Request, res: Response) => {
      res.json({ message: 'Viewer endpoint', user: req.user });
    });

    // Permission-based endpoint
    testApp.get('/api/permission/read', authenticate, requirePermission('data:read'), (req: Request, res: Response) => {
      res.json({ message: 'Read permission endpoint', user: req.user });
    });

    // Multiple permissions endpoint (any)
    testApp.get('/api/permission/any', authenticate, requireAnyPermission(['data:read', 'data:write']), (req: Request, res: Response) => {
      res.json({ message: 'Any permission endpoint', user: req.user });
    });

    // Multiple permissions endpoint (all)
    testApp.get('/api/permission/all', authenticate, requireAllPermissions(['data:read', 'data:write']), (req: Request, res: Response) => {
      res.json({ message: 'All permissions endpoint', user: req.user });
    });

    // Error handler
    testApp.use(errorHandler);
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

  // Arbitrary for generating user data with different roles
  const userWithRoleArbitrary = fc.record({
    email: fc.emailAddress(),
    firstName: fc.string({ minLength: 1, maxLength: 50 }),
    lastName: fc.string({ minLength: 1, maxLength: 50 }),
    role: fc.constantFrom('admin', 'analyst', 'viewer'),
    permissions: fc.array(fc.constantFrom('data:read', 'data:write', 'data:delete', 'user:manage'), { maxLength: 4 }),
  });

  /**
   * Property 8.1: Protected endpoints reject requests without tokens
   * Requirement 1.8, 7.7
   */
  it('should reject requests to protected endpoints without authentication token', async () => {
    const protectedEndpoints = [
      '/api/protected',
      '/api/admin',
      '/api/analyst',
      '/api/viewer',
      '/api/permission/read',
      '/api/permission/any',
      '/api/permission/all',
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request(testApp)
        .get(endpoint)
        .expect(401);

      // Property: All protected endpoints must return 401 without token
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('authorization');
    }
  });

  /**
   * Property 8.2: Protected endpoints reject requests with expired tokens
   * Requirement 1.8, 7.7
   */
  it('should reject requests with expired tokens', async () => {
    await fc.assert(
      fc.asyncProperty(userWithRoleArbitrary, async (userData) => {
        const db = getDbConnection();
        
        // Create user
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `expired-${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        // Generate expired token
        const expiredToken = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            role: user.role,
            permissions: userData.permissions,
            organizationId: user.organization_id,
          },
          process.env.JWT_SECRET || '',
          {
            expiresIn: '-1h', // Expired 1 hour ago
            algorithm: 'HS256',
          }
        );

        // Property: Expired token must be rejected with 401
        const response = await request(testApp)
          .get('/api/protected')
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(401);

        expect(response.body).toHaveProperty('error');
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 8.3: Protected endpoints reject requests with invalid tokens
   * Requirement 1.8, 7.7
   */
  it('should reject requests with invalid or tampered tokens', async () => {
    await fc.assert(
      fc.asyncProperty(userWithRoleArbitrary, async (userData) => {
        const db = getDbConnection();
        
        // Create user
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `invalid-${Date.now()}-${userData.email}`,
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

        // Tamper with token signature
        const parts = validToken.split('.');
        const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2].split('').reverse().join('')}`;

        // Property: Tampered token must be rejected with 401
        const response = await request(testApp)
          .get('/api/protected')
          .set('Authorization', `Bearer ${tamperedToken}`)
          .expect(401);

        expect(response.body).toHaveProperty('error');
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 8.4: Role-based authorization enforces role hierarchy
   * Requirement 1.9, 7.8
   */
  it('should enforce role hierarchy for protected endpoints', async () => {
    const db = getDbConnection();

    // Create users with different roles
    const roles = ['viewer', 'analyst', 'admin'];
    const users: any[] = [];

    for (const role of roles) {
      const passwordHash = await authService.hashPassword('TestPassword123!');
      const [user] = await db('users')
        .insert({
          email: `role-${role}-${Date.now()}@example.com`,
          password_hash: passwordHash,
          first_name: 'Test',
          last_name: role,
          role: role,
          permissions: JSON.stringify([]),
          organization_id: testOrganizationId,
        })
        .returning('*');

      createdUserIds.push(user.id);
      users.push({ ...user, token: authService.generateAccessToken(user) });
    }

    // Property: Viewer can access viewer endpoint
    await request(testApp)
      .get('/api/viewer')
      .set('Authorization', `Bearer ${users[0].token}`)
      .expect(200);

    // Property: Viewer cannot access analyst endpoint
    await request(testApp)
      .get('/api/analyst')
      .set('Authorization', `Bearer ${users[0].token}`)
      .expect(403);

    // Property: Viewer cannot access admin endpoint
    await request(testApp)
      .get('/api/admin')
      .set('Authorization', `Bearer ${users[0].token}`)
      .expect(403);

    // Property: Analyst can access viewer endpoint (role hierarchy)
    await request(testApp)
      .get('/api/viewer')
      .set('Authorization', `Bearer ${users[1].token}`)
      .expect(200);

    // Property: Analyst can access analyst endpoint
    await request(testApp)
      .get('/api/analyst')
      .set('Authorization', `Bearer ${users[1].token}`)
      .expect(200);

    // Property: Analyst cannot access admin endpoint
    await request(testApp)
      .get('/api/admin')
      .set('Authorization', `Bearer ${users[1].token}`)
      .expect(403);

    // Property: Admin can access all endpoints
    await request(testApp)
      .get('/api/viewer')
      .set('Authorization', `Bearer ${users[2].token}`)
      .expect(200);

    await request(testApp)
      .get('/api/analyst')
      .set('Authorization', `Bearer ${users[2].token}`)
      .expect(200);

    await request(testApp)
      .get('/api/admin')
      .set('Authorization', `Bearer ${users[2].token}`)
      .expect(200);
  });

  /**
   * Property 8.5: Permission-based authorization enforces specific permissions
   * Requirement 1.9, 7.8
   */
  it('should enforce permission-based access control', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          firstName: fc.string({ minLength: 1, maxLength: 50 }),
          lastName: fc.string({ minLength: 1, maxLength: 50 }),
          role: fc.constantFrom('admin', 'analyst', 'viewer'),
          hasReadPermission: fc.boolean(),
          hasWritePermission: fc.boolean(),
        }),
        async (userData) => {
          const db = getDbConnection();

          // Build permissions array based on flags
          const permissions: string[] = [];
          if (userData.hasReadPermission) permissions.push('data:read');
          if (userData.hasWritePermission) permissions.push('data:write');

          // Create user
          const passwordHash = await authService.hashPassword('TestPassword123!');
          const [user] = await db('users')
            .insert({
              email: `perm-${Date.now()}-${userData.email}`,
              password_hash: passwordHash,
              first_name: userData.firstName,
              last_name: userData.lastName,
              role: userData.role,
              permissions: JSON.stringify(permissions),
              organization_id: testOrganizationId,
            })
            .returning('*');

          createdUserIds.push(user.id);

          const token = authService.generateAccessToken(user);

          // Property: User with data:read permission can access read endpoint
          if (userData.hasReadPermission) {
            await request(testApp)
              .get('/api/permission/read')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);
          } else {
            // Property: User without data:read permission cannot access read endpoint
            await request(testApp)
              .get('/api/permission/read')
              .set('Authorization', `Bearer ${token}`)
              .expect(403);
          }

          // Property: User with any permission (read OR write) can access any endpoint
          if (userData.hasReadPermission || userData.hasWritePermission) {
            await request(testApp)
              .get('/api/permission/any')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);
          } else {
            await request(testApp)
              .get('/api/permission/any')
              .set('Authorization', `Bearer ${token}`)
              .expect(403);
          }

          // Property: User with all permissions (read AND write) can access all endpoint
          if (userData.hasReadPermission && userData.hasWritePermission) {
            await request(testApp)
              .get('/api/permission/all')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);
          } else {
            await request(testApp)
              .get('/api/permission/all')
              .set('Authorization', `Bearer ${token}`)
              .expect(403);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 8.6: Valid tokens with correct permissions grant access
   * Requirement 1.8, 1.9
   */
  it('should grant access to users with valid tokens and correct permissions', async () => {
    await fc.assert(
      fc.asyncProperty(userWithRoleArbitrary, async (userData) => {
        const db = getDbConnection();

        // Create user
        const passwordHash = await authService.hashPassword('TestPassword123!');
        const [user] = await db('users')
          .insert({
            email: `valid-${Date.now()}-${userData.email}`,
            password_hash: passwordHash,
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            permissions: JSON.stringify(userData.permissions),
            organization_id: testOrganizationId,
          })
          .returning('*');

        createdUserIds.push(user.id);

        const token = authService.generateAccessToken(user);

        // Property: Valid token grants access to protected endpoint
        const response = await request(testApp)
          .get('/api/protected')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        // Property: Response includes user information
        expect(response.body).toHaveProperty('user');
        expect(response.body.user.userId).toBe(user.id);
        expect(response.body.user.email).toBe(user.email);
        expect(response.body.user.role).toBe(user.role);
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property 8.7: Authorization header format validation
   * Requirement 1.8, 7.7
   */
  it('should reject requests with invalid authorization header format', async () => {
    const db = getDbConnection();

    // Create a test user
    const passwordHash = await authService.hashPassword('TestPassword123!');
    const [user] = await db('users')
      .insert({
        email: `format-${Date.now()}@example.com`,
        password_hash: passwordHash,
        first_name: 'Format',
        last_name: 'Test',
        role: 'analyst',
        permissions: JSON.stringify([]),
        organization_id: testOrganizationId,
      })
      .returning('*');

    createdUserIds.push(user.id);

    const token = authService.generateAccessToken(user);

    // Property: Missing "Bearer " prefix is rejected
    await request(testApp)
      .get('/api/protected')
      .set('Authorization', token)
      .expect(401);

    // Property: Wrong prefix is rejected
    await request(testApp)
      .get('/api/protected')
      .set('Authorization', `Basic ${token}`)
      .expect(401);

    // Property: Empty token after "Bearer " is rejected
    await request(testApp)
      .get('/api/protected')
      .set('Authorization', 'Bearer ')
      .expect(401);

    // Property: Correct format with valid token is accepted
    await request(testApp)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  /**
   * Property 8.8: Public endpoints remain accessible without authentication
   * Requirement 1.8
   */
  it('should allow access to public endpoints without authentication', async () => {
    // Property: Public endpoint accessible without token
    const response = await request(testApp)
      .get('/api/public')
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toBe('Public endpoint');
  });

  /**
   * Property 8.9: Tokens remain valid as long as they haven't expired
   * Requirement 1.8, 7.7
   * 
   * Note: User status checking (suspended/deleted) would require a status column
   * in the users table, which is not currently part of the schema.
   */
  it('should maintain token validity for active users', async () => {
    const db = getDbConnection();

    const passwordHash = await authService.hashPassword('TestPassword123!');
    const [user] = await db('users')
      .insert({
        email: `active-${Date.now()}@example.com`,
        password_hash: passwordHash,
        first_name: 'Active',
        last_name: 'User',
        role: 'analyst',
        permissions: JSON.stringify([]),
        organization_id: testOrganizationId,
      })
      .returning('*');

    createdUserIds.push(user.id);

    const token = authService.generateAccessToken(user);

    // Property: Token for active user is accepted
    const response = await request(testApp)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user.userId).toBe(user.id);
  });

  /**
   * Property 8.10: Authorization errors return appropriate HTTP status codes
   * Requirement 7.7, 7.8
   */
  it('should return correct HTTP status codes for authorization failures', async () => {
    const db = getDbConnection();

    // Create a viewer user
    const passwordHash = await authService.hashPassword('TestPassword123!');
    const [user] = await db('users')
      .insert({
        email: `status-${Date.now()}@example.com`,
        password_hash: passwordHash,
        first_name: 'Status',
        last_name: 'Test',
        role: 'viewer',
        permissions: JSON.stringify([]),
        organization_id: testOrganizationId,
      })
      .returning('*');

    createdUserIds.push(user.id);

    const token = authService.generateAccessToken(user);

    // Property: Missing token returns 401 Unauthorized
    const noTokenResponse = await request(testApp)
      .get('/api/protected')
      .expect(401);
    expect(noTokenResponse.body).toHaveProperty('error');

    // Property: Invalid token returns 401 Unauthorized
    const invalidTokenResponse = await request(testApp)
      .get('/api/protected')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
    expect(invalidTokenResponse.body).toHaveProperty('error');

    // Property: Insufficient permissions return 403 Forbidden
    const forbiddenResponse = await request(testApp)
      .get('/api/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(forbiddenResponse.body).toHaveProperty('error');

    // Property: Valid token with correct permissions returns 200 OK
    const successResponse = await request(testApp)
      .get('/api/viewer')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(successResponse.body).toHaveProperty('message');
  });
});
