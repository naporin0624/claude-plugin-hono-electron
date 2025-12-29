# Hybrid Atom Pattern

## Overview

The Hybrid Atom pattern combines HTTP fetch (for immediate data) with IPC stream subscription (for real-time updates). This ensures:

1. **Fast initial load** - HTTP fetch provides data immediately
2. **Real-time updates** - IPC events keep data fresh
3. **Graceful degradation** - Works even if stream isn't ready

## Complete Implementation

```typescript
// src/renderer/src/views/atoms/notifications.atom.ts
import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';
import { client } from '@adapters/client';
import { notificationsSource } from '@adapters/ipc-events';
import { debounce } from '@utils/debounce';

// ═══════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnknownError extends Error {
  constructor(message = 'Unknown error') {
    super(message);
    this.name = 'UnknownError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface Notification {
  id: string;
  type: 'friend_request' | 'invite' | 'message';
  senderUserId: string;
  seen: boolean;
  createdAt: Date;
  status: 'pending' | 'accepted' | 'rejected';
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 1: Single Fetch Atom (HTTP Fallback)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP-only fetch atom.
 * Used as fallback when stream atom isn't mounted yet.
 * atomWithRefresh allows manual refresh via set(atom).
 */
const singleFetchNotificationsAtom = atomWithRefresh(
  async (): Promise<Notification[]> => {
    const res = await client.notifications.$get();

    // Handle HTTP errors
    if (res.status === 401) throw new UnauthorizedError();
    if (res.status === 404) throw new NotFoundError();
    if (res.status === 500) throw new UnknownError();

    const data = await res.json();

    // Transform API response to domain model
    return data.map((x) => ({
      id: x.id,
      type: x.type,
      senderUserId: x.senderUserId,
      seen: x.seen,
      createdAt: new Date(x.createdAt),  // Parse date string
      status: x.status,
    }));
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Step 2: Stream Atom (IPC Subscription)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stream atom that subscribes to IPC events.
 *
 * Key characteristics:
 * - No initial value (starts as undefined)
 * - onMount sets up IPC subscription
 * - Debounces rapid updates to prevent thrashing
 * - Returns cleanup function for subscription
 */
const streamNotificationsAtom = atom<{ notifications: Notification[] }>();

streamNotificationsAtom.onMount = (set) => {
  /**
   * Handler for IPC updates.
   * Debounced to prevent excessive fetches when multiple
   * IPC events arrive in quick succession.
   */
  const handleNotificationsUpdate = debounce(async () => {
    try {
      const res = await client.notifications.$get();

      if (!res.ok) {
        console.error('Failed to fetch notifications:', res.status);
        return;
      }

      const data = await res.json();
      const notifications = data.map((x) => ({
        id: x.id,
        type: x.type,
        senderUserId: x.senderUserId,
        seen: x.seen,
        createdAt: new Date(x.createdAt),
        status: x.status,
      }));

      set({ notifications });
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  }, 300);  // 300ms debounce

  // Immediate initial fetch
  handleNotificationsUpdate();

  // Subscribe to IPC events for ongoing updates
  // Returns unsubscribe function for cleanup
  return notificationsSource.subscribe(handleNotificationsUpdate);
};

// ═══════════════════════════════════════════════════════════════════════════
// Step 3: Hybrid Selector Atom (Public API)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hybrid atom that selects between stream and HTTP fallback.
 *
 * Logic:
 * 1. Check if stream atom has data
 * 2. If undefined (not mounted), use HTTP fallback
 * 3. If defined, use stream data
 *
 * This is the atom that components should use.
 */
export const notificationsAtom = atom(async (get) => {
  const stream = get(streamNotificationsAtom);

  // Stream not ready - use HTTP fallback
  if (stream === undefined) {
    return get(singleFetchNotificationsAtom);
  }

  // Stream ready - use stream data
  return stream.notifications;
});

// ═══════════════════════════════════════════════════════════════════════════
// Optional: Refresh Atom (Manual Refresh)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom to manually refresh notifications.
 * Clears stream and refreshes HTTP fetch.
 */
export const refreshNotificationsAtom = atom(null, (_get, set) => {
  set(singleFetchNotificationsAtom);  // Triggers refetch
  set(streamNotificationsAtom, undefined);  // Reset stream state
});
```

