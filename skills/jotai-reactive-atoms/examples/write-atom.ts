/**
 * Example: Complete Write Atom Implementation
 *
 * This demonstrates the write atom pattern with:
 * - Create, Update, Delete operations
 * - Type-safe payloads
 * - Error handling with specific error classes
 * - Automatic refresh of read atoms
 * - Optimistic updates (advanced)
 */

import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';

// ═══════════════════════════════════════════════════════════════════════════
// Mock Imports (Replace with actual imports in your project)
// ═══════════════════════════════════════════════════════════════════════════

// import { client } from '@adapters/client';
// import { usersSource } from '@adapters/ipc-events';
// import { debounce } from '@utils/debounce';

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

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
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

/**
 * Create payload - ID excluded (server generates)
 * Server will generate: id, createdAt
 */
type CreateUserData = Omit<User, 'id' | 'createdAt'>;

/**
 * Update payload - Partial fields only
 * Only updatable fields are included
 */
type UpdateUserData = Partial<Pick<User, 'displayName' | 'bio' | 'note'>>;

// ═══════════════════════════════════════════════════════════════════════════
// Read Atoms (Required for refresh after mutations)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP-only fetch atom (fallback).
 * Used for refresh after mutations.
 */
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

/**
 * Stream atom for real-time updates.
 * See hybrid-atom.ts for full implementation.
 */
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

/**
 * Hybrid read atom - public API for reading users.
 */
export const usersAtom = atom((get) => {
  const stream = get(streamUsersAtom);
  if (stream !== undefined) {
    return stream.value;
  }
  return get(singleFetchUsersAtom);
});

// ═══════════════════════════════════════════════════════════════════════════
// Write Atom: Create User
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for creating users.
 *
 * @param data - User data without ID (server generates ID)
 * @returns Created user with server-generated fields
 * @throws ValidationError on 400
 * @throws ConflictError on 409
 *
 * Usage:
 * ```tsx
 * const [, createUser] = useAtom(createUserAtom);
 *
 * const handleCreate = async () => {
 *   try {
 *     const user = await createUser({
 *       displayName: 'Alice',
 *       bio: 'Hello world',
 *       note: null,
 *     });
 *     console.log('Created:', user.id);
 *   } catch (e) {
 *     console.error('Failed:', e.message);
 *   }
 * };
 * ```
 */
