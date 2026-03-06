/**
 * Alerting Service
 * 
 * Monitors critical metrics and triggers alerts when thresholds are exceeded
 * Validates: Requirements 11.11, 11.12, 11.13, 14.10
 */

import { logger } from '../config/logger';
import { register } from '../config/metrics';

export interface AlertConfig {
  name: string;
  description: string;
  threshold: number;
  comparison: 'greater_than' | 'less_than';
  metricName: string;
  labels?: Record<string, string>;
  cooldownMs: number; // Minimum time between alerts
}

export interface Alert {
  name: string;
  description: string;
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  timestamp: Date;
}

class AlertingService {
  private alerts: Map<string, number> = new Map(); // Track last alert time
  private alertConfigs: AlertConfig[] = [];

  constructor() {
    this.initializeAlertConfigs();
  }

  /**
   * Initialize alert configurations
   */
  private initializeAlertConfigs(): void {
    this.alertConfigs = [
      {
        name: 'high_response_time',
        description: 'Response time p95 exceeds 1000ms',
        threshold: 1000,
        comparison: 'greater_than',
        metricName: 'http_request_duration_ms',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
      },
      {
        name: 'high_error_rate',
        description: 'Error rate exceeds 5%',
        threshold: 0.05,
        comparison: 'greater_than',
        metricName: 'http_errors_total',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
      },
      {
        name: 'low_cache_hit_rate',
        description: 'Cache hit rate falls below 70%',
        threshold: 0.70,
        comparison: 'less_than',
        metricName: 'cache_hit_ratio',
        cooldownMs: 10 * 60 * 1000, // 10 minutes
      },
      {
        name: 'high_ml_timeout_rate',
        description: 'ML prediction timeout rate exceeds 5%',
        threshold: 0.05,
        comparison: 'greater_than',
        metricName: 'ml_prediction_timeouts_total',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
      },
      {
        name: 'high_storage_utilization',
        description: 'Storage capacity exceeds 90%',
        threshold: 90,
        comparison: 'greater_than',
        metricName: 'storage_utilization_percent',
        cooldownMs: 30 * 60 * 1000, // 30 minutes
      },
    ];

    logger.info('Alerting service initialized', {
      alertCount: this.alertConfigs.length,
    });
  }

