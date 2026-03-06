/**
 * Prometheus Metrics Configuration
 * 
 * Exposes metrics for monitoring system health and performance
 * Validates: Requirements 11.6, 11.7, 11.8, 11.9, 11.10
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a Registry to register metrics
export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// HTTP Request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 300, 500, 1000, 2000, 5000], // Response time buckets
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestRate = new Counter({
  name: 'http_request_rate',
  help: 'Rate of HTTP requests per second',
  labelNames: ['method', 'route'],
  registers: [register],
});

export const httpErrorRate = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ML Prediction metrics
export const mlPredictionDuration = new Histogram({
  name: 'ml_prediction_duration_ms',
  help: 'Duration of ML predictions in milliseconds',
  labelNames: ['model_type', 'status'],
  buckets: [50, 100, 200, 300, 400, 500, 750, 1000, 2000], // ML prediction time buckets
  registers: [register],
});

export const mlPredictionTotal = new Counter({
  name: 'ml_predictions_total',
  help: 'Total number of ML predictions',
  labelNames: ['model_type', 'status'],
  registers: [register],
});

export const mlPredictionTimeoutRate = new Counter({
  name: 'ml_prediction_timeouts_total',
  help: 'Total number of ML prediction timeouts',
  labelNames: ['model_type'],
  registers: [register],
});

// Cache metrics
export const cacheHitRate = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMissRate = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheHitRatio = new Gauge({
  name: 'cache_hit_ratio',
  help: 'Cache hit ratio (hits / (hits + misses))',
  labelNames: ['cache_type'],
  registers: [register],
});

// Database metrics
export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Current database connection pool size',
  registers: [register],
});

export const dbConnectionPoolUsed = new Gauge({
  name: 'db_connection_pool_used',
  help: 'Number of used database connections',
  registers: [register],
});

export const dbConnectionPoolFree = new Gauge({
  name: 'db_connection_pool_free',
  help: 'Number of free database connections',
  registers: [register],
});

export const dbConnectionPoolUtilization = new Gauge({
  name: 'db_connection_pool_utilization',
  help: 'Database connection pool utilization percentage',
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_ms',
  help: 'Duration of database queries in milliseconds',
  labelNames: ['query_type'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000], // Query time buckets
  registers: [register],
});

export const dbSlowQueryTotal = new Counter({
  name: 'db_slow_queries_total',
  help: 'Total number of slow database queries (> 1 second)',
  labelNames: ['query_type'],
  registers: [register],
});

// WebSocket metrics
export const wsConnectionCount = new Gauge({
  name: 'websocket_connections_total',
  help: 'Current number of WebSocket connections',
  registers: [register],
});

export const wsMessageRate = new Counter({
  name: 'websocket_messages_total',
  help: 'Total number of WebSocket messages sent',
  labelNames: ['event_type'],
  registers: [register],
});

export const wsConnectionDuration = new Histogram({
  name: 'websocket_connection_duration_seconds',
  help: 'Duration of WebSocket connections in seconds',
  buckets: [60, 300, 600, 1800, 3600, 7200], // Connection duration buckets
  registers: [register],
});

// Circuit breaker metrics
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerFailures = new Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['service'],
  registers: [register],
});

// Rate limiting metrics
export const rateLimitViolations = new Counter({
  name: 'rate_limit_violations_total',
  help: 'Total number of rate limit violations',
  labelNames: ['endpoint', 'limit_type'],
  registers: [register],
});

// Storage metrics
export const storageCapacity = new Gauge({
  name: 'storage_capacity_bytes',
  help: 'Total storage capacity in bytes',
  registers: [register],
});

export const storageUsed = new Gauge({
  name: 'storage_used_bytes',
  help: 'Used storage in bytes',
  registers: [register],
});

export const storageUtilization = new Gauge({
  name: 'storage_utilization_percent',
  help: 'Storage utilization percentage',
  registers: [register],
});

/**
 * Helper function to calculate and update cache hit ratio
 */
export function updateCacheHitRatio(cacheType: string, hits: number, misses: number): void {
  const total = hits + misses;
  if (total > 0) {
    const ratio = hits / total;
    cacheHitRatio.set({ cache_type: cacheType }, ratio);
  }
}

/**
 * Helper function to update circuit breaker state metric
 */
export function updateCircuitBreakerState(service: string, state: string): void {
  const stateValue = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;
  circuitBreakerState.set({ service }, stateValue);
}
