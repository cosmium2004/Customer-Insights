import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import authRoutes from './routes/authRoutes';
import dataRoutes from './routes/dataRoutes';
import patternRoutes from './routes/patternRoutes';
import insightsRoutes from './routes/insightsRoutes';
import metricsRoutes from './routes/metricsRoutes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { globalRateLimiter } from './middleware/rateLimiter';
import { initializeWebSocket } from './config/websocket';
import { initializeRedis, checkRedisHealth } from './config/redis';
import { initializeMLAnalysisWorker, shutdownMLAnalysisWorker } from './workers/mlAnalysisWorker';
import { flushAllBatches } from './services/websocketEventService';
import { startAlertMonitoring } from './services/alertingService';
import { setupQueryLogging, getDbConnection } from './config/database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP or HTTPS server based on environment
let httpServer;
if (process.env.NODE_ENV === 'production' && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  // Use HTTPS in production with SSL certificates
  const httpsOptions = {
    key: readFileSync(process.env.SSL_KEY_PATH),
    cert: readFileSync(process.env.SSL_CERT_PATH),
  };
  httpServer = createHttpsServer(httpsOptions, app);
} else {
  // Use HTTP in development
  httpServer = createServer(app);
}

// Initialize Redis client
initializeRedis();

// Initialize WebSocket server with authentication and WSS support
initializeWebSocket(httpServer);

// Initialize ML analysis worker
initializeMLAnalysisWorker();

// Setup database query logging
const db = getDbConnection();
setupQueryLogging(db);

// Start alert monitoring (check every minute)
let alertMonitoringInterval: NodeJS.Timeout;
if (process.env.NODE_ENV !== 'test') {
  alertMonitoringInterval = startAlertMonitoring(60000);
}

// HTTPS enforcement middleware (in production)
if (process.env.NODE_ENV === 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// Security middleware
app.use(helmet());

// CORS configuration - whitelist specific origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting (1000 req/min per IP)
app.use(globalRateLimiter);

// Metrics middleware (track request metrics)
app.use(metricsMiddleware);

// Request logging middleware
app.use(requestLogger);

// Morgan for HTTP request logging
app.use(morgan('combined'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/patterns', patternRoutes);
app.use('/api/insights', insightsRoutes);

// Metrics and health routes (no auth required)
app.use('/', metricsRoutes);

// Health check
app.get('/health', async (req: Request, res: Response) => {
  const redisHealthy = await checkRedisHealth();
  
  res.json({
    status: redisHealthy ? 'ok' : 'degraded',
    service: 'api-gateway',
    redis: redisHealthy ? 'connected' : 'disconnected',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
    console.log(`WebSocket server initialized`);
    console.log(`ML analysis worker initialized`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop alert monitoring
    if (alertMonitoringInterval) {
      clearInterval(alertMonitoringInterval);
      console.log('Alert monitoring stopped');
    }

    // Stop accepting new connections
    httpServer.close(() => {
      console.log('HTTP server closed');
    });

    try {
      // Flush pending WebSocket events
      await flushAllBatches();
      console.log('WebSocket event batches flushed');

      // Shutdown ML worker
      await shutdownMLAnalysisWorker();
      console.log('ML analysis worker shut down');

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
