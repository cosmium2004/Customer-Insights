# Database Schema Documentation

## Overview

The AI Customer Insights Platform uses PostgreSQL with a well-structured schema optimized for multi-tenant SaaS operations. All tables use UUID primary keys and include proper foreign key constraints, indexes, and check constraints where applicable.

## Tables

### 1. organizations

Tenant entities for multi-tenant isolation.

**Columns:**
- `id` (UUID, PK): Unique organization identifier
- `name` (VARCHAR(255), NOT NULL): Organization name
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- Primary key on `id`

---

### 2. users

Platform users with authentication and role-based permissions.

**Columns:**
- `id` (UUID, PK): Unique user identifier
- `email` (VARCHAR(255), UNIQUE, NOT NULL): User email address
- `password_hash` (VARCHAR(255), NOT NULL): Bcrypt hashed password
- `first_name` (VARCHAR(100), NOT NULL): User first name
- `last_name` (VARCHAR(100), NOT NULL): User last name
- `role` (VARCHAR(50), NOT NULL): User role (admin, analyst, viewer)
- `permissions` (JSONB): User permissions array
- `organization_id` (UUID, FK, NOT NULL): Reference to organizations table
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp
- `last_login_at` (TIMESTAMP): Last login timestamp

**Indexes:**
- Primary key on `id`
- Index on `email`
- Index on `organization_id`

**Foreign Keys:**
- `organization_id` → `organizations(id)`

**Constraints:**
- Email must be unique
- Password must be bcrypt hashed (10 rounds)

---

### 3. customers

End-users whose interactions are being analyzed.

**Columns:**
- `id` (UUID, PK): Unique customer identifier
- `organization_id` (UUID, FK, NOT NULL): Reference to organizations table
- `external_id` (VARCHAR(255), NOT NULL): Client's customer ID
- `email` (VARCHAR(255)): Customer email address
- `first_name` (VARCHAR(100)): Customer first name
- `last_name` (VARCHAR(100)): Customer last name
- `segment` (VARCHAR(100)): Customer segment classification
- `metadata` (JSONB): Additional customer metadata
- `first_seen_at` (TIMESTAMP, NOT NULL): First interaction timestamp
- `last_seen_at` (TIMESTAMP, NOT NULL): Most recent interaction timestamp
- `interaction_count` (INTEGER): Total number of interactions
- `average_sentiment` (DECIMAL(5,4)): Average sentiment score
- `created_at` (TIMESTAMP): Creation timestamp
- `updated_at` (TIMESTAMP): Last update timestamp

**Indexes:**
- Primary key on `id`
- Index on `organization_id`
- Composite index on `(organization_id, external_id)`
- Index on `email`
- Index on `segment`

**Foreign Keys:**
- `organization_id` → `organizations(id)`

**Constraints:**
- Unique constraint on `(organization_id, external_id)`
- `average_sentiment` must be between -1 and 1 if present
- `interaction_count` must be non-negative

---

### 4. customer_interactions

All customer touchpoints and events with full-text search capability.

**Columns:**
- `id` (UUID, PK): Unique interaction identifier
- `customer_id` (UUID, FK, NOT NULL): Reference to customers table
- `organization_id` (UUID, FK, NOT NULL): Reference to organizations table
- `timestamp` (TIMESTAMP, NOT NULL): Interaction timestamp
- `channel` (VARCHAR(50), NOT NULL): Interaction channel (web, mobile, email, chat, phone)
- `event_type` (VARCHAR(100), NOT NULL): Type of event
- `content` (TEXT): Interaction content/message
- `sentiment` (JSONB): Sentiment analysis results
- `sentiment_confidence` (DECIMAL(5,4)): Confidence score for sentiment
- `metadata` (JSONB): Additional interaction metadata
- `processed_at` (TIMESTAMP): ML processing timestamp
- `created_at` (TIMESTAMP): Creation timestamp

**Indexes:**
- Primary key on `id`
- Index on `customer_id`
- Index on `organization_id`
- Descending index on `timestamp` (for time-range queries)
- Index on `channel`
- Index on `sentiment->>'label'` (JSONB field extraction)
- GIN index on `metadata` (for JSONB queries)
- GIN full-text search index on `content` (using English dictionary)

**Foreign Keys:**
- `customer_id` → `customers(id)`
- `organization_id` → `organizations(id)`

