# Write Atom Pattern

## Overview

Write Atoms enable mutation operations (create, update, delete) through Jotai atoms. Unlike read atoms that return data, write atoms execute side effects and optionally refresh related read atoms.

## Key Concepts

1. **Write-only atoms** - No read value, only write function
2. **Automatic refresh** - Trigger read atom refresh after mutation
3. **Type-safe mutations** - Full TypeScript support for payloads
4. **Error handling** - Consistent error patterns with status codes

## Complete Implementation

```typescript
// src/renderer/src/views/atoms/users.atom.ts
import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';
import { client } from '@adapters/client';
import { usersSource } from '@adapters/ipc-events';
import { debounce } from '@utils/debounce';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} from '@errors';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface User {
  id: string;
  displayName: string;
  bio: string | null;
  note: string | null;
  createdAt: Date;
}

// Create payload - ID excluded (server generates)
type CreateUserData = Omit<User, 'id' | 'createdAt'>;

// Update payload - Partial fields
type UpdateUserData = Partial<Pick<User, 'displayName' | 'bio' | 'note'>>;

// ═══════════════════════════════════════════════════════════════════════════
// Read Atom (for reference - see HYBRID-ATOM.md for full pattern)
// ═══════════════════════════════════════════════════════════════════════════

const singleFetchUsersAtom = atomWithRefresh(async (): Promise<User[]> => {
  const res = await client.users.$get();

  switch (res.status) {
    case 200:
      return res.json();
    case 401:
      throw new UnauthorizedError();
    default:
      throw new Error('Failed to fetch users');
  }
});

const streamUsersAtom = atom<{ value: User[] }>();

streamUsersAtom.onMount = (set) => {
  const handleUpdate = debounce(async () => {
    const res = await client.users.$get();

    switch (res.status) {
      case 200:
        set({ value: await res.json() });
        break;
      default:
        console.error('Failed to fetch users:', res.status);
    }
  }, 300);

  return usersSource.subscribe(handleUpdate);
};

export const usersAtom = atom((get) => {
  const stream = get(streamUsersAtom);
  if (stream !== undefined) {
    return stream.value;
  }
  return get(singleFetchUsersAtom);
});

// ═══════════════════════════════════════════════════════════════════════════
// Write Atom: Create
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for creating users.
 *
 * Pattern:
 * - First parameter is null (no read value)
 * - Second parameter is async write function
 * - Write function receives (get, set, payload)
 * - Returns created entity or throws error
 *
 * Usage: const [, createUser] = useAtom(createUserAtom);
 */
export const createUserAtom = atom(
  null,  // No read value
  async (_get, set, data: CreateUserData) => {
    const res = await client.users.$post({
      json: {
        displayName: data.displayName,
        bio: data.bio,
        note: data.note,
      },
    });

    switch (res.status) {
      case 201: {
        // Success - refresh read atom to reflect new data
        set(singleFetchUsersAtom);
        return res.json();
      }
      case 400: {
        const error = await res.json();
        throw new ValidationError(error.error);
      }
      case 409: {
        throw new ConflictError('User already exists');
      }
      default: {
        throw new Error('Failed to create user');
      }
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Write Atom: Update
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for updating users.
 *
 * Accepts ID and partial data for flexible updates.
 *
 * Usage: const [, updateUser] = useAtom(updateUserAtom);
 */
export const updateUserAtom = atom(
  null,
  async (_get, set, { id, data }: { id: string; data: UpdateUserData }) => {
    const res = await client.users[':id'].$put({
      param: { id },
      json: data,
    });

    switch (res.status) {
      case 200: {
        // Success - refresh read atom
        set(singleFetchUsersAtom);
        return res.json();
      }
      case 400: {
        const error = await res.json();
        throw new ValidationError(error.error);
      }
      case 404: {
        throw new NotFoundError('User not found');
      }
      default: {
        throw new Error('Failed to update user');
      }
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Write Atom: Delete
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for deleting users.
 *
 * Accepts only ID parameter.
 *
 * Usage: const [, deleteUser] = useAtom(deleteUserAtom);
 */
export const deleteUserAtom = atom(
  null,
  async (_get, set, id: string) => {
    const res = await client.users[':id'].$delete({
      param: { id },
    });

    switch (res.status) {
      case 200: {
        // Success - refresh read atom
        set(singleFetchUsersAtom);
        return res.json();
      }
      case 404: {
        throw new NotFoundError('User not found');
      }
      default: {
        throw new Error('Failed to delete user');
      }
    }
  }
);
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WRITE ATOM PATTERN                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Component calls write function                                     │
│         │                                                             │
│         ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ createUserAtom / updateUserAtom / deleteUserAtom            │   │
│   │                                                               │   │
│   │ atom(null, async (_get, set, payload) => {                   │   │
│   │   const res = await client.users.$post({ json: payload });   │   │
│   │   if (res.status === 201) {                                  │   │
│   │     set(usersAtom);  // Refresh read atom                    │   │
│   │     return res.json();                                        │   │
│   │   }                                                           │   │
│   │   throw new Error(...);                                       │   │
│   │ })                                                            │   │
│   └─────────────────────────────────────────────────────────────┘   │
│         │                                                             │
│         │ HTTP Request                                               │
│         ▼                                                             │
│   ┌─────────────────┐                                               │
│   │ Main Process    │                                               │
│   │ Hono Route      │                                               │
│   └────────┬────────┘                                               │
│            │                                                          │
│            │ CQRS Command                                            │
│            ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ Service Layer   │                                               │
│   │ (create/update/ │                                               │
│   │  delete)        │                                               │
│   └────────┬────────┘                                               │
│            │                                                          │
│            │ BehaviorSubject.next()                                  │
│            ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ IPC Push        │ ───► webContents.send('app:users')            │
│   └─────────────────┘                                               │
│            │                                                          │
│            │ Event received by stream atom                           │
│            ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ usersAtom       │ ───► Component re-renders with new data       │
│   └─────────────────┘                                               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence

```
TIME: t0 (Mutation Triggered)
═══════════════════════════════════════════════════════════

  User clicks "Create" button
       │
       ▼
  createUser({ displayName: 'Alice', bio: null, note: null })
       │
       ▼
  createUserAtom write function executes
       │
       ▼
  HTTP POST /users → Main Process
       │
       ▼
  Service.create() → Database insert
       │
       ▼
  Returns 201 + created user


