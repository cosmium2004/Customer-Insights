/**
 * WebSocket Service with Compression Support
 * 
 * Handles real-time events from the backend with automatic decompression
 * Supports both compressed (gzip) and uncompressed payloads
 */

import { io, Socket } from 'socket.io-client';
import pako from 'pako';

interface WebSocketEvent {
  type: string;
  timestamp: string;
  organizationId: string;
  [key: string]: any;
}

interface CompressedPayload {
  compressed: true;
  data: string; // Base64-encoded gzip data
}

interface BatchedPayload {
  batched: true;
  events: WebSocketEvent[];
}

type EventPayload = WebSocketEvent | CompressedPayload | BatchedPayload;

type EventHandler = (event: WebSocketEvent) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second

  /**
   * Connect to WebSocket server
   * 
   * @param token - JWT authentication token
   * @param organizationId - Organization ID for filtering events
   */
  connect(token: string, organizationId: string): void {
    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

    this.socket = io(wsUrl, {
      auth: {
        token,
      },
      query: {
        organizationId,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventHandlers();
  }

  /**
   * Set up socket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.handleReconnect();
    });

    // Disconnected
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected, manually reconnect
        this.socket?.connect();
      }
    });

    // Reconnection attempt
    this.socket.on('reconnect_attempt', (attempt) => {
      console.log(`WebSocket reconnection attempt ${attempt}`);
    });

    // Reconnected successfully
    this.socket.on('reconnect', (attempt) => {
      console.log(`WebSocket reconnected after ${attempt} attempts`);
      this.reconnectAttempts = 0;
    });

    // Receive events from server
    this.socket.on('event', (payload: EventPayload) => {
      this.handleIncomingEvent(payload);
    });
  }

  /**
   * Handle incoming event with decompression support
   * 
   * @param payload - Event payload (compressed, batched, or plain)
   */
  private handleIncomingEvent(payload: EventPayload): void {
    try {
      // Check if payload is compressed
      if (this.isCompressed(payload)) {
        const decompressed = this.decompressPayload(payload);
        this.processEvent(decompressed);
      }
      // Check if payload is batched
      else if (this.isBatched(payload)) {
        payload.events.forEach((event) => this.processEvent(event));
      }
      // Plain event
      else {
        this.processEvent(payload as WebSocketEvent);
      }
    } catch (error) {
      console.error('Error handling WebSocket event:', error);
    }
  }

  /**
   * Check if payload is compressed
   */
  private isCompressed(payload: EventPayload): payload is CompressedPayload {
    return 'compressed' in payload && payload.compressed === true;
  }

  /**
   * Check if payload is batched
   */
  private isBatched(payload: EventPayload): payload is BatchedPayload {
    return 'batched' in payload && payload.batched === true;
  }

  /**
   * Decompress gzip payload
   * 
   * @param payload - Compressed payload with base64-encoded gzip data
   * @returns Decompressed event or batched events
   */
  private decompressPayload(payload: CompressedPayload): WebSocketEvent | BatchedPayload {
    try {
      // Decode base64 to binary
      const binaryString = atob(payload.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decompress gzip
      const decompressed = pako.inflate(bytes, { to: 'string' });

      // Parse JSON
      return JSON.parse(decompressed);
    } catch (error) {
      console.error('Error decompressing payload:', error);
      throw error;
    }
  }

  /**
   * Process a single event and notify handlers
   * 
   * @param event - WebSocket event
   */
  private processEvent(event: WebSocketEvent): void {
    console.log('WebSocket event received:', event.type, event);

    // Notify handlers for this specific event type
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      });
    }

    // Notify handlers for all events (wildcard)
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in wildcard event handler:', error);
        }
      });
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
  }

  /**
   * Subscribe to specific event type
   * 
   * @param eventType - Event type to listen for (e.g., 'interaction.created', '*' for all)
   * @param handler - Callback function to handle the event
   * @returns Unsubscribe function
   */
  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }

    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Unsubscribe from specific event type
   * 
   * @param eventType - Event type
   * @param handler - Handler to remove
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventHandlers.clear();
    this.reconnectAttempts = 0;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get current socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

export default websocketService;
