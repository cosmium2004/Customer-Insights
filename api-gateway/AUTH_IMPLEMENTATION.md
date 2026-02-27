# Authentication Service Implementation

## Overview

This document describes the authentication service implementation for the AI-Powered Customer Insights Platform. The implementation includes JWT token management, user registration, login with rate limiting, token refresh, and logout functionality.

## Components Implemented

### 1. Authentication Service (`src/services/authService.ts`)

Core authentication service providing:
- **Password Hashing**: bcrypt with 10 rounds
- **Password Comparison**: Constant-time comparison to prevent timing attacks
- **JWT Token Generation**: 
  - Access tokens with 1-hour expiration (HS256 algorithm)
  - Refresh tokens with 7-day expiration
- **Token Verification**: Signature and expiration validation
- **Token Management**: Store, validate, and revoke refresh tokens

### 2. Authentication Routes (`src/routes/authRoutes.ts`)

RESTful API endpoints:

#### POST /api/auth/register
- Validates email format and password strength
- Requirements: min 12 chars, mixed case, numbers, symbols
- Hashes password before storing
- Returns JWT tokens on successful registration

#### POST /api/auth/login
- Rate limited: 5 attempts per 15 minutes per IP
- Validates credentials without revealing user existence
- Updates last_login_at timestamp on success
- Stores refresh token in database
- Logs failed login attempts with timestamp and IP

#### POST /api/auth/refresh
- Validates refresh token from database
- Generates new access token if refresh token is valid

#### POST /api/auth/logout
- Removes refresh token from database
- Invalidates cached tokens in Redis

### 3. Rate Limiting Middleware (`src/middleware/rateLimiter.ts`)

Two rate limiters implemented:
- **Auth Rate Limiter**: 5 requests per 15 minutes per IP (for login/register)
- **API Rate Limiter**: 100 requests per minute per user (for general API endpoints)

Uses Redis for distributed rate limiting across instances.

### 4. Database Configuration (`src/config/database.ts`)

Knex.js database connection with:
- PostgreSQL client
- Connection pooling (2-10 connections)
- Environment-based configuration

## Security Features

1. **Password Security**
   - bcrypt hashing with 10 rounds
   - Constant-time comparison to prevent timing attacks
   - Minimum password strength requirements

2. **JWT Security**
   - HS256 algorithm
   - Separate secrets for access and refresh tokens
   - Token expiration validation
   - Refresh token storage in database

3. **Rate Limiting**
   - IP-based rate limiting for authentication endpoints
   - User-based rate limiting for API endpoints
   - Redis-backed for distributed systems

4. **Logging**
   - Failed login attempts logged with IP and timestamp
   - Successful logins logged
   - Winston logger for structured logging

5. **Input Validation**
   - Email format validation
   - Password strength validation
   - UUID validation for organization IDs
   - express-validator for request validation

## Testing

Comprehensive test suite (`src/__tests__/auth.test.ts`) covering:
- User registration with valid/invalid data
- Login with valid/invalid credentials
- Token refresh functionality
- Logout and token revocation
- Password strength validation
- Email format validation
- Duplicate email prevention

**Test Results**: All 10 tests passing ✓

## Environment Variables Required

```env
JWT_SECRET=<min 32 characters>
JWT_REFRESH_SECRET=<min 32 characters>
DATABASE_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://host:port
```

## API Response Formats

### Success Response (Register/Login)
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "analyst",
    "organizationId": "uuid"
  }
}
```

### Success Response (Refresh)
```json
{
  "accessToken": "eyJhbGc..."
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": [
    {
      "field": "password",
      "message": "Password must be at least 12 characters..."
    }
  ]
}
```

## Requirements Validated

This implementation validates the following requirements from the spec:

- **1.1**: JWT access token generation with 1-hour expiration ✓
- **1.2**: JWT refresh token generation with 7-day expiration ✓
- **1.3**: Error response without revealing user existence ✓
- **1.4**: bcrypt password hashing with 10 rounds ✓
- **1.5**: Rate limiting (5 attempts per 15 minutes) ✓
- **1.6**: JWT token verification with signature and expiration ✓
- **1.7**: Last login timestamp update ✓
- **1.10**: Refresh token validation and new access token generation ✓
- **7.1**: Email format validation ✓
- **7.6**: 400 Bad Request for validation errors ✓
- **9.1**: bcrypt password hashing ✓
- **9.2**: Constant-time password comparison ✓
- **9.3**: HS256 algorithm for JWT ✓
- **9.7**: Rate limiting for authentication endpoints ✓
- **9.14**: Failed login attempt logging ✓
- **14.1**: JWT token caching in Redis ✓
- **14.2**: Token invalidation on logout ✓

## Next Steps

The authentication service is now complete and ready for integration with:
1. Protected route middleware (task 5.2)
2. Authorization middleware for role-based access (task 5.3)
3. Data ingestion endpoints (task 8)
4. Query service endpoints (task 12)