  /**
   * Check all alert conditions
   */
  async checkAlerts(): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];

    for (const config of this.alertConfigs) {
      try {
        const alert = await this.checkAlert(config);
        if (alert) {
          triggeredAlerts.push(alert);
        }
      } catch (error) {
        logger.error('Error checking alert', {
          alertName: config.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return triggeredAlerts;
  }

  /**
   * Check a single alert condition
   */
  private async checkAlert(config: AlertConfig): Promise<Alert | null> {
    // Check cooldown period
    const lastAlertTime = this.alerts.get(config.name) || 0;
    const now = Date.now();

    if (now - lastAlertTime < config.cooldownMs) {
      return null; // Still in cooldown period
    }

    // Get metric value
    const value = await this.getMetricValue(config.metricName, config.labels);

    if (value === null) {
      return null; // Metric not available
    }

    // Check threshold
    const shouldAlert =
      config.comparison === 'greater_than'
        ? value > config.threshold
        : value < config.threshold;

    if (!shouldAlert) {
      return null;
    }

    // Trigger alert
    this.alerts.set(config.name, now);

    const alert: Alert = {
      name: config.name,
      description: config.description,
      severity: this.determineSeverity(config, value),
      value,
      threshold: config.threshold,
      timestamp: new Date(),
    };

    // Log alert
    logger.warn('Alert triggered', {
      alert: config.name,
      description: config.description,
      value,
      threshold: config.threshold,
      severity: alert.severity,
    });

    // Send alert notification (implement based on your notification system)
    await this.sendAlertNotification(alert);

    return alert;
  }

  /**
   * Get metric value from Prometheus registry
   */
  private async getMetricValue(
    metricName: string,
    labels?: Record<string, string>
  ): Promise<number | null> {
    try {
      const metrics = await register.getMetricsAsJSON();
      const metric = metrics.find((m) => m.name === metricName);

      if (!metric) {
        return null;
      }

      // Handle different metric types
      if (metric.type === 'histogram') {
        // For histograms, calculate p95
        return this.calculatePercentile(metric.values as any[], 0.95);
      } else if (metric.type === 'gauge') {
        // For gauges, return the value
        const values = metric.values as any[];
        if (values.length === 0) return null;

        // If labels specified, find matching value
        if (labels) {
          const matchingValue = values.find((v) =>
            Object.entries(labels).every(([key, value]) => v.labels[key] === value)
          );
          return matchingValue ? matchingValue.value : null;
        }

        // Return first value if no labels specified
        return values[0].value;
      } else if (metric.type === 'counter') {
        // For counters, calculate rate or ratio
        return this.calculateCounterRate(metric.values as any[]);
      }

      return null;
    } catch (error) {
      logger.error('Error getting metric value', {
        metricName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Calculate percentile from histogram buckets
   */
  private calculatePercentile(values: any[], percentile: number): number {
    // Simplified percentile calculation
    // In production, use proper histogram quantile calculation
    const allValues: number[] = [];

    for (const value of values) {
      if (value.metricName && value.metricName.includes('_bucket')) {
        const bucketValue = parseFloat(value.labels.le);
        const count = value.value;
        for (let i = 0; i < count; i++) {
          allValues.push(bucketValue);
        }
      }
    }

    if (allValues.length === 0) return 0;

    allValues.sort((a, b) => a - b);
    const index = Math.ceil(allValues.length * percentile) - 1;
    return allValues[index] || 0;
  }

  /**
   * Calculate rate from counter values
   */
  private calculateCounterRate(values: any[]): number {
    // Simplified rate calculation
    // In production, calculate rate over time window
    const total = values.reduce((sum, v) => sum + v.value, 0);
    return total;
  }

  /**
   * Determine alert severity based on how much threshold is exceeded
   */
  private determineSeverity(config: AlertConfig, value: number): 'warning' | 'critical' {
    const ratio = Math.abs(value - config.threshold) / config.threshold;

    // If value exceeds threshold by more than 50%, it's critical
    if (ratio > 0.5) {
      return 'critical';
    }

    return 'warning';
  }

  /**
   * Send alert notification
   * Implement based on your notification system (email, Slack, PagerDuty, etc.)
   */
  private async sendAlertNotification(alert: Alert): Promise<void> {
    // TODO: Implement notification system integration
    // Examples:
    // - Send email via SendGrid
    // - Post to Slack webhook
    // - Create PagerDuty incident
    // - Send SMS via Twilio

    logger.info('Alert notification sent', {
      alert: alert.name,
      severity: alert.severity,
      value: alert.value,
      threshold: alert.threshold,
    });

    // For now, just log the alert
    // In production, integrate with your notification system
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): string[] {
    const now = Date.now();
    const activeAlerts: string[] = [];

    for (const [alertName, lastAlertTime] of this.alerts.entries()) {
      const config = this.alertConfigs.find((c) => c.name === alertName);
      if (config && now - lastAlertTime < config.cooldownMs) {
        activeAlerts.push(alertName);
      }
    }

    return activeAlerts;
  }

  /**
   * Reset alert cooldown (for testing or manual intervention)
   */
  resetAlert(alertName: string): void {
    this.alerts.delete(alertName);
    logger.info('Alert cooldown reset', { alertName });
  }

  /**
   * Get alert configuration
   */
  getAlertConfigs(): AlertConfig[] {
    return this.alertConfigs;
  }
}

// Export singleton instance
export const alertingService = new AlertingService();

/**
 * Start periodic alert checking
 */
export function startAlertMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
  logger.info('Starting alert monitoring', { intervalMs });

  return setInterval(async () => {
    try {
      const alerts = await alertingService.checkAlerts();

      if (alerts.length > 0) {
        logger.warn('Alerts triggered', {
          count: alerts.length,
          alerts: alerts.map((a) => a.name),
        });
      }
    } catch (error) {
      logger.error('Error in alert monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, intervalMs);
}
