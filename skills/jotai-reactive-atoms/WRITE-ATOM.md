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

// ═══════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════

class ValidationError extends Error {
  constructor(message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

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
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
});

const streamUsersAtom = atom<{ value: User[] }>();

streamUsersAtom.onMount = (set) => {
  const handleUpdate = debounce(async () => {
    const res = await client.users.$get();
    if (res.ok) {
      set({ value: await res.json() });
    }
  }, 300);

  handleUpdate();
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
import { Suspense } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  usersAtom,
  createUserAtom,
  updateUserAtom,
  deleteUserAtom,
} from '../atoms/users.atom';

// ═══════════════════════════════════════════════════════════════════════════
// Create User Form
// ═══════════════════════════════════════════════════════════════════════════

const CreateUserForm = () => {
  const [, createUser] = useAtom(createUserAtom);
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const newUser = await createUser({
        displayName,
        bio: null,
        note: null,
      });
      toast.success(`User ${newUser.displayName} created!`);
      setDisplayName('');
    } catch (error) {
      if (error instanceof ValidationError) {
        toast.error(`Validation failed: ${error.message}`);
      } else if (error instanceof ConflictError) {
        toast.error('User already exists');
      } else {
        toast.error('Failed to create user');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name"
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// User List with Update/Delete
// ═══════════════════════════════════════════════════════════════════════════

const UserList = () => {
  const users = useAtomValue(usersAtom);
  const [, updateUser] = useAtom(updateUserAtom);
  const [, deleteUser] = useAtom(deleteUserAtom);

  const handleUpdate = async (id: string, newName: string) => {
    try {
      await updateUser({ id, data: { displayName: newName } });
      toast.success('User updated!');
    } catch (error) {
      if (error instanceof NotFoundError) {
        toast.error('User not found');
      } else {
        toast.error('Failed to update user');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;

    try {
      await deleteUser(id);
      toast.success('User deleted!');
    } catch (error) {
      if (error instanceof NotFoundError) {
        toast.error('User not found');
      } else {
        toast.error('Failed to delete user');
      }
    }
  };

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>
          <span>{user.displayName}</span>
          <button onClick={() => handleUpdate(user.id, 'New Name')}>
            Edit
          </button>
          <button onClick={() => handleDelete(user.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Page Component with Suspense
// ═══════════════════════════════════════════════════════════════════════════

export const UsersPage = () => (
  <div>
    <h1>Users</h1>
    <CreateUserForm />
    <Suspense fallback={<Loading />}>
      <UserList />
    </Suspense>
  </div>
);
```

## Testing Write Atoms

```typescript
import { createStore } from 'jotai';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createUserAtom,
  updateUserAtom,
  deleteUserAtom,
  singleFetchUsersAtom,
} from './users.atom';

describe('Write Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
  });

  describe('createUserAtom', () => {
    it('should create user and refresh read atom on 201', async () => {
      mockClient.users.$post.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: '1', displayName: 'Alice' }),
      });

      const result = await store.set(createUserAtom, {
        displayName: 'Alice',
        bio: null,
        note: null,
      });

      expect(result).toEqual({ id: '1', displayName: 'Alice' });
      // Verify refresh was triggered (implementation depends on your mock setup)
    });

    it('should throw ValidationError on 400', async () => {
      mockClient.users.$post.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid name' }),
      });

      await expect(
        store.set(createUserAtom, { displayName: '', bio: null, note: null })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError on 409', async () => {
      mockClient.users.$post.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Already exists' }),
      });

      await expect(
        store.set(createUserAtom, { displayName: 'Alice', bio: null, note: null })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateUserAtom', () => {
    it('should update user and refresh read atom on 200', async () => {
      mockClient.users[':id'].$put.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1', displayName: 'Updated' }),
      });

      const result = await store.set(updateUserAtom, {
        id: '1',
        data: { displayName: 'Updated' },
      });

      expect(result).toEqual({ id: '1', displayName: 'Updated' });
    });

    it('should throw NotFoundError on 404', async () => {
      mockClient.users[':id'].$put.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      await expect(
        store.set(updateUserAtom, { id: 'invalid', data: { displayName: 'X' } })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteUserAtom', () => {
    it('should delete user and refresh read atom on 200', async () => {
      mockClient.users[':id'].$delete.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await store.set(deleteUserAtom, '1');

      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundError on 404', async () => {
      mockClient.users[':id'].$delete.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      await expect(store.set(deleteUserAtom, 'invalid')).rejects.toThrow(
        NotFoundError
      );
    });
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

```typescript
/**
 * Optimistic delete with rollback on error.
 */
export const optimisticDeleteUserAtom = atom(
  null,
  async (get, set, id: string) => {
    // Save current state for rollback
    const previousUsers = get(usersAtom);

    // Optimistic update - remove user immediately
    set(streamUsersAtom, {
      value: previousUsers.filter((u) => u.id !== id),
    });

    try {
      const res = await client.users[':id'].$delete({ param: { id } });

      switch (res.status) {
        case 200:
          return res.json();
        case 404:
          throw new NotFoundError('User not found');
        default:
          throw new Error('Failed to delete user');
      }
    } catch (error) {
      // Rollback on error
      set(streamUsersAtom, { value: previousUsers });
      throw error;
    }
  }
);
```

## Related Documentation

- [HYBRID-ATOM.md](HYBRID-ATOM.md) - Read atom patterns with stream + HTTP fallback
- [EVENT-SUBSCRIPTION.md](EVENT-SUBSCRIPTION.md) - IPC subscription optimization
- [examples/write-atom.ts](examples/write-atom.ts) - Complete implementation
