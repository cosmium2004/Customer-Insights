/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping requests to failing services
 * Validates: Requirements 7.11, 7.12
 */

import { logger } from '../config/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, rejecting requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening circuit
  successThreshold: number;      // Number of successes to close circuit from half-open
  timeout: number;               // Time in ms before attempting to close circuit
  resetTimeout: number;          // Time in ms to wait before transitioning to half-open
  name: string;                  // Circuit breaker name for logging
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000, // 60 seconds
      resetTimeout: options.resetTimeout || 30000, // 30 seconds
      name: options.name || 'CircuitBreaker',
    };

    logger.info(`Circuit breaker initialized: ${this.options.name}`, {
      failureThreshold: this.options.failureThreshold,
      timeout: this.options.timeout,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`Circuit breaker is OPEN for ${this.options.name}`);
        logger.warn(`Circuit breaker rejected request: ${this.options.name}`, {
          state: this.state,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });
        throw error;
      }

      // Transition to half-open to test service
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(`Circuit breaker transitioning to HALF_OPEN: ${this.options.name}`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute with exponential backoff retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 100
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(fn);
      } catch (error) {
        lastError = error as Error;

        // Don't retry if circuit is open
        if (this.state === CircuitState.OPEN) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate exponential backoff delay: baseDelay * 2^attempt
        const delay = baseDelay * Math.pow(2, attempt);
        logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          circuitBreaker: this.options.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info(`Circuit breaker closed: ${this.options.name}`, {
          state: this.state,
        });
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;

    logger.warn(`Circuit breaker failure recorded: ${this.options.name}`, {
      failureCount: this.failureCount,
      threshold: this.options.failureThreshold,
      state: this.state,
    });

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;

      logger.error(`Circuit breaker opened: ${this.options.name}`, {
        state: this.state,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      this.successCount = 0;

      logger.warn(`Circuit breaker reopened from HALF_OPEN: ${this.options.name}`, {
        state: this.state,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt).toISOString() : null,
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();

    logger.info(`Circuit breaker manually reset: ${this.options.name}`);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