**Constraints:**
- `timestamp` must not be in the future
- `channel` must be one of: web, mobile, email, chat, phone
- `sentiment_confidence` must be between 0 and 1 if present

---

### 5. behavior_patterns

Detected behavior patterns with confidence scores.

**Columns:**
- `id` (UUID, PK): Unique pattern identifier
- `customer_id` (UUID, FK, NOT NULL): Reference to customers table
- `organization_id` (UUID, FK, NOT NULL): Reference to organizations table
- `pattern_type` (VARCHAR(100), NOT NULL): Type of pattern detected
- `confidence` (DECIMAL(5,4), NOT NULL): Confidence score (0-1)
- `frequency` (INTEGER, NOT NULL): Pattern occurrence frequency
- `description` (TEXT): Human-readable pattern description
- `metadata` (JSONB): Additional pattern metadata
- `detected_at` (TIMESTAMP, NOT NULL): Pattern detection timestamp
- `valid_until` (TIMESTAMP): Pattern expiration timestamp
- `created_at` (TIMESTAMP): Creation timestamp

**Indexes:**
- Primary key on `id`
- Index on `customer_id`
- Index on `organization_id`
- Index on `pattern_type`
- Descending index on `detected_at`

**Foreign Keys:**
- `customer_id` → `customers(id)`
- `organization_id` → `organizations(id)`

**Constraints:**
- CHECK: `confidence >= 0 AND confidence <= 1`
- CHECK: `frequency > 0`
- `valid_until` must be after `detected_at` if present

---

### 6. refresh_tokens

JWT refresh token management for authentication.

**Columns:**
- `id` (UUID, PK): Unique token identifier
- `user_id` (UUID, FK, NOT NULL): Reference to users table
- `token` (TEXT, NOT NULL): Refresh token value
- `expires_at` (TIMESTAMP, NOT NULL): Token expiration timestamp
- `created_at` (TIMESTAMP): Creation timestamp

**Indexes:**
- Primary key on `id`
- Index on `user_id`
- Index on `token`

**Foreign Keys:**
- `user_id` → `users(id)`

**Constraints:**
- Tokens expire after 7 days
- Expired tokens should be cleaned up periodically

---

## Migration Order

Migrations must be run in the following order due to foreign key dependencies:

1. `001_create_organizations.js` - Base tenant table
2. `002_create_users.js` - Depends on organizations
3. `003_create_customers.js` - Depends on organizations
4. `004_create_customer_interactions.js` - Depends on customers and organizations
5. `005_create_behavior_patterns.js` - Depends on customers and organizations
6. `006_add_indexes.js` - Adds specialized indexes (GIN, full-text search)
7. `007_create_refresh_tokens.js` - Depends on users

## Performance Optimizations

### Indexes

- **B-tree indexes**: Used for primary keys, foreign keys, and timestamp range queries
- **GIN indexes**: Used for JSONB fields and full-text search
- **Descending indexes**: Used for timestamp fields to optimize recent-first queries

### Query Optimization

- All foreign key fields are indexed for efficient joins
- Timestamp fields use descending indexes for recent-first queries
- JSONB fields use GIN indexes for efficient JSON queries
- Full-text search uses PostgreSQL's built-in GIN index with English dictionary

### Data Integrity

- Foreign key constraints ensure referential integrity
- Check constraints enforce business rules at database level
- Unique constraints prevent duplicate data
- NOT NULL constraints ensure required fields are always populated

## Running Migrations

```bash
# Install dependencies
cd database
npm install

# Run all migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Create new migration
npm run migrate:make migration_name
```

## Environment Variables

Required environment variables (see `.env.example`):

- `POSTGRES_HOST`: PostgreSQL host (default: localhost)
- `POSTGRES_PORT`: PostgreSQL port (default: 5432)
- `POSTGRES_DB`: Database name (default: customer_insights)
- `POSTGRES_USER`: Database user (default: postgres)
- `POSTGRES_PASSWORD`: Database password
- `DATABASE_URL`: Full connection string for production

## Validation

To verify the schema is correctly set up:

1. Run migrations: `npm run migrate`
2. Check tables exist: `\dt` in psql
3. Check indexes: `\di` in psql
4. Verify constraints: `\d+ table_name` in psql
