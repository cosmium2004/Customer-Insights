/**
 * React Hook for WebSocket Events
 * 
 * Provides easy-to-use WebSocket functionality with automatic cleanup
 */

import { useEffect, useCallback, useRef } from 'react';
import websocketService from '../services/websocket';

interface WebSocketEvent {
  type: string;
  timestamp: string;
  organizationId: string;
  [key: string]: any;
}

type EventHandler = (event: WebSocketEvent) => void;

/**
 * Hook to connect to WebSocket server
 * 
 * @param token - JWT authentication token
 * @param organizationId - Organization ID
 */
export function useWebSocketConnection(token: string | null, organizationId: string | null) {
  useEffect(() => {
    if (token && organizationId) {
      websocketService.connect(token, organizationId);

      return () => {
        websocketService.disconnect();
      };
    }
  }, [token, organizationId]);

  return {
    isConnected: websocketService.isConnected(),
    disconnect: () => websocketService.disconnect(),
  };
}

/**
 * Hook to subscribe to specific WebSocket event type
 * 
 * @param eventType - Event type to listen for (e.g., 'interaction.created', '*' for all)
 * @param handler - Callback function to handle the event
 * @param deps - Dependency array for the handler (like useCallback)
 */
export function useWebSocketEvent(
  eventType: string,
  handler: EventHandler,
  deps: React.DependencyList = []
) {
  // Use ref to store the latest handler without re-subscribing
  const handlerRef = useRef<EventHandler>(handler);

  // Update ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // Subscribe to event
  useEffect(() => {
    const wrappedHandler = (event: WebSocketEvent) => {
      handlerRef.current(event);
    };

    const unsubscribe = websocketService.on(eventType, wrappedHandler);

    return () => {
      unsubscribe();
    };
  }, [eventType, ...deps]);
}

/**
 * Hook to subscribe to multiple WebSocket event types
 * 
 * @param eventTypes - Array of event types to listen for
 * @param handler - Callback function to handle the events
 * @param deps - Dependency array for the handler
 */
export function useWebSocketEvents(
  eventTypes: string[],
  handler: EventHandler,
  deps: React.DependencyList = []
) {
  const handlerRef = useRef<EventHandler>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const wrappedHandler = (event: WebSocketEvent) => {
      handlerRef.current(event);
    };

    const unsubscribers = eventTypes.map((eventType) =>
      websocketService.on(eventType, wrappedHandler)
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [eventTypes.join(','), ...deps]);
}

/**
 * Hook to get WebSocket connection status
 */
export function useWebSocketStatus() {
  const [isConnected, setIsConnected] = React.useState(websocketService.isConnected());

  useEffect(() => {
    const checkConnection = setInterval(() => {
      setIsConnected(websocketService.isConnected());
    }, 1000);

    return () => {
      clearInterval(checkConnection);
    };
  }, []);

  return { isConnected };
}
