/**
 * WebSocket Configuration
 * 
 * Configures Socket.IO for real-time event emission
 * Supports organization-based event filtering
 * Implements JWT authentication and WSS for production
 * 
 * Requirements: 6.1, 6.5, 9.11
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Server as HTTPSServer } from 'https';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

let io: SocketIOServer | null = null;

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  organizationId: string;
}

interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

/**
 * Initialize WebSocket server with authentication and security
 * 
 * @param httpServer - HTTP or HTTPS server instance
 * @returns Configured Socket.IO server
 */
export function initializeWebSocket(httpServer: HTTPServer | HTTPSServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
    },
    pingInterval: 30000, // 30 seconds heartbeat (Requirement 6.5)
    pingTimeout: 5000,
    transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
  });

  // Authentication middleware (Requirement 6.1)
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        logger.warn('WebSocket connection attempt without token', { socketId: socket.id });
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logger.error('JWT_SECRET not configured');
        return next(new Error('Server configuration error'));
      }

      const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
      
      // Attach user info to socket
      socket.user = decoded;
      
      logger.info('WebSocket client authenticated', {
        socketId: socket.id,
        userId: decoded.userId,
        organizationId: decoded.organizationId,
      });

      next();
    } catch (error) {
      logger.warn('WebSocket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    
    if (!user) {
      logger.error('Socket connected without user data', { socketId: socket.id });
      socket.disconnect();
      return;
    }

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId: user.userId,
      organizationId: user.organizationId,
    });

    // Automatically join organization room for filtered events (Requirement 6.4)
    socket.join(`org:${user.organizationId}`);
    logger.debug('Client joined organization room', {
      socketId: socket.id,
      organizationId: user.organizationId,
    });

    // Handle reconnection and event sync (Requirement 6.6, 6.7)
    socket.on('sync-events', async (data: { lastEventId?: string; clientId?: string }) => {
      try {
        const clientId = data.clientId || user.userId;
        
        // Import event buffer service
        const eventBufferService = await import('../services/eventBufferService');
        
        // Check if buffer overflowed (Requirement 6.8)
        const overflowed = await eventBufferService.hasBufferOverflowed(clientId);
        
        if (overflowed) {
          logger.warn('Event buffer overflowed, client should fetch via REST API', {
            socketId: socket.id,
            userId: user.userId,
            clientId,
          });
          
          socket.emit('buffer-overflow', {
            message: 'Event buffer overflowed. Please fetch latest state via REST API.',
            lastEventId: data.lastEventId,
          });
          
          // Clear the overflowed buffer
          await eventBufferService.clearBuffer(clientId);
          return;
        }
        
        // Get buffered events
        const bufferedEvents = await eventBufferService.getBufferedEvents(clientId);
        
        if (bufferedEvents.length > 0) {
          logger.info('Syncing missed events', {
            socketId: socket.id,
            userId: user.userId,
            eventCount: bufferedEvents.length,
          });
          
          // Send buffered events to client
          socket.emit('events-sync', {
            events: bufferedEvents,
            count: bufferedEvents.length,
          });
          
          // Clear buffer after successful sync
          await eventBufferService.clearBuffer(clientId);
        } else {
          socket.emit('events-sync', {
            events: [],
            count: 0,
          });
        }
      } catch (error) {
        logger.error('Failed to sync events', {
          socketId: socket.id,
          userId: user.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        socket.emit('sync-error', {
          message: 'Failed to sync events',
        });
      }
    });

    // Handle manual room join (for additional filtering)
    socket.on('join-room', (roomId: string) => {
      // Validate room access based on organization
      if (roomId.startsWith(`org:${user.organizationId}`)) {
        socket.join(roomId);
        logger.debug('Client joined room', { socketId: socket.id, roomId });
        socket.emit('room-joined', { roomId });
      } else {
        logger.warn('Unauthorized room join attempt', {
          socketId: socket.id,
          userId: user.userId,
          roomId,
        });
        socket.emit('error', { message: 'Unauthorized room access' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId: user.userId,
        reason,
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        userId: user.userId,
        error: error.message,
      });
    });
  });

  logger.info('WebSocket server initialized', {
    secure: process.env.NODE_ENV === 'production',
    pingInterval: 30000,
  });

  return io;
}

/**
 * Get WebSocket server instance
 * 
 * @returns Socket.IO server instance
 * @throws Error if server not initialized
 */
export function getWebSocketServer(): SocketIOServer {
  if (!io) {
    throw new Error('WebSocket server not initialized. Call initializeWebSocket first.');
  }
  return io;
}

/**
 * Emit event to organization-specific room
 * Filters events by organization for data isolation (Requirement 6.4)
 * 
 * @param organizationId - Organization ID to emit to
 * @param event - Event name
 * @param data - Event payload
 */
export function emitToOrganization(organizationId: string, event: string, data: any): void {
  if (io) {
    const room = `org:${organizationId}`;
    io.to(room).emit(event, data);
    
    logger.debug('Event emitted to organization', {
      organizationId,
      event,
      room,
    });
  } else {
    logger.warn('Attempted to emit event before WebSocket initialization', {
      organizationId,
      event,
    });
  }
}

/**
 * Emit event to all connected clients
 * Use sparingly - prefer organization-specific events
 * 
 * @param event - Event name
 * @param data - Event payload
 */
export function emitToAll(event: string, data: any): void {
  if (io) {
    io.emit(event, data);
    
    logger.debug('Event emitted to all clients', { event });
  } else {
    logger.warn('Attempted to emit event before WebSocket initialization', { event });
  }
}

/**
 * Get count of connected clients
 * 
 * @returns Number of connected clients
 */
export function getConnectedClientsCount(): number {
  if (!io) {
    return 0;
  }
  return io.sockets.sockets.size;
}

/**
 * Get count of clients in a specific organization room
 * 
 * @param organizationId - Organization ID
 * @returns Number of clients in the organization room
 */
export async function getOrganizationClientsCount(organizationId: string): Promise<number> {
  if (!io) {
    return 0;
  }
  
  const room = `org:${organizationId}`;
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}
