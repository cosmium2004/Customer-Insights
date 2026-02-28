/**
 * WebSocket Configuration
 * 
 * Configures Socket.IO for real-time event emission
 * Supports organization-based event filtering
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

let io: SocketIOServer | null = null;

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
    },
    pingInterval: 30000, // 30 seconds
    pingTimeout: 5000,
  });

  io.on('connection', (socket) => {
    console.log(`WebSocket client connected: ${socket.id}`);

    // Join organization room for filtered events
    socket.on('join-organization', (organizationId: string) => {
      socket.join(`org:${organizationId}`);
      console.log(`Client ${socket.id} joined organization ${organizationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): SocketIOServer {
  if (!io) {
    throw new Error('WebSocket server not initialized. Call initializeWebSocket first.');
  }
  return io;
}

/**
 * Emit event to organization-specific room
 */
export function emitToOrganization(organizationId: string, event: string, data: any): void {
  if (io) {
    io.to(`org:${organizationId}`).emit(event, data);
  }
}

/**
 * Emit event to all connected clients
 */
export function emitToAll(event: string, data: any): void {
  if (io) {
    io.emit(event, data);
  }
}
