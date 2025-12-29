# Event Subscription Utility

## Overview

The `createEventSubscription` utility optimizes IPC event handling by:

1. **Sharing a single IPC listener** across multiple subscribers
2. **Auto-cleanup** when the last subscriber unsubscribes
3. **Memory efficient** - no listener leaks

## Implementation

```typescript
// src/renderer/src/utils/event-subscription.ts

/**
 * Creates an optimized event subscription for IPC events.
 *
 * Key optimizations:
 * - Only one IPC listener per event type, regardless of subscriber count
 * - Automatic cleanup when all subscribers unsubscribe
 * - Type-safe with generics
 *
 * @param eventName - The IPC event name (e.g., 'app:users')
 * @returns Subscription object with subscribe method
 */
export const createEventSubscription = <T>(eventName: string) => {
  // Cleanup functions from ipcRenderer.on
  const root: (() => void)[] = [];

  // Active subscriber callbacks
  const subscriptions = new Set<(event: T) => void>();

  return {
    /**
     * Subscribe to the event.
     *
     * @param callback - Function to call when event is received
     * @returns Unsubscribe function
     */
    subscribe(callback: (event: T) => void) {
      // Register IPC listener only on FIRST subscription
      if (subscriptions.size < 1) {
        root.push(
          window.electron.ipcRenderer.on(eventName, (_, value: T) => {
            // Broadcast to all subscribers
            for (const cb of subscriptions) {
              cb(value);
            }
          }),
        );
      }

      // Add to subscriber set
      subscriptions.add(callback);

      // Return unsubscribe function
      return () => {
        subscriptions.delete(callback);

        // Cleanup IPC listener when last subscriber leaves
        if (subscriptions.size < 1) {
          for (const off of root) {
            off();
          }
          root.length = 0;  // Clear cleanup functions
        }
      };
    },
  };
};
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│              EVENT SUBSCRIPTION OPTIMIZATION                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│   │   Component A   │    │   Component B   │    │   Component C   │ │
│   │  useAtom(users) │    │  useAtom(users) │    │  useAtom(users) │ │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│            │                      │                      │           │
│            ▼                      ▼                      ▼           │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │                      usersAtom (Hybrid)                        │ │
│   │                              │                                  │ │
│   │                              ▼                                  │ │
│   │                      streamUsersAtom                           │ │
│   │                              │                                  │ │
│   │                              │ onMount                          │ │
│   │                              ▼                                  │ │
│   │                 usersSource.subscribe(handler)                 │ │
│   └───────────────────────────────┬───────────────────────────────┘ │
│                                   │                                  │
│                                   │ ONE subscription                 │
│                                   ▼                                  │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │                createEventSubscription('app:users')            │ │
│   │                                                                 │ │
│   │   subscriptions = Set { handler }  ← Only 1 callback           │ │
│   │                                                                 │ │
│   │   if (subscriptions.size < 1) {                                │ │
│   │     ipcRenderer.on('app:users', ...)  ← Register ONCE          │ │
│   │   }                                                             │ │
│   │                                                                 │ │
│   └───────────────────────────────┬───────────────────────────────┘ │
│                                   │                                  │
│                                   │ ONE IPC listener                 │
│                                   ▼                                  │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │              ipcRenderer.on('app:users', handler)              │ │
│   │                              │                                  │ │
│   │                              │ IPC Event                        │ │
│   │                              ▼                                  │ │
│   │              handler broadcasts to all subscribers             │ │
│   │                              │                                  │ │
│   │              ┌───────────────┼───────────────┐                 │ │
│   │              │               │               │                 │ │
│   │              ▼               ▼               ▼                 │ │
│   │         callback_A      callback_B      callback_C             │ │
│   │              │               │               │                 │ │
│   └──────────────┼───────────────┼───────────────┼─────────────────┘ │
│                  │               │               │                   │
│                  ▼               ▼               ▼                   │
│            Component A     Component B     Component C              │
│            re-renders      re-renders      re-renders               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

TRADITIONAL APPROACH (Without Optimization):
═══════════════════════════════════════════════════════════════════════

Component A → ipcRenderer.on('app:users', handler_A)  │
Component B → ipcRenderer.on('app:users', handler_B)  │ 3 listeners!
Component C → ipcRenderer.on('app:users', handler_C)  │

OPTIMIZED APPROACH (With createEventSubscription):
═══════════════════════════════════════════════════════════════════════

Components A,B,C → usersSource.subscribe() → 1 listener!
```

## Lifecycle Diagram

