# Database Schema Validation Tests

This directory contains comprehensive tests for validating the database schema integrity, constraints, and index usage.

## Test Coverage

### 1. Foreign Key Constraints
Tests that verify referential integrity is enforced:
- `users.organization_id` → `organizations.id`
- `customers.organization_id` → `organizations.id`
- `customer_interactions.customer_id` → `customers.id`
- `customer_interactions.organization_id` → `organizations.id`
- `behavior_patterns.customer_id` → `customers.id`
- `behavior_patterns.organization_id` → `organizations.id`
- `refresh_tokens.user_id` → `users.id`

### 2. Unique Constraints
Tests that verify uniqueness is enforced:
- `users.email` must be unique across all users
- `customers(organization_id, external_id)` must be unique within organization
- Customers can have same `external_id` in different organizations

### 3. Check Constraints
Tests that verify business rules are enforced at database level:
- `behavior_patterns.confidence` must be between 0 and 1
- `behavior_patterns.frequency` must be positive (> 0)

### 4. Index Existence and Usage
Tests that verify indexes exist and are used in query plans:
- Primary key indexes on all tables
- Foreign key indexes for efficient joins
- B-tree indexes for timestamp range queries
- GIN indexes for JSONB queries
- Full-text search indexes for content queries
- Descending indexes for recent-first queries

## Running Tests

### Prerequisites
1. PostgreSQL must be running
2. Environment variables must be configured (see `.env.example`)
3. Database migrations must be run

### Install Dependencies
```bash
cd database
npm install
```

### Run Migrations
```bash
npm run migrate
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

Each test suite follows this pattern:
1. **Setup**: Create test data with proper foreign key relationships
2. **Test**: Execute the test case
3. **Teardown**: Clean up test data in reverse dependency order

## Requirements Validated

These tests validate the following requirements from the specification:
- **10.1**: UUID primary keys
- **10.2**: Email uniqueness
- **10.3**: Organization references
- **10.4**: Customer interaction references
- **10.5**: Organization references in interactions
- **10.6**: Unique customer external IDs within organization
- **10.7**: Confidence score constraints
- **10.8**: Frequency constraints
- **10.9**: B-tree indexes for timestamps
- **10.10**: B-tree indexes for foreign keys
- **10.11**: GIN indexes for JSONB
- **10.12**: Full-text search indexes
- **10.13**: Automatic created_at timestamps
- **10.14**: Automatic updated_at timestamps

## Notes

- Tests use the development database configuration
- Each test creates and cleans up its own test data
- Tests verify both constraint enforcement (rejections) and valid operations (acceptances)
- Query plan tests use `EXPLAIN (FORMAT JSON)` to verify index usage
- Tests avoid sequential scans to ensure optimal query performance
