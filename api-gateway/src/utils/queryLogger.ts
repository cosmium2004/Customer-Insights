/**
 * Database Query Logger
 * 
 * Logs slow database queries (> 1 second)
 * Validates: Requirements 11.5
 */

import { Knex } from 'knex';
import { logger } from '../config/logger';
import { dbQueryDuration, dbSlowQueryTotal } from '../config/metrics';

const SLOW_QUERY_THRESHOLD_MS = 1000; // 1 second

/**
 * Wrap a database query with logging and metrics
 */
export async function logQuery<T>(
  queryFn: () => Promise<T>,
  queryType: string,
  queryDescription?: string
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;

    // Track query duration metric
    dbQueryDuration.observe({ query_type: queryType }, duration);

    // Log slow queries
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow database query detected', {
        queryType,
        description: queryDescription,
        duration: `${duration}ms`,
        threshold: `${SLOW_QUERY_THRESHOLD_MS}ms`,
      });

      // Track slow query metric
      dbSlowQueryTotal.inc({ query_type: queryType });
    } else {
      logger.debug('Database query completed', {
        queryType,
        duration: `${duration}ms`,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Database query failed', {
      queryType,
      description: queryDescription,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Setup Knex query event listeners for automatic logging
 */
export function setupQueryLogging(db: Knex): void {
  // Log all queries in development
  if (process.env.NODE_ENV === 'development') {
    db.on('query', (query) => {
      logger.debug('SQL Query', {
        sql: query.sql,
        bindings: query.bindings,
      });
    });
  }

  // Log query errors
  db.on('query-error', (error, query) => {
    logger.error('SQL Query Error', {
      sql: query.sql,
      bindings: query.bindings,
      error: error.message,
    });
  });
}
