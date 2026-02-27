import knex, { Knex } from 'knex';

let db: Knex | null = null;

/**
 * Get database connection instance
 * Creates a new connection if one doesn't exist
 */
export function getDbConnection(): Knex {
  if (!db) {
    db = knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'customer_insights',
      },
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        max: parseInt(process.env.DB_POOL_MAX || '10'),
      },
      acquireConnectionTimeout: 10000,
    });
  }

  return db;
}

/**
 * Close database connection
 */
export async function closeDbConnection(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
