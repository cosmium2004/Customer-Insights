import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Knex } from 'knex';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '7d';

interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: string;
  permissions: string[];
  organization_id: string;
  last_login_at: Date | null;
}

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  organizationId: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private db: Knex;
  private jwtSecret: string;
  private jwtRefreshSecret: string;

  constructor(db: Knex) {
    this.db = db;
    this.jwtSecret = process.env.JWT_SECRET || '';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';

    if (!this.jwtSecret || this.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }
    if (!this.jwtRefreshSecret || this.jwtRefreshSecret.length < 32) {
      throw new Error('JWT_REFRESH_SECRET must be at least 32 characters');
    }
  }

  /**
   * Hash a password using bcrypt with 10 rounds
   * @param password - Plain text password
   * @returns Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Compare a password with a hash using constant-time comparison
   * @param password - Plain text password
   * @param hash - Hashed password
   * @returns True if password matches hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token with 1-hour expiration
   * @param user - User object
   * @returns JWT access token
   */
  generateAccessToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      organizationId: user.organization_id,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      algorithm: 'HS256',
    });
  }

  /**
   * Generate JWT refresh token with 7-day expiration
   * @param userId - User ID
   * @returns JWT refresh token
   */
  generateRefreshToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'refresh' },
      this.jwtRefreshSecret,
      {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        algorithm: 'HS256',
      }
    );
  }

  /**
   * Generate both access and refresh tokens
   * @param user - User object
   * @returns Object containing access and refresh tokens
   */
  generateTokens(user: User): AuthTokens {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user.id),
    };
  }

  /**
   * Verify JWT token signature and expiration
   * @param token - JWT token to verify
   * @param isRefreshToken - Whether this is a refresh token
   * @returns Decoded token payload or null if invalid
   */
  verifyToken(token: string, isRefreshToken = false): TokenPayload | null {
    try {
      const secret = isRefreshToken ? this.jwtRefreshSecret : this.jwtSecret;
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      // Token is invalid or expired
      return null;
    }
  }

  /**
   * Store refresh token in database
   * @param userId - User ID
   * @param refreshToken - Refresh token to store
   */
  async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await this.db('refresh_tokens').insert({
      user_id: userId,
      token: refreshToken,
      expires_at: expiresAt,
    });
  }

  /**
   * Validate refresh token from database
   * @param refreshToken - Refresh token to validate
   * @returns User ID if valid, null otherwise
   */
  async validateRefreshToken(refreshToken: string): Promise<string | null> {
    const tokenRecord = await this.db('refresh_tokens')
      .where({ token: refreshToken })
      .where('expires_at', '>', new Date())
      .first();

    if (!tokenRecord) {
      return null;
    }

    // Verify token signature
    const decoded = this.verifyToken(refreshToken, true);
    if (!decoded || !decoded.userId) {
      return null;
    }

    return decoded.userId;
  }

  /**
   * Remove refresh token from database
   * @param refreshToken - Refresh token to remove
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.db('refresh_tokens')
      .where({ token: refreshToken })
      .delete();
  }

  /**
   * Remove all refresh tokens for a user
   * @param userId - User ID
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db('refresh_tokens')
      .where({ user_id: userId })
      .delete();
  }
}
