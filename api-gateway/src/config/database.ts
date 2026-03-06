import knex, { Knex } from 'knex';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from './logger';
import { setupQueryLogging as setupQueryLoggingUtil } from '../utils/queryLogger';

let db: Knex | null = null;

// Circuit breaker for database connections
const dbCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  resetTimeout: 30000,
  name: 'Database',
});

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
        afterCreate: (conn: any, done: any) => {
          // Test connection after creation
          conn.query('SELECT 1', (err: any) => {
            if (err) {
              logger.error('Database connection test failed', { error: err.message });
            }
            done(err, conn);
          });
        },
      },
      acquireConnectionTimeout: 10000,
    });
  }

  return db;
}

/**
 * Execute a database query with circuit breaker protection
 */
export async function executeQuery<T>(
  queryFn: (db: Knex) => Promise<T>
): Promise<T> {
  return dbCircuitBreaker.executeWithRetry(
    async () => {
      const connection = getDbConnection();
      return await queryFn(connection);
    },
    3, // max retries
    100 // base delay in ms
  );
}

/**
 * Get circuit breaker statistics
 */
export function getDbCircuitBreakerStats() {
  return dbCircuitBreaker.getStats();
}

/**
 * Setup database query logging
 */
export function setupQueryLogging(db: Knex): void {
  setupQueryLoggingUtil(db);
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
