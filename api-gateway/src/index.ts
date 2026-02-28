import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/authRoutes';
import dataRoutes from './routes/dataRoutes';
import patternRoutes from './routes/patternRoutes';
import insightsRoutes from './routes/insightsRoutes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { globalRateLimiter } from './middleware/rateLimiter';
import { initializeWebSocket } from './config/websocket';
import { initializeRedis, checkRedisHealth } from './config/redis';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Redis client
initializeRedis();

// Initialize WebSocket server
initializeWebSocket(httpServer);

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

// Request logging middleware
app.use(requestLogger);

// Morgan for HTTP request logging
app.use(morgan('combined'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/patterns', patternRoutes);
app.use('/api/insights', insightsRoutes);

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
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

export default app;
