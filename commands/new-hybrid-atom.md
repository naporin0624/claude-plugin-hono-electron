# Create New Hybrid Atom

Create a new Jotai hybrid atom with IPC stream subscription and HTTP fallback.

## Parameters

- **name**: The atom name (e.g., "users", "notifications", "activeEvent")
- **entity**: The entity type (e.g., "User", "Notification", "Event")
- **ipcEvent**: The IPC event name (e.g., "app:users", "app:notifications")

## Instructions

1. Define event source in `src/renderer/src/adapters/ipc-events/index.ts`
2. Create atom file at `src/renderer/src/views/atoms/{name}.atom.ts`
3. Follow hybrid pattern: Stream + HTTP fallback

## Event Source Setup

```typescript
// src/renderer/src/adapters/ipc-events/index.ts
import { createEventSubscription } from '@utils/event-subscription';

// Add new event source
export const {name}Source = createEventSubscription<void>('{ipcEvent}');

// For snapshot events (granular updates)
export const {name}Snapshot = createEventSubscription<{
  type: 'create' | 'update' | 'delete';
  value: {Entity};
}>('{ipcEvent}:modify');
```

## Atom Template

```typescript
// src/renderer/src/views/atoms/{name}.atom.ts
import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';
import { client } from '@adapters/client';
import { {name}Source } from '@adapters/ipc-events';
import { debounce } from '@utils/debounce';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface {Entity} {
  id: string;
  // Add entity fields
  name: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class UnknownError extends Error {
  constructor(message = 'Unknown error') {
    super(message);
    this.name = 'UnknownError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shared fetch logic for consistency between atoms.
 */
const fetch{Entities} = async (): Promise<{Entity}[]> => {
  const res = await client.{endpoint}.$get();

  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 500) throw new UnknownError();

  const data = await res.json();

  // Transform API response to domain model
  return data.map((x) => ({
    id: x.id,
    name: x.name,
    createdAt: new Date(x.createdAt),
    // Map other fields
  }));
};

// ═══════════════════════════════════════════════════════════════════════════
// Step 1: Single Fetch Atom (HTTP Fallback)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP-only fetch atom.
 * Used as fallback when stream atom isn't mounted yet.
 */
const singleFetch{Entities}Atom = atomWithRefresh(
  async (): Promise<{Entity}[]> => fetch{Entities}()
);

// ═══════════════════════════════════════════════════════════════════════════
// Step 2: Stream Atom (IPC Subscription)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stream atom with IPC subscription.
 *
 * - onMount: Sets up IPC subscription
 * - Debounces updates to prevent thrashing
 * - Returns cleanup function for subscription
 */
const stream{Entities}Atom = atom<{ value: {Entity}[] }>();

stream{Entities}Atom.onMount = (set) => {
  const handle{Entities}Update = debounce(async () => {
    try {
      const items = await fetch{Entities}();
      set({ value: items });
    } catch (e) {
      console.error('Failed to fetch {entities}:', e);
      // Keep previous data on error
    }
  }, 300);

  // Immediate initial fetch
  handle{Entities}Update();

  // Subscribe to IPC events
  return {name}Source.subscribe(handle{Entities}Update);
};

// ═══════════════════════════════════════════════════════════════════════════
// Step 3: Hybrid Selector Atom (Public API)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hybrid atom that selects between stream and HTTP fallback.
 *
 * This is the atom that components should use.
 *
 * Read: Returns data from stream if available, otherwise HTTP fetch
 * Write: Manual refresh capability
 */
export const {name}Atom = atom(
  // Read function
  async (get) => {
    const stream = get(stream{Entities}Atom);

    // Stream not ready - use HTTP fallback
    if (stream === undefined) {
      return get(singleFetch{Entities}Atom);
    }

    // Stream ready - use stream data
    return stream.value;
  },

  // Write function (optional - for manual refresh)
  (_get, set) => {
    set(stream{Entities}Atom, undefined);  // Reset stream
    set(singleFetch{Entities}Atom);        // Trigger HTTP refetch
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Optional: Refresh Atom
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for manual refresh.
 * Useful when you need to force a data refresh.
 */
export const refresh{Entities}Atom = atom(null, (_get, set) => {
  set(singleFetch{Entities}Atom);
  set(stream{Entities}Atom, undefined);
});
```

## Main Process Setup

Ensure main process sends IPC events when service Observable emits:

```typescript
// src/main/index.ts
app.on('browser-window-created', (_, window) => {
  const subscription = new Subscription();

  // Subscribe to service and emit IPC events
  subscription.add(
    {name}Service.list().subscribe(() => {
      window.webContents.send('{ipcEvent}');
    })
  );

  // Optional: Granular updates
  subscription.add(
    {name}Service.notify().subscribe((snapshot) => {
      window.webContents.send('{ipcEvent}:modify', snapshot);
    })
  );

  window.on('close', () => subscription.unsubscribe());
});
```

## Component Usage

```tsx
import { Suspense } from 'react';
import { useAtomValue, useAtom } from 'jotai';
import { {name}Atom, refresh{Entities}Atom } from '../atoms/{name}.atom';

const {Entity}List = () => {
  const items = useAtomValue({name}Atom);  // Suspends until ready
  const [, refresh] = useAtom(refresh{Entities}Atom);

  return (
    <div>
      <button onClick={() => refresh()}>Refresh</button>
      <ul>
        {items.map(item => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
};

export const {Entity}Page = () => (
  <Suspense fallback={<Loading />}>
    <{Entity}List />
  </Suspense>
);
```

## TDD Workflow

1. Write test for atom behavior
2. Implement atom
3. Verify component integration

## Checklist

- [ ] Event source created in ipc-events
- [ ] Single fetch atom implemented
- [ ] Stream atom with onMount
- [ ] Hybrid selector atom exported
- [ ] Main process IPC subscription added
- [ ] Component integration tested
- [ ] Debouncing configured (300ms recommended)
