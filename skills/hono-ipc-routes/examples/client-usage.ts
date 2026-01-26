/**
 * Example: Hono RPC Client Usage
 *
 * Demonstrates:
 * - Custom fetch implementation for Electron IPC
 * - Type-safe API calls
 * - Error handling patterns
 * - Integration with Jotai atoms
 */

import { hc } from 'hono/client';
import type { CallableType } from '@shared/callable';

// ═══════════════════════════════════════════════════════════════════════════
// Client Setup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize headers for IPC transmission.
 * Headers can come in various formats, so we normalize to array of tuples.
 */
const serializeHeader = (headers: HeadersInit | undefined): [string, string][] => {
  if (headers === undefined) return [];
  if (headers instanceof Headers) {
    return [...headers.entries()];
  }
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers);
};

/**
 * Create typed Hono client with custom IPC fetch.
 *
 * The client uses a pseudo-URL ('http://internal.localhost') since
 * actual routing happens in the main process via IPC.
 */
export const client = hc<CallableType>('http://internal.localhost', {
  async fetch(input, init) {
    const url = input.toString();
    const args = [
      url,
      init?.method,
      serializeHeader(init?.headers),
      init?.body
    ];

    // Invoke main process handler
    const { data, ...rest } = await window.electron.ipcRenderer.invoke(
      'hono-rpc-electron',
      ...args
    );

    // Return as standard Response object
    return Response.json(data, rest);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Basic Usage Examples
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET request example - List users
 */
export const getUsers = async () => {
  const res = await client.users.$get();

  // Handle different status codes
  switch (res.status) {
    case 200:
      return res.json();  // TypeScript knows the return type
    case 401:
      throw new UnauthorizedError();
    case 500:
      throw new ServerError();
    default:
      throw new Error(`Unexpected status: ${res.status}`);
  }
};

/**
 * GET with path parameters - Get single user
 */
export const getUser = async (id: string) => {
  const res = await client.users[':id'].$get({
    param: { id },  // TypeScript enforces 'id' param
  });

  switch (res.status) {
    case 200:
      return res.json();
    case 404:
      return null;  // User not found
    default:
      throw new Error('Failed to fetch user');
  }
};

/**
 * GET with query parameters - Filter users
 */
export const getFriendUsers = async () => {
  const res = await client.users.$get({
    query: { friendOnly: 'true' },
  });

  return res.json();
};

/**
 * POST request example - Create user
 */
export const createUser = async (data: {
  id: string;
  displayName: string;
  bio?: string | null;
}) => {
  const res = await client.users.$post({
    json: data,  // TypeScript validates against schema
  });

  switch (res.status) {
    case 201:
      return res.json();
    case 400: {
      const error = await res.json();
      throw new ValidationError(error.error);
    }
    case 409:
      throw new ConflictError('User already exists');
    default:
      throw new Error('Failed to create user');
  }
};

/**
 * PUT request example - Update user
 */
export const updateUser = async (id: string, data: {
  displayName?: string;
  bio?: string | null;
  note?: string | null;
}) => {
  const res = await client.users[':id'].$put({
    param: { id },
    json: data,
  });

  switch (res.status) {
    case 200:
      return res.json();
    case 404:
      throw new NotFoundError('User not found');
    default:
      throw new Error('Failed to update user');
  }
};

/**
 * DELETE request example - Delete user
 */
export const deleteUser = async (id: string) => {
  const res = await client.users[':id'].$delete({
    param: { id },
  });

  switch (res.status) {
    case 200:
      return res.json();
    default:
      throw new Error('Failed to delete user');
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Jotai Atom Integration
// ═══════════════════════════════════════════════════════════════════════════

import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';

/**
 * Read-only atom for fetching users.
 * Integrates with Suspense for loading states.
 */
export const usersAtom = atomWithRefresh(async () => {
  const res = await client.users.$get();

  switch (res.status) {
    case 200:
      return res.json();
    case 401:
      throw new UnauthorizedError('Please log in');
    default:
      throw new Error('Failed to fetch users');
  }
});

/**
 * Write-only atom for creating users.
 * Usage: const [, createUser] = useAtom(createUserAtom);
 */
export const createUserAtom = atom(
  null,  // No read value
  async (_get, set, data: { id: string; displayName: string }) => {
    const res = await client.users.$post({ json: data });

    switch (res.status) {
      case 201: {
        // Refresh users list after creation
        set(usersAtom);
        return res.json();
      }
      default: {
        const error = await res.json();
        throw new Error(error.error);
      }
    }
  }
);

/**
 * Write-only atom for updating users.
 */
export const updateUserAtom = atom(
  null,
  async (_get, set, { id, data }: { id: string; data: { displayName?: string } }) => {
    const res = await client.users[':id'].$put({
      param: { id },
      json: data,
    });

    switch (res.status) {
      case 200: {
        // Refresh users list after update
        set(usersAtom);
        return res.json();
      }
      default:
        throw new Error('Failed to update user');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// React Component Example
// ═══════════════════════════════════════════════════════════════════════════

/*
import { Suspense } from 'react';
import { useAtomValue, useAtom } from 'jotai';

const UserList = () => {
  const users = useAtomValue(usersAtom);
  const [, createUser] = useAtom(createUserAtom);

  const handleCreate = async () => {
    try {
      await createUser({
        id: 'usr_' + Date.now(),
        displayName: 'New User',
      });
      toast.success('User created!');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <button onClick={handleCreate}>Create User</button>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.displayName}</li>
        ))}
      </ul>
    </div>
  );
};

const UsersPage = () => (
  <Suspense fallback={<Loading />}>
    <UserList />
  </Suspense>
);
*/

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

class ValidationError extends Error {
  constructor(message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

class ServerError extends Error {
  constructor(message = 'Server error') {
    super(message);
    this.name = 'ServerError';
  }
}
