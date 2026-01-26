---
name: jotai-reactive-atoms
description: Implement reactive state management with Jotai atoms in Electron renderer. Use when creating atoms, implementing real-time updates via IPC, or setting up hybrid stream + HTTP fallback patterns. Covers event subscription optimization, debouncing, and Suspense integration.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Jotai Reactive Atoms for Electron

## Overview

This skill documents the Jotai atom patterns for Electron applications with IPC-based real-time updates.

## Key Patterns

| Pattern | Use Case | Description |
|---------|----------|-------------|
| Hybrid Atom | Real-time data | Stream + HTTP fallback |
| Stream Atom | IPC subscriptions | onMount with subscription |
| Single Fetch Atom | Initial data | HTTP-only async atom |
| Event Subscription | IPC optimization | Shared IPC listeners |
| Write Atom | Mutations (CRUD) | Create, Update, Delete operations |

## Quick Start

### 1. Define Event Subscription Source

```typescript
// src/renderer/src/adapters/ipc-events/index.ts
import { createEventSubscription } from '@utils/event-subscription';

// One source per IPC event type
export const usersSource = createEventSubscription<void>('app:users');
export const activeEventSource = createEventSubscription<void>('app:activeEvent');
export const notificationsSource = createEventSubscription<Notification[]>('app:notifications');
```

### 2. Create Hybrid Atom

```typescript
// src/renderer/src/views/atoms/users.atom.ts
import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';
import { client } from '@adapters/client';
import { usersSource } from '@adapters/ipc-events';
import { debounce } from '@utils/debounce';

// Step 1: HTTP-only fetch atom (fallback)
const singleFetchUsersAtom = atomWithRefresh(async () => {
  const res = await client.users.$get();
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 500) throw new UnknownError();
  return res.json();
});

// Step 2: Stream atom (IPC updates)
const streamUsersAtom = atom<{ value: User[] }>();

streamUsersAtom.onMount = (set) => {
  const handleUpdate = debounce(async () => {
    const res = await client.users.$get();
    if (res.ok) {
      set({ value: await res.json() });
    }
  }, 300);

  return usersSource.subscribe(handleUpdate);  // Subscribe to IPC
};

// Step 3: Hybrid selector (exported)
// IMPORTANT: Do NOT use async - it causes Suspense to trigger on every read
export const usersAtom = atom((get) => {
  const stream = get(streamUsersAtom);
  // Check stream first (synchronous path - no Suspense)
  if (stream !== undefined) {
    return stream.value;  // Use stream data
  }
  // Fallback to HTTP (triggers Suspense only on initial load)
  return get(singleFetchUsersAtom);
});
```

### 3. Use in Component with Suspense

```tsx
// src/renderer/src/views/users/index.tsx
import { Suspense } from 'react';
import { useAtomValue } from 'jotai';
import { usersAtom } from '../atoms/users.atom';

const UserList = () => {
  const users = useAtomValue(usersAtom);  // Suspends until ready

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.displayName}</li>
      ))}
    </ul>
  );
};

export const UsersPage = () => (
  <Suspense fallback={<Loading />}>
    <UserList />
  </Suspense>
);
```

### 4. Create Write Atoms (Mutations)

```typescript
// src/renderer/src/views/atoms/users.atom.ts
import { atom } from 'jotai';

// Create user - ID excluded (server generates)
export const createUserAtom = atom(
  null,  // No read value
  async (_get, set, data: { displayName: string; bio: string | null }) => {
    const res = await client.users.$post({ json: data });

    switch (res.status) {
      case 201: {
        set(singleFetchUsersAtom);  // Refresh read atom
        return res.json();
      }
      default: {
        const error = await res.json();
        throw new Error(error.error);
      }
    }
  }
);

// Update user
export const updateUserAtom = atom(
  null,
  async (_get, set, { id, data }: { id: string; data: { displayName?: string } }) => {
    const res = await client.users[':id'].$put({
      param: { id },
      json: data,
    });

    switch (res.status) {
      case 200: {
        set(singleFetchUsersAtom);
        return res.json();
      }
      case 404:
        throw new Error('User not found');
      default:
        throw new Error('Failed to update user');
    }
  }
);

// Delete user
export const deleteUserAtom = atom(
  null,
  async (_get, set, id: string) => {
    const res = await client.users[':id'].$delete({ param: { id } });

    switch (res.status) {
      case 200: {
        set(singleFetchUsersAtom);
        return res.json();
      }
      case 404:
        throw new Error('User not found');
      default:
        throw new Error('Failed to delete user');
    }
  }
);
```

### 5. Use Write Atoms in Components

