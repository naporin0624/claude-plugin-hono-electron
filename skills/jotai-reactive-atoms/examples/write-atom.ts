/**
 * Example: Write Atom Implementation
 *
 * This demonstrates the write atom pattern with:
 * - Create, Update, Delete operations
 * - Type-safe payloads
 * - Error handling with specific error classes
 * - Automatic refresh of read atoms
 */

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

type CreateUserData = Omit<User, 'id' | 'createdAt'>;
type UpdateUserData = Partial<Pick<User, 'displayName' | 'bio' | 'note'>>;

// ═══════════════════════════════════════════════════════════════════════════
// Read Atoms (Required for refresh after mutations)
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
// Write Atom: Create User
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write-only atom for creating users.
 *
 * Usage: const [, createUser] = useAtom(createUserAtom);
 */
export const createUserAtom = atom(
  null,
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
 * Usage: const [, updateUser] = useAtom(updateUserAtom);
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
 * Usage: const [, deleteUser] = useAtom(deleteUserAtom);
 */
export const deleteUserAtom = atom(
  null,
  async (_get, set, id: string): Promise<{ success: boolean }> => {
    const res = await client.users[':id'].$delete({
      param: { id },
    });

    switch (res.status) {
      case 200: {
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
