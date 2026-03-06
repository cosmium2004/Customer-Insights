/**
 * Metrics Routes
 * 
 * Exposes Prometheus metrics endpoint
 * Validates: Requirements 11.6
 */

import { Router, Request, Response } from 'express';
import { register } from '../config/metrics';
import { getDbConnection, getDbCircuitBreakerStats } from '../config/database';
import { getMLCircuitBreakerStats } from '../services/mlService';
import {
  dbConnectionPoolSize,
  dbConnectionPoolUsed,
  dbConnectionPoolFree,
  dbConnectionPoolUtilization,
  updateCircuitBreakerState,
} from '../config/metrics';

const router = Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    // Update database connection pool metrics
    const db = getDbConnection();
    const pool = (db.client as any).pool;

    if (pool) {
      const poolSize = pool.max || 0;
      const poolUsed = pool.numUsed() || 0;
      const poolFree = pool.numFree() || 0;
      const utilization = poolSize > 0 ? (poolUsed / poolSize) * 100 : 0;

      dbConnectionPoolSize.set(poolSize);
      dbConnectionPoolUsed.set(poolUsed);
      dbConnectionPoolFree.set(poolFree);
      dbConnectionPoolUtilization.set(utilization);
    }

    // Update circuit breaker state metrics
    const dbCircuitStats = getDbCircuitBreakerStats();
    updateCircuitBreakerState('database', dbCircuitStats.state);

    const mlCircuitStats = getMLCircuitBreakerStats();
    updateCircuitBreakerState('ml-service', mlCircuitStats.state);

    // Return metrics in Prometheus format
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    const db = getDbConnection();
    await db.raw('SELECT 1');

    // Get circuit breaker states
    const dbCircuitStats = getDbCircuitBreakerStats();
    const mlCircuitStats = getMLCircuitBreakerStats();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbCircuitStats.state === 'CLOSED' ? 'healthy' : 'degraded',
          circuitBreaker: dbCircuitStats.state,
        },
        mlService: {
          status: mlCircuitStats.state === 'CLOSED' ? 'healthy' : 'degraded',
          circuitBreaker: mlCircuitStats.state,
        },
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