export const createUserAtom = atom(
  null,  // No read value - write-only
  async (_get, set, data: CreateUserData): Promise<User> => {
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
// Write Atom: Update User
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for updating users.
 *
 * @param params.id - User ID to update
 * @param params.data - Partial user data to update
 * @returns Updated user
 * @throws ValidationError on 400
 * @throws NotFoundError on 404
 *
 * Usage:
 * ```tsx
 * const [, updateUser] = useAtom(updateUserAtom);
 *
 * const handleUpdate = async (userId: string) => {
 *   try {
 *     const user = await updateUser({
 *       id: userId,
 *       data: { displayName: 'New Name' },
 *     });
 *     console.log('Updated:', user.displayName);
 *   } catch (e) {
 *     if (e instanceof NotFoundError) {
 *       console.error('User not found');
 *     }
 *   }
 * };
 * ```
 */
export const updateUserAtom = atom(
  null,
  async (
    _get,
    set,
    { id, data }: { id: string; data: UpdateUserData }
  ): Promise<User> => {
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
// Write Atom: Delete User
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for deleting users.
 *
 * @param id - User ID to delete
 * @returns Deletion result
 * @throws NotFoundError on 404
 *
 * Usage:
 * ```tsx
 * const [, deleteUser] = useAtom(deleteUserAtom);
 *
 * const handleDelete = async (userId: string) => {
 *   if (!confirm('Delete user?')) return;
 *
 *   try {
 *     await deleteUser(userId);
 *     toast.success('User deleted');
 *   } catch (e) {
 *     if (e instanceof NotFoundError) {
 *       toast.error('User not found');
 *     }
 *   }
 * };
 * ```
 */
export const deleteUserAtom = atom(
  null,
  async (_get, set, id: string): Promise<{ success: boolean }> => {
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

// ═══════════════════════════════════════════════════════════════════════════
// Advanced: Optimistic Update Pattern
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optimistic delete with rollback on error.
 *
 * This pattern:
 * 1. Immediately updates UI (optimistic)
 * 2. Sends request to server
 * 3. Rolls back if request fails
 *
 * Benefits:
 * - Instant UI feedback
 * - Better perceived performance
 * - Graceful error handling
 *
 * Usage: Same as deleteUserAtom
 */
export const optimisticDeleteUserAtom = atom(
  null,
  async (get, set, id: string): Promise<{ success: boolean }> => {
    // Step 1: Save current state for potential rollback
    const previousUsers = get(usersAtom);

    // Step 2: Optimistic update - remove user immediately from UI
    set(streamUsersAtom, {
      value: previousUsers.filter((u) => u.id !== id),
    });

    try {
      // Step 3: Send actual delete request
      const res = await client.users[':id'].$delete({
        param: { id },
      });

      switch (res.status) {
        case 200: {
          // Server confirmed - optimistic update was correct
          return res.json();
        }
        case 404: {
          throw new NotFoundError('User not found');
        }
        default: {
          throw new Error('Failed to delete user');
        }
      }
    } catch (error) {
      // Step 4: Rollback on any error
      set(streamUsersAtom, { value: previousUsers });
      throw error;
    }
  }
);

/**
 * Optimistic update with rollback on error.
 */
export const optimisticUpdateUserAtom = atom(
  null,
  async (
    get,
    set,
    { id, data }: { id: string; data: UpdateUserData }
  ): Promise<User> => {
    // Save current state
    const previousUsers = get(usersAtom);
    const targetUser = previousUsers.find((u) => u.id === id);

    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    // Optimistic update
    set(streamUsersAtom, {
      value: previousUsers.map((u) =>
        u.id === id ? { ...u, ...data } : u
      ),
    });

    try {
      const res = await client.users[':id'].$put({
        param: { id },
        json: data,
      });

      switch (res.status) {
        case 200: {
          // Server confirmed - might have additional server-side changes
          const serverUser = await res.json();
          // Update with server response to ensure consistency
          set(streamUsersAtom, {
            value: previousUsers.map((u) =>
              u.id === id ? serverUser : u
            ),
          });
          return serverUser;
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
    } catch (error) {
      // Rollback
      set(streamUsersAtom, { value: previousUsers });
      throw error;
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Advanced: Batch Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Batch delete multiple users.
 *
 * Usage:
 * ```tsx
 * const [, batchDeleteUsers] = useAtom(batchDeleteUsersAtom);
 *
 * const handleBatchDelete = async (ids: string[]) => {
 *   const results = await batchDeleteUsers(ids);
 *   const failed = results.filter(r => !r.success);
 *   if (failed.length > 0) {
 *     toast.error(`Failed to delete ${failed.length} users`);
 *   }
 * };
 * ```
 */
export const batchDeleteUsersAtom = atom(
  null,
  async (
    _get,
    set,
    ids: string[]
  ): Promise<Array<{ id: string; success: boolean; error?: string }>> => {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await client.users[':id'].$delete({
            param: { id },
          });

          switch (res.status) {
            case 200:
              return { id, success: true };
            case 404:
              return { id, success: false, error: 'Not found' };
            default:
              return { id, success: false, error: 'Unknown error' };
          }
        } catch (error) {
          return {
            id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    // Refresh after all operations complete
    set(singleFetchUsersAtom);

    return results;
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Component Usage Examples
// ═══════════════════════════════════════════════════════════════════════════

/*
import { useState, FormEvent, Suspense } from 'react';
import { useAtom, useAtomValue } from 'jotai';

// ─────────────────────────────────────────────────────────────────────────────
// Create Form Component
// ─────────────────────────────────────────────────────────────────────────────

const CreateUserForm = () => {
  const [, createUser] = useAtom(createUserAtom);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const newUser = await createUser({
        displayName,
        bio: bio || null,
        note: null,
      });

      // Reset form on success
      setDisplayName('');
      setBio('');
      toast.success(`Created user: ${newUser.displayName}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        setError(err.message);
      } else if (err instanceof ConflictError) {
        setError('A user with this name already exists');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}

      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name"
        required
        disabled={isLoading}
      />

      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Bio (optional)"
        disabled={isLoading}
      />

      <button type="submit" disabled={isLoading || !displayName}>
        {isLoading ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// User Card with Edit/Delete
// ─────────────────────────────────────────────────────────────────────────────

const UserCard = ({ user }: { user: User }) => {
  const [, updateUser] = useAtom(updateUserAtom);
  const [, deleteUser] = useAtom(deleteUserAtom);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.displayName);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      await updateUser({ id: user.id, data: { displayName: editName } });
      setIsEditing(false);
      toast.success('User updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${user.displayName}?`)) return;

    setIsLoading(true);
    try {
      await deleteUser(user.id);
      toast.success('User deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="user-card">
      {isEditing ? (
        <div>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={isLoading}
          />
          <button onClick={handleUpdate} disabled={isLoading}>
            Save
          </button>
          <button onClick={() => setIsEditing(false)} disabled={isLoading}>
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <span>{user.displayName}</span>
          <button onClick={() => setIsEditing(true)} disabled={isLoading}>
            Edit
          </button>
          <button onClick={handleDelete} disabled={isLoading}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// User List Component
// ─────────────────────────────────────────────────────────────────────────────

const UserList = () => {
  const users = useAtomValue(usersAtom);

  if (users.length === 0) {
    return <div>No users yet. Create one above!</div>;
  }

  return (
    <div className="user-list">
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────────

export const UsersPage = () => (
  <div className="users-page">
    <h1>Users</h1>
    <CreateUserForm />
    <Suspense fallback={<div>Loading users...</div>}>
      <UserList />
    </Suspense>
  </div>
);
*/