```
SUBSCRIPTION LIFECYCLE
═══════════════════════════════════════════════════════════════════════

t=0   Component A mounts
      │
      ▼
      usersSource.subscribe(callback_A)
      │
      │ subscriptions.size === 0 (before add)
      │         │
      │         ▼
      │  ✓ Register IPC listener
      │  ipcRenderer.on('app:users', broadcastHandler)
      │         │
      │         ▼
      │  subscriptions.add(callback_A)
      │  subscriptions.size === 1
      │
      ▼

t=1   Component B mounts
      │
      ▼
      usersSource.subscribe(callback_B)
      │
      │ subscriptions.size === 1 (NOT < 1)
      │         │
      │         ▼
      │  ✗ Skip IPC registration (already registered)
      │         │
      │         ▼
      │  subscriptions.add(callback_B)
      │  subscriptions.size === 2
      │
      ▼

t=2   Component C mounts
      │
      ▼
      usersSource.subscribe(callback_C)
      │
      │ subscriptions.size === 2 (NOT < 1)
      │         │
      │         ▼
      │  ✗ Skip IPC registration
      │         │
      │         ▼
      │  subscriptions.add(callback_C)
      │  subscriptions.size === 3
      │
      ▼

t=3   IPC Event arrives: 'app:users'
      │
      ▼
      broadcastHandler invoked
      │
      ├── callback_A(data) → Component A updates
      ├── callback_B(data) → Component B updates
      └── callback_C(data) → Component C updates
      │
      ▼

t=4   Component A unmounts
      │
      ▼
      unsubscribe_A()
      │
      │ subscriptions.delete(callback_A)
      │ subscriptions.size === 2 (NOT < 1)
      │         │
      │         ▼
      │  ✗ Keep IPC listener active
      │
      ▼

t=5   Component B unmounts
      │
      ▼
      unsubscribe_B()
      │
      │ subscriptions.delete(callback_B)
      │ subscriptions.size === 1 (NOT < 1)
      │         │
      │         ▼
      │  ✗ Keep IPC listener active
      │
      ▼

t=6   Component C unmounts (LAST subscriber)
      │
      ▼
      unsubscribe_C()
      │
      │ subscriptions.delete(callback_C)
      │ subscriptions.size === 0 (< 1!)
      │         │
      │         ▼
      │  ✓ Remove IPC listener
      │  for (const off of root) { off(); }
      │
      ▼
      Memory cleaned up, no listener leaks ✓
```

## Usage Patterns

### 1. Basic Event Source Definition

```typescript
// src/renderer/src/adapters/ipc-events/index.ts

// Void events (signal only, no payload)
export const usersSource = createEventSubscription<void>('app:users');
export const activeEventSource = createEventSubscription<void>('app:activeEvent');

// Events with payload
export const notificationsSource = createEventSubscription<Notification[]>('app:notifications');
export const logSource = createEventSubscription<ApplicationLog>('app:log');

// Snapshot events (granular updates)
export const userSnapshotSource = createEventSubscription<{
  type: 'create' | 'update' | 'delete';
  value: User;
}>('app:modify:user');

export const banSnapshotSource = createEventSubscription<{
  type: 'create' | 'update' | 'delete';
  value: BannedUser;
}>('app:modify:ban');
```

### 2. In Jotai Atom onMount

```typescript
const streamUsersAtom = atom<{ value: User[] }>();

streamUsersAtom.onMount = (set) => {
  const handleUpdate = debounce(async () => {
    const res = await client.users.$get();
    if (res.ok) {
      set({ value: await res.json() });
    }
  }, 300);

  handleUpdate();  // Initial fetch

  // Subscribe returns unsubscribe function
  // Jotai will call it automatically on unmount
  return usersSource.subscribe(handleUpdate);
};
```

### 3. Direct Subscription in Component (Rare)

```typescript
// Only use when you need to handle events outside of atoms
const Component = () => {
  useEffect(() => {
    const unsubscribe = logSource.subscribe((log) => {
      console.log('New log:', log);
    });

    return unsubscribe;  // Cleanup on unmount
  }, []);
};
```

## Testing

```typescript
import { vi } from 'vitest';

// Mock ipcRenderer
const mockOn = vi.fn(() => vi.fn());  // Returns cleanup function
const mockIpcRenderer = {
  on: mockOn,
};

vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}));

describe('createEventSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register IPC listener only on first subscription', () => {
    const source = createEventSubscription<string>('test-event');

    const callback1 = vi.fn();
    const callback2 = vi.fn();

    source.subscribe(callback1);
    expect(mockOn).toHaveBeenCalledTimes(1);

    source.subscribe(callback2);
    expect(mockOn).toHaveBeenCalledTimes(1);  // Still 1
  });

  it('should broadcast to all subscribers', () => {
    const source = createEventSubscription<string>('test-event');

    const callback1 = vi.fn();
    const callback2 = vi.fn();

    source.subscribe(callback1);
    source.subscribe(callback2);

    // Simulate IPC event
    const handler = mockOn.mock.calls[0][1];
    handler({}, 'test-data');

    expect(callback1).toHaveBeenCalledWith('test-data');
    expect(callback2).toHaveBeenCalledWith('test-data');
  });

  it('should cleanup when last subscriber leaves', () => {
    const mockCleanup = vi.fn();
    mockOn.mockReturnValue(mockCleanup);

    const source = createEventSubscription<string>('test-event');

    const unsub1 = source.subscribe(vi.fn());
    const unsub2 = source.subscribe(vi.fn());

    unsub1();
    expect(mockCleanup).not.toHaveBeenCalled();

    unsub2();
    expect(mockCleanup).toHaveBeenCalled();
  });
});
```

## Performance Comparison

| Metric | Without Optimization | With Optimization |
|--------|---------------------|-------------------|
| IPC Listeners | N per event type | 1 per event type |
| Memory (3 components) | 3 × listener memory | 1 × listener memory |
| Event Processing | 3 × handler calls | 1 handler → 3 callbacks |
| Cleanup Complexity | Individual management | Automatic |

## Best Practices

### DO:
- Create one source per IPC event type
- Export sources from a central location
- Use descriptive event names (e.g., `app:modify:user`)
- Let Jotai handle unsubscription via onMount return

### DON'T:
- Create new subscription sources in components
- Forget to return unsubscribe from onMount
- Subscribe to the same event with multiple sources