TIME: t1 (Read Atom Refresh)
═══════════════════════════════════════════════════════════

  set(singleFetchUsersAtom)  // Triggered in write atom
       │
       ▼
  HTTP GET /users → Main Process
       │
       ▼
  New user list returned
       │
       ▼
  usersAtom updates → Component re-renders ✓


TIME: t2 (IPC Push - Parallel Path)
═══════════════════════════════════════════════════════════

  Service.create() also triggers BehaviorSubject.next()
       │
       ▼
  webContents.send('app:users')
       │
       ▼
  usersSource subscribers notified
       │
       ▼
  streamUsersAtom refetches (debounced)
       │
       ▼
  Additional re-render (if data changed) ✓
```

## Usage in Components

```tsx
import { useAtom, useAtomValue } from 'jotai';
import { usersAtom, createUserAtom, deleteUserAtom } from '../atoms/users.atom';

const UserManager = () => {
  const users = useAtomValue(usersAtom);
  const [, createUser] = useAtom(createUserAtom);
  const [, deleteUser] = useAtom(deleteUserAtom);

  const handleCreate = async () => {
    try {
      await createUser({ displayName: 'New User', bio: null, note: null });
      toast.success('User created!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id);
      toast.success('User deleted!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  return (
    <div>
      <button onClick={handleCreate}>Create User</button>
      <ul>
        {users.map((user) => (
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

## Testing Write Atoms

```typescript
import { createStore } from 'jotai';

describe('createUserAtom', () => {
  it('should create user and refresh read atom on 201', async () => {
    const store = createStore();
    mockClient.users.$post.mockResolvedValue({
      status: 201,
      json: () => Promise.resolve({ id: '1', displayName: 'Alice' }),
    });

    const result = await store.set(createUserAtom, {
      displayName: 'Alice',
      bio: null,
      note: null,
    });

    expect(result).toEqual({ id: '1', displayName: 'Alice' });
  });

  it('should throw ValidationError on 400', async () => {
    const store = createStore();
    mockClient.users.$post.mockResolvedValue({
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid name' }),
    });

    await expect(
      store.set(createUserAtom, { displayName: '', bio: null, note: null })
    ).rejects.toThrow(ValidationError);
  });
});
```

## Best Practices

### DO:
- Always refresh related read atoms after successful mutations
- Use specific error classes for different error types
- Handle all relevant HTTP status codes
- Provide clear error messages to users
- Use optimistic updates for better UX (advanced)

### DON'T:
- Forget to handle error cases
- Mutate state directly without using atoms
- Skip refreshing read atoms after mutations
- Use generic error messages
- Ignore 4xx client errors (they indicate user/data issues)

## Advanced: Optimistic Updates

For optimistic updates with Jotai atoms, use the `useOptimisticValue` hook.

React's built-in `useOptimistic` has issues with external state (Jotai atoms).
`useOptimisticValue` uses timestamp comparison to always show the latest value,
with automatic rollback on error.

See [examples/use-optimistic-value.ts](examples/use-optimistic-value.ts) for the full implementation.

### Quick Example

```tsx
const { value, isPending, updateOptimistically } = useOptimisticValue(
  user.displayName,
  async (newName) => {
    await updateUser({ id: user.id, data: { displayName: newName } });
  }
);

// value: shows optimistic update immediately
// isPending: true while server request is in flight
// On error: automatically reverts to real value
```

## Related Documentation

- [HYBRID-ATOM.md](HYBRID-ATOM.md) - Read atom patterns with stream + HTTP fallback
- [EVENT-SUBSCRIPTION.md](EVENT-SUBSCRIPTION.md) - IPC subscription optimization
- [examples/write-atom.ts](examples/write-atom.ts) - Write atom implementation
- [examples/use-optimistic-value.ts](examples/use-optimistic-value.ts) - Optimistic update hook
