# WebSocket Integration Checklist

## ✅ Completed

- [x] Install dependencies (`pako`, `@types/pako`)
- [x] Create WebSocket service with decompression
- [x] Create React hooks for easy usage
- [x] Create example dashboard component
- [x] Write and pass all tests
- [x] Document usage and implementation
- [x] Verify compression/decompression works

## 📋 To Do (Integration Steps)

### 1. Environment Configuration
- [ ] Add `VITE_WS_URL` to `.env` file
  ```env
  VITE_WS_URL=http://localhost:3000
  ```
- [ ] Add production URL to `.env.production`
  ```env
  VITE_WS_URL=https://api.yourapp.com
  ```

### 2. Authentication Integration
- [ ] Get JWT token from your auth system
- [ ] Get organization ID from user profile
- [ ] Pass both to `useWebSocketConnection()`

### 3. App Integration
- [ ] Import WebSocket hooks in your main App component
- [ ] Call `useWebSocketConnection(token, organizationId)` at app root
- [ ] Verify connection status in browser console

### 4. Dashboard Integration
- [ ] Import `RealtimeDashboard` component
- [ ] Add to your dashboard page/route
- [ ] Test with real backend events

### 5. Event Handling
- [ ] Subscribe to `interaction.created` events
- [ ] Subscribe to `sentiment.analyzed` events
- [ ] Add custom event handlers as needed
- [ ] Update UI based on events

### 6. Testing
- [ ] Test with small payloads (< 1KB) - should be uncompressed
- [ ] Test with large payloads (> 1KB) - should be compressed
- [ ] Test reconnection after network interruption
- [ ] Test with multiple concurrent events (batching)

### 7. Error Handling
- [ ] Add error boundaries around WebSocket components
- [ ] Show user-friendly messages for connection errors
- [ ] Handle decompression errors gracefully
- [ ] Log errors for debugging

### 8. Performance Monitoring
- [ ] Monitor WebSocket connection status
- [ ] Track event processing time
- [ ] Monitor memory usage with large event volumes
- [ ] Check compression ratios in network tab

### 9. Production Preparation
- [ ] Use WSS (secure WebSocket) in production
- [ ] Configure CORS on backend for production domain
- [ ] Set up monitoring/alerting for WebSocket issues
- [ ] Test with production-like data volumes

### 10. Documentation
- [ ] Document WebSocket usage for your team
- [ ] Add troubleshooting guide
- [ ] Document event types and payloads
- [ ] Create runbook for common issues

## 🧪 Testing Checklist

### Unit Tests
- [x] Decompression logic
- [x] Uncompressed payload handling
- [x] Batched event handling
- [x] Large payload handling

### Integration Tests
- [ ] Connect to real backend
- [ ] Receive real events
- [ ] Handle reconnection
- [ ] Process compressed events

### Manual Tests
- [ ] Open app in browser
- [ ] Check WebSocket connection in DevTools Network tab
- [ ] Trigger backend events (create interactions)
- [ ] Verify events appear in real-time
- [ ] Check compression in Network tab (look for gzip)
- [ ] Test with slow network (throttling)
- [ ] Test reconnection (disable/enable network)

## 📊 Verification Steps

### 1. Check Connection
```javascript
// In browser console
websocketService.isConnected()
// Should return: true
```

### 2. Monitor Events
```javascript
// In browser console
websocketService.on('*', (event) => console.log('Event:', event));
// Should log all incoming events
```

### 3. Check Compression
- Open DevTools → Network tab → WS (WebSocket)
- Look for messages with `compressed: true`
- Verify large payloads are compressed

### 4. Test Decompression
- Create a large interaction (> 1KB metadata)
- Verify it's received and displayed correctly
- Check console for decompression logs

## 🚨 Common Issues

### Issue: Events not received
**Solution**: 
- Check `isConnected` status
- Verify JWT token is valid
- Check organizationId matches user's org
- Review backend logs

### Issue: Decompression errors
**Solution**:
- Ensure `pako` is installed
- Check browser console for errors
- Verify backend is sending valid gzip data
- Check base64 encoding/decoding

### Issue: Connection drops frequently
**Solution**:
- Check network stability
- Verify backend WebSocket server is running
- Review backend logs for errors
- Check CORS configuration

### Issue: High memory usage
**Solution**:
- Limit event history (keep last 50-100)
- Unsubscribe from unused events
- Clear old events periodically
- Use React.memo for event components

## 📚 Resources

- **Usage Guide**: `WEBSOCKET_USAGE.md`
- **Implementation Details**: `WEBSOCKET_IMPLEMENTATION.md`
- **Example App**: `src/App.example.tsx`
- **Example Dashboard**: `src/components/RealtimeDashboard.tsx`
- **Tests**: `src/services/__tests__/websocket.test.ts`

## 🎯 Success Criteria

- [ ] WebSocket connects successfully
- [ ] Events are received in real-time
- [ ] Compressed payloads are decompressed correctly
- [ ] UI updates based on events
- [ ] No console errors
- [ ] Reconnection works after network interruption
- [ ] Performance is acceptable (< 100ms event processing)
- [ ] Memory usage is stable

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Review `WEBSOCKET_USAGE.md` troubleshooting section
3. Check backend logs for WebSocket errors
4. Verify network connectivity
5. Test with example component first

## 🎉 Ready to Go!

Once all checklist items are complete, your real-time WebSocket integration with compression support is production-ready!