```tsx
import { useAtom, useAtomValue } from 'jotai';
import { usersAtom, createUserAtom, deleteUserAtom } from '../atoms/users.atom';

const UserManager = () => {
  const users = useAtomValue(usersAtom);
  const [, createUser] = useAtom(createUserAtom);
  const [, deleteUser] = useAtom(deleteUserAtom);

  const handleCreate = async () => {
    try {
      await createUser({ displayName: 'New User', bio: null });
      toast.success('User created!');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id);
      toast.success('User deleted!');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <button onClick={handleCreate}>Create User</button>
      <ul>
        {users.map(user => (
          <li key={user.id}>
            {user.displayName}
            <button onClick={() => handleDelete(user.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    JOTAI HYBRID ATOM PATTERN                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   useAtom(usersAtom)                                                 │
│         │                                                             │
│         ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ usersAtom (Hybrid Selector)                                  │   │
│   │                                                               │   │
│   │ atom(async (get) => {                                        │   │
│   │   const stream = get(streamUsersAtom);                       │   │
│   │   if (stream === undefined) return get(singleFetchAtom);     │   │
│   │   return stream.value;                                        │   │
│   │ })                                                            │   │
│   └─────────────────────────────────────────────────────────────┘   │
│         │                                 │                          │
│         │ (t=0: not mounted)              │ (t=1+: mounted)          │
│         ▼                                 ▼                          │
│   ┌─────────────────┐           ┌─────────────────┐                 │
│   │ singleFetchAtom │           │ streamUsersAtom │                 │
│   │ (HTTP Fallback) │           │ (IPC Stream)    │                 │
│   └────────┬────────┘           └────────┬────────┘                 │
│            │                              │                          │
│            ▼                              │ onMount                   │
│   client.users.$get()                    │                          │
│            │                              ▼                          │
│            │                    usersSource.subscribe()             │
│            │                              │                          │
│            │                              │ IPC: 'app:users'         │
│            │                              ▼                          │
│            │                    debounce(handleUpdate, 300)         │
│            │                              │                          │
│            └──────────────────────────────┘                          │
│                              │                                        │
│                              ▼                                        │
│                      RENDERER RESULT                                 │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Timing Diagram

```
TIME: t0 (Component Mount)
═══════════════════════════════════════════════════════════

  Component mounts
       │
       ▼
  useAtom(usersAtom) → Suspends
       │
       │ streamUsersAtom = undefined (not yet mounted)
       │          │
       │          ▼
       │   Fallback: singleFetchAtom
       │          │
       │          ▼
       │   HTTP fetch → Data arrives
       │          │
       │          ▼
  Component renders with HTTP data ✓


TIME: t1 (Stream Subscription)
═══════════════════════════════════════════════════════════

  streamUsersAtom.onMount executes
       │
       └── Subscribe to IPC events
              │
              ▼
  Waiting for IPC event from main process...


TIME: t2 (IPC Event Received)
═══════════════════════════════════════════════════════════

  Main Process: data changes → webContents.send('app:users')
       │
       ▼
  usersSource notifies subscribers
       │
       ▼
  Debounced handler fetches via HTTP
       │
       ▼
  streamUsersAtom.value = fetched data
       │
       ▼
  usersAtom re-evaluates
       │
       │ stream !== undefined
       │          │
       │          ▼
       │   Return stream.value
       │
       ▼
  Component re-renders with stream data ✓


TIME: t3+ (Subsequent Updates)
═══════════════════════════════════════════════════════════

  Main Process: Service Observable emits
       │
       ▼
  webContents.send('app:users')
       │
       ▼
  IPC Event received
       │
       ▼
  usersSource notifies subscribers
       │
       ▼
  Debounced handler executes (after 300ms)
       │
       ▼
  HTTP fetch → set({ value: newData })
       │
       ▼
  Component automatically re-renders ✓
```

## When to Use Each Pattern

### Hybrid Atom (Stream + HTTP Fallback)
Use for data that:
- Changes frequently
- Needs real-time updates
- Is shared across components

Examples: Users, Notifications, Active Event

### Stream-Only Atom
Use for data that:
- Is append-only (like logs)
- Doesn't need initial fetch

```typescript
export const logsAtom = atom<Log[]>([]);

logsAtom.onMount = (set) => {
  return logSource.subscribe((log) => {
    set((prev) => [log, ...prev].slice(0, 1000));
  });
};
```

### Single Fetch Atom
Use for data that:
- Rarely changes
- Doesn't need real-time updates

```typescript
export const worldAtom = atomFamily((id: string) =>
  atom(async () => {
    const res = await client.worlds[':id'].$get({ param: { id } });
    return res.json();
  })
);
```

## Additional Resources

- [HYBRID-ATOM.md](HYBRID-ATOM.md) - Detailed hybrid pattern implementation (read operations)
- [WRITE-ATOM.md](WRITE-ATOM.md) - Write atom patterns (create, update, delete)
- [EVENT-SUBSCRIPTION.md](EVENT-SUBSCRIPTION.md) - IPC subscription optimization
- [examples/hybrid-atom.ts](examples/hybrid-atom.ts) - Read atom implementation
- [examples/write-atom.ts](examples/write-atom.ts) - Write atom implementation
- [examples/use-optimistic-value.ts](examples/use-optimistic-value.ts) - Optimistic update hook
