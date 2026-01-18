# Performance Profiling Guide

This document describes the performance profiling tools available in Tide Commander and how to use them to measure and optimize performance.

## Overview

The profiling system provides:
- **FPS Meter**: Real-time FPS display with history graph
- **React Profiler**: Component render timing markers
- **Performance API**: Custom timing for critical operations
- **Memory Tracking**: Heap usage monitoring (Chrome only)

## Quick Start

In development mode, the FPS meter appears in the top-right corner. Click it to expand and see:
- Current/Min/Max/Avg FPS
- FPS history graph (last 60 seconds)
- Memory usage bar

## Console API

Open the browser console and access profiling tools via `window.__tidePerf`:

```javascript
// Get current metrics for all tracked operations
__tidePerf.perf.getMetrics()

// Print a formatted performance report
__tidePerf.report()

// Clear all timing data
__tidePerf.clear()

// Get memory usage (Chrome only)
__tidePerf.memory.getUsage()
```

## Tracked Operations

### Scene/Canvas Operations
- `scene:frame` - Total frame time (should be <16ms for 60fps)
- `scene:render` - Three.js render time

### WebSocket Messages
- `ws:agents_update` - Processing agent list updates
- `ws:agent_created` - Handling new agent creation
- `ws:agent_updated` - Handling agent state updates
- `ws:output` - Processing streaming output messages
- `ws:event` - Processing agent events

### Store Operations
- `store:setAgents` - Updating agent list in store
- `store:addOutput` - Adding streaming output to store

### React Components (via Profiler)
- `React:ClaudeOutputPanel:mount/update` - Terminal panel renders
- `React:CommanderView:mount/update` - Commander grid renders
- `React:UnitPanel:mount/update` - Unit panel renders
- `React:ToolHistory:mount/update` - Tool history renders

## Interpreting Results

### Frame Budget
At 60fps, each frame has ~16.67ms budget:
- **Green (>55fps)**: Healthy performance
- **Yellow (30-55fps)**: Acceptable but could improve
- **Red (<30fps)**: Needs optimization

### Key Metrics
- **avgMs**: Average time per operation
- **p95Ms**: 95th percentile (worst 5% of cases)
- **p99Ms**: 99th percentile (worst 1% of cases)

### Common Performance Issues

1. **Slow WebSocket message processing**
   - Large agent lists: `ws:agents_update` >10ms
   - High-frequency output: `ws:output` accumulating

2. **React re-render storms**
   - Check `React:*` metrics for >16ms renders
   - CommanderView with many agents can be slow

3. **Scene rendering bottleneck**
   - `scene:render` >10ms indicates GPU/scene complexity
   - Check for too many objects, complex shaders

## Adding Custom Timing

Use the `perf` utility in your code:

```typescript
import { perf } from '../utils/profiling';

// Simple timing
perf.start('myOperation');
// ... do work ...
perf.end('myOperation');

// Measure async operations
await perf.measure('fetchData', async () => {
  return await fetch('/api/data');
});

// Measure sync operations
const result = perf.measureSync('compute', () => {
  return expensiveComputation();
});
```

## React Profiler Usage

Wrap components with React.Profiler:

```tsx
import { Profiler } from 'react';
import { profileRender } from '../utils/profiling';

<Profiler id="MyComponent" onRender={profileRender}>
  <MyComponent />
</Profiler>
```

## Baseline Metrics (Reference)

These are typical baseline metrics on a modern machine (M1 Mac, Chrome):

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| FPS | >55 | 30-55 | <30 |
| scene:frame | <12ms | 12-16ms | >16ms |
| scene:render | <8ms | 8-12ms | >12ms |
| ws:output | <2ms | 2-5ms | >5ms |
| React:ClaudeOutputPanel | <10ms | 10-20ms | >20ms |
| Memory (heap) | <200MB | 200-500MB | >500MB |

## Toggle FPS Meter

The FPS meter is shown by default in development. To toggle:

```javascript
// In console
localStorage.setItem('tide-show-fps', 'false'); // Hide
localStorage.setItem('tide-show-fps', 'true');  // Show
location.reload(); // Refresh to apply
```

## Production Considerations

- All profiling code is stripped in production builds (`import.meta.env.DEV`)
- FPS meter only renders in development
- Console timing only logs in development
- No performance overhead in production