## Debounce Implementation

```typescript
// src/renderer/src/utils/debounce.ts

/**
 * Creates a debounced version of a function.
 * The function will only be called after `delay` ms of inactivity.
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = undefined;
    }, delay);
  };
};
```

## Debounce Timing Visualization

```
IPC Events from Main Process:
═══════════════════════════════════════════════════════════════════

t=0ms      Event 1 ──► Schedule fetch (t=300ms)
           │
t=50ms     Event 2 ──► Cancel, reschedule (t=350ms)
           │
t=100ms    Event 3 ──► Cancel, reschedule (t=400ms)
           │
t=200ms    (silence)
           │
t=400ms    ◄── Debounced fetch executes! ✓
           │
           ▼
       HTTP Fetch → set({ notifications }) → Component re-renders


Result: 3 rapid events → 1 fetch → 1 render
        (67% reduction in network requests and renders)
```

## Error Handling Pattern

```typescript
// Stream atom with comprehensive error handling
const streamDataAtom = atom<{ value: Data[] }>();

streamDataAtom.onMount = (set) => {
  const handleUpdate = debounce(async () => {
    try {
      const res = await client.data.$get();

      switch (res.status) {
        case 200:
          set({ value: await res.json() });
          break;
        case 401:
          // Handle auth error - maybe clear auth state
          authAtom.clearToken();
          break;
        case 404:
          // Handle not found - set empty
          set({ value: [] });
          break;
        case 500:
          // Log but don't crash - keep previous data
          console.error('Server error, keeping stale data');
          break;
        default:
          console.warn('Unexpected status:', res.status);
      }
    } catch (networkError) {
      // Network failure - log but don't crash
      console.error('Network error:', networkError);
    }
  }, 300);

  handleUpdate();
  return dataSource.subscribe(handleUpdate);
};
```

## Testing Hybrid Atoms

```typescript
import { createStore } from 'jotai';
import { waitFor } from '@testing-library/react';

describe('notificationsAtom', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
  });

  it('should use HTTP fallback when stream not mounted', async () => {
    // Mock HTTP response
    mockClient.notifications.$get.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: '1', type: 'invite' }]),
    });

    // Get atom value (triggers HTTP fetch)
    const notifications = await store.get(notificationsAtom);

    expect(notifications).toHaveLength(1);
    expect(mockClient.notifications.$get).toHaveBeenCalledTimes(1);
  });

  it('should use stream data when mounted', async () => {
    // Mount stream atom
    store.set(streamNotificationsAtom, {
      notifications: [{ id: '2', type: 'friend_request' }],
    });

    // Get atom value (should use stream)
    const notifications = await store.get(notificationsAtom);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('2');
    // HTTP should NOT be called when stream is available
    expect(mockClient.notifications.$get).not.toHaveBeenCalled();
  });

  it('should debounce rapid IPC updates', async () => {
    vi.useFakeTimers();

    // Trigger multiple rapid updates
    notificationsSource.emit();
    notificationsSource.emit();
    notificationsSource.emit();

    // Before debounce completes
    expect(mockClient.notifications.$get).toHaveBeenCalledTimes(1); // Initial

    // After debounce
    vi.advanceTimersByTime(300);

    expect(mockClient.notifications.$get).toHaveBeenCalledTimes(2); // +1 debounced

    vi.useRealTimers();
  });
});
```

## Best Practices

### DO:
- Use 300ms debounce for typical data updates
- Always handle network errors gracefully
- Provide meaningful error messages
- Use atomWithRefresh for manual refresh capability

### DON'T:
- Skip debouncing for IPC updates
- Let errors crash the stream subscription
- Forget to return cleanup function from onMount
- Use stream atom directly in components (use hybrid atom)
