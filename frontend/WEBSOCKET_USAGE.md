# WebSocket Service Usage Guide

## Overview

The WebSocket service provides real-time event streaming from the backend with automatic support for:
- **Gzip decompression** for large payloads (>1KB)
- **Event batching** for multiple rapid events
- **Automatic reconnection** with exponential backoff
- **Type-safe event handling**

## Installation

The required dependencies are already installed:
- `socket.io-client` - WebSocket client
- `pako` - Gzip compression/decompression library

## Quick Start

### 1. Connect to WebSocket Server

```typescript
import { useWebSocketConnection } from './hooks/useWebSocket';

function App() {
  const token = 'your-jwt-token';
  const organizationId = 'your-org-id';
  
  const { isConnected } = useWebSocketConnection(token, organizationId);
  
  return (
    <div>
      Status: {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

### 2. Subscribe to Events

```typescript
import { useWebSocketEvent } from './hooks/useWebSocket';

function Dashboard() {
  useWebSocketEvent('interaction.created', (event) => {
    console.log('New interaction:', event);
    // Handle the event
  });
  
  useWebSocketEvent('sentiment.analyzed', (event) => {
    console.log('Sentiment analyzed:', event);
    // Handle the event
  });
  
  return <div>Dashboard</div>;
}
```

### 3. Subscribe to All Events

```typescript
useWebSocketEvent('*', (event) => {
  console.log('Any event:', event.type, event);
});
```

## Event Types

### interaction.created

Emitted when a new customer interaction is ingested.

```typescript
{
  type: 'interaction.created',
  interactionId: string,
  customerId: string,
  organizationId: string,
  timestamp: string,
  channel: 'web' | 'mobile' | 'email' | 'chat' | 'phone',
  eventType: string
}
```

### sentiment.analyzed

Emitted when sentiment analysis completes for an interaction.

```typescript
{
  type: 'sentiment.analyzed',
  interactionId: string,
  customerId: string,
  organizationId: string,
  sentiment: {
    label: 'positive' | 'negative' | 'neutral',
    positive: number,  // 0-1
    negative: number,  // 0-1
    neutral: number    // 0-1
  },
  confidence: number  // 0-1
}
```

## Advanced Usage

### Multiple Event Types

```typescript
import { useWebSocketEvents } from './hooks/useWebSocket';

useWebSocketEvents(
  ['interaction.created', 'sentiment.analyzed'],
  (event) => {
    if (event.type === 'interaction.created') {
      // Handle interaction
    } else if (event.type === 'sentiment.analyzed') {
      // Handle sentiment
    }
  }
);
```

### Direct Service Usage (Non-React)

```typescript
import websocketService from './services/websocket';

// Connect
websocketService.connect(token, organizationId);

// Subscribe
const unsubscribe = websocketService.on('interaction.created', (event) => {
  console.log(event);
});

// Unsubscribe
unsubscribe();

// Disconnect
websocketService.disconnect();
```

## Compression Handling

The service automatically handles three payload formats:

### 1. Uncompressed (Small Payloads < 1KB)

```json
{
  "type": "interaction.created",
  "interactionId": "...",
  "customerId": "..."
}
```

### 2. Compressed (Large Payloads ≥ 1KB)

```json
{
  "compressed": true,
  "data": "H4sIAAAAAAAACq3QTW7bMBCG4b..."
}
```

The service automatically:
1. Detects the `compressed: true` flag
2. Base64 decodes the `data` field
3. Decompresses with gzip (pako)
4. Parses the JSON
5. Delivers the event to your handler

### 3. Batched Events

```json
{
  "batched": true,
  "events": [
    { "type": "interaction.created", ... },
    { "type": "sentiment.analyzed", ... }
  ]
}
```

The service automatically unbatches and delivers each event separately.

## Connection Management

### Automatic Reconnection

The service automatically reconnects with exponential backoff:
- Initial delay: 1 second
- Max delay: 10 seconds
- Max attempts: 10

### Manual Disconnect

```typescript
websocketService.disconnect();
```

### Check Connection Status

```typescript
const isConnected = websocketService.isConnected();
```

## Environment Configuration

Set the WebSocket URL in your `.env` file:

```env
VITE_WS_URL=http://localhost:3000
```

For production:

```env
VITE_WS_URL=https://api.yourapp.com
```

## Example Component

See `src/components/RealtimeDashboard.tsx` for a complete example showing:
- Connection management
- Event subscription
- Real-time UI updates
- Event display

## Troubleshooting

### Events Not Received

1. Check connection status: `websocketService.isConnected()`
2. Verify JWT token is valid
3. Check organizationId matches your user's organization
4. Open browser console for WebSocket logs

### Decompression Errors

If you see decompression errors:
1. Ensure `pako` is installed: `npm install pako`
2. Check browser console for detailed error messages
3. Verify the backend is sending valid gzip data

### Connection Drops

The service automatically reconnects. If reconnection fails:
1. Check network connectivity
2. Verify backend WebSocket server is running
3. Check CORS configuration on backend
4. Review backend logs for connection errors

## Performance Tips

1. **Limit event handlers**: Only subscribe to events you need
2. **Debounce UI updates**: Use React state batching or debounce for rapid events
3. **Cleanup subscriptions**: Always unsubscribe when components unmount (hooks do this automatically)
4. **Monitor memory**: Keep event history limited (e.g., last 50 events)

## Security

- Always use WSS (WebSocket Secure) in production
- JWT tokens are sent in the auth handshake
- Events are filtered by organization on the backend
- Never expose sensitive data in event payloads
