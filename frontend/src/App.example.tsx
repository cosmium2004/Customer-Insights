/**
 * Example App Component with WebSocket Integration
 * 
 * This shows how to integrate the WebSocket service into your main App
 * Copy the relevant parts to your actual App.tsx
 */

import React, { useState } from 'react';
import { useWebSocketConnection, useWebSocketEvent } from './hooks/useWebSocket';
import RealtimeDashboard from './components/RealtimeDashboard';

function App() {
  // In a real app, these would come from your auth context/state
  const [token, setToken] = useState<string | null>('your-jwt-token');
  const [organizationId, setOrganizationId] = useState<string | null>('your-org-id');
  const [notifications, setNotifications] = useState<string[]>([]);

  // Connect to WebSocket
  const { isConnected } = useWebSocketConnection(token, organizationId);

  // Listen for all events and show notifications
  useWebSocketEvent('*', (event) => {
    const message = `New ${event.type} event received`;
    setNotifications((prev) => [message, ...prev].slice(0, 5)); // Keep last 5
    
    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n !== message));
    }, 5000);
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <header style={{ 
        borderBottom: '2px solid #1976d2', 
        paddingBottom: '10px',
        marginBottom: '20px'
      }}>
        <h1>AI Customer Insights Platform</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div>
            <strong>WebSocket:</strong>{' '}
            <span style={{ color: isConnected ? 'green' : 'red' }}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </span>
          </div>
          {token && (
            <div style={{ fontSize: '14px', color: '#666' }}>
              Org: {organizationId?.substring(0, 8)}...
            </div>
          )}
        </div>
      </header>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div style={{ 
          position: 'fixed', 
          top: '20px', 
          right: '20px', 
          zIndex: 1000,
          maxWidth: '300px'
        }}>
          {notifications.map((notification, index) => (
            <div
              key={index}
              style={{
                backgroundColor: '#1976d2',
                color: 'white',
                padding: '10px 15px',
                marginBottom: '10px',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                animation: 'slideIn 0.3s ease-out',
              }}
            >
              {notification}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main>
        {token && organizationId ? (
          <RealtimeDashboard token={token} organizationId={organizationId} />
        ) : (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px'
          }}>
            <h2>Please Log In</h2>
            <p>You need to authenticate to view real-time insights.</p>
            <button
              onClick={() => {
                // In a real app, this would trigger your login flow
                setToken('demo-token');
                setOrganizationId('demo-org-id');
              }}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Demo Login
            </button>
          </div>
        )}
      </main>

      {/* Add CSS animation */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
