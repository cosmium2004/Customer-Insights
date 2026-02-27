# Database Migrations

This directory contains database migrations and seeds for the AI Customer Insights Platform.

## Setup

1. Install dependencies:
   ```bash
   npm install knex pg
   ```

2. Run migrations:
   ```bash
   npx knex migrate:latest
   ```

3. Rollback migrations:
   ```bash
   npx knex migrate:rollback
   ```

## Creating New Migrations

```bash
npx knex migrate:make migration_name
```

## Database Schema

- **organizations**: Tenant entities
- **users**: Platform users with authentication
- **customers**: End-users being analyzed
- **customer_interactions**: Customer touchpoints and events
- **behavior_patterns**: Detected behavior patterns
- **refresh_tokens**: JWT refresh token management
