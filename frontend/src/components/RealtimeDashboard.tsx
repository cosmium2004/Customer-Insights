/**
 * Real-time Dashboard Component
 * 
 * Example component demonstrating WebSocket usage with decompression support
 */

import React, { useState, useCallback } from 'react';
import { useWebSocketConnection, useWebSocketEvent } from '../hooks/useWebSocket';

interface InteractionCreatedEvent {
  type: 'interaction.created';
  interactionId: string;
  customerId: string;
  organizationId: string;
  timestamp: string;
  channel: string;
  eventType: string;
}

interface SentimentAnalyzedEvent {
  type: 'sentiment.analyzed';
  interactionId: string;
  customerId: string;
  organizationId: string;
  sentiment: {
    label: 'positive' | 'negative' | 'neutral';
    positive: number;
    negative: number;
    neutral: number;
  };
  confidence: number;
}

type DashboardEvent = InteractionCreatedEvent | SentimentAnalyzedEvent;

interface RealtimeDashboardProps {
  token: string | null;
  organizationId: string | null;
}

export function RealtimeDashboard({ token, organizationId }: RealtimeDashboardProps) {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [interactionCount, setInteractionCount] = useState(0);
  const [sentimentCount, setSentimentCount] = useState(0);

  // Connect to WebSocket
  const { isConnected } = useWebSocketConnection(token, organizationId);

  // Handle interaction.created events
  const handleInteractionCreated = useCallback((event: any) => {
    console.log('New interaction created:', event);
    setEvents((prev) => [event as InteractionCreatedEvent, ...prev].slice(0, 50)); // Keep last 50
    setInteractionCount((prev) => prev + 1);
  }, []);

  // Handle sentiment.analyzed events
  const handleSentimentAnalyzed = useCallback((event: any) => {
    console.log('Sentiment analyzed:', event);
    setEvents((prev) => [event as SentimentAnalyzedEvent, ...prev].slice(0, 50));
    setSentimentCount((prev) => prev + 1);
  }, []);

  // Subscribe to events
  useWebSocketEvent('interaction.created', handleInteractionCreated);
  useWebSocketEvent('sentiment.analyzed', handleSentimentAnalyzed);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Real-time Dashboard</h2>

      {/* Connection Status */}
      <div style={{ marginBottom: '20px' }}>
        <strong>WebSocket Status: </strong>
        <span style={{ color: isConnected ? 'green' : 'red' }}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>

      {/* Event Counters */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
        <div>
          <strong>Interactions:</strong> {interactionCount}
        </div>
        <div>
          <strong>Sentiment Analyses:</strong> {sentimentCount}
        </div>
      </div>

      {/* Event Feed */}
      <div>
        <h3>Recent Events</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
          {events.length === 0 ? (
            <p style={{ color: '#999' }}>No events yet. Waiting for real-time updates...</p>
          ) : (
            events.map((event, index) => (
              <EventCard key={`${event.type}-${index}`} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: DashboardEvent }) {
  const timestamp = new Date(event.timestamp).toLocaleTimeString();

  if (event.type === 'interaction.created') {
    return (
      <div style={{ 
        padding: '10px', 
        marginBottom: '10px', 
        border: '1px solid #e0e0e0', 
        borderRadius: '4px',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <strong style={{ color: '#1976d2' }}>New Interaction</strong>
          <span style={{ fontSize: '12px', color: '#666' }}>{timestamp}</span>
        </div>
        <div style={{ fontSize: '14px' }}>
          <div>Channel: <strong>{event.channel}</strong></div>
          <div>Event: {event.eventType}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Customer: {event.customerId.substring(0, 8)}...
          </div>
        </div>
      </div>
    );
  }

  if (event.type === 'sentiment.analyzed') {
    const sentimentColor = 
      event.sentiment.label === 'positive' ? '#4caf50' :
      event.sentiment.label === 'negative' ? '#f44336' :
      '#ff9800';

    return (
      <div style={{ 
        padding: '10px', 
        marginBottom: '10px', 
        border: '1px solid #e0e0e0', 
        borderRadius: '4px',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <strong style={{ color: '#9c27b0' }}>Sentiment Analyzed</strong>
          <span style={{ fontSize: '12px', color: '#666' }}>{timestamp}</span>
        </div>
        <div style={{ fontSize: '14px' }}>
          <div>
            Sentiment: <strong style={{ color: sentimentColor }}>{event.sentiment.label.toUpperCase()}</strong>
          </div>
          <div>Confidence: {(event.confidence * 100).toFixed(1)}%</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Scores: P:{(event.sentiment.positive * 100).toFixed(0)}% 
            N:{(event.sentiment.negative * 100).toFixed(0)}% 
            Neu:{(event.sentiment.neutral * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default RealtimeDashboard;
