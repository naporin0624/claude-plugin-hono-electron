# Type Safety in Hono IPC

## Type Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TYPE SAFETY FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ROUTE DEFINITION                                                   │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ const route = new Hono()                                     │   │
│   │   .get('/users', (c) => c.json([{ id: '1', name: 'John' }])) │   │
│   │                              ▲                                │   │
│   │                              │ Return type inferred           │   │
│   │                              │ { id: string, name: string }[] │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                   │                                  │
│                                   │ export type CallableType        │
│                                   ▼                                  │
│   CLIENT CREATION                                                    │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ const client = hc<CallableType>(...)                         │   │
│   │                     ▲                                         │   │
│   │                     │ CallableType carries all route types   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                   │                                  │
│                                   ▼                                  │
│   CLIENT USAGE                                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ const res = await client.users.$get()                        │   │
│   │ const data = await res.json()                                │   │
│   │       ▲                                                       │   │
│   │       │ TypeScript knows: { id: string, name: string }[]     │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Defining Typed Routes

### Basic Route with Inferred Types

```typescript
// src/shared/callable/users/index.ts
import { Hono } from 'hono';

// Return type is automatically inferred from c.json()
export const route = new Hono()
  .get('/', (c) => {
    const users = [
      { id: 'usr_1', displayName: 'John', bio: 'Hello' },
      { id: 'usr_2', displayName: 'Jane', bio: null },
    ];
    return c.json(users, 200);
    //            ▲ TypeScript infers: { id: string, displayName: string, bio: string | null }[]
  });
```

### Explicit Type Annotations

```typescript
// When you need explicit control over types
interface User {
  id: string;
  displayName: string;
  bio: string | null;
  createdAt: string;  // ISO date string for JSON serialization
}

export const route = new Hono()
  .get('/', (c) => {
    const users: User[] = await fetchUsers();
    return c.json(users, 200);
  });
```

## Request Validation with Zod

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// Schema definition
const createUserSchema = z.object({
  displayName: z.string().min(1).max(50),
  bio: z.string().max(500).optional(),
  email: z.string().email().optional(),
});

// Infer type from schema
type CreateUserInput = z.infer<typeof createUserSchema>;
// { displayName: string, bio?: string, email?: string }

export const route = new Hono()
  .post('/', zValidator('json', createUserSchema), async (c) => {
    const data = c.req.valid('json');
    //    ▲ TypeScript knows: { displayName: string, bio?: string, email?: string }

    // data.displayName is guaranteed to be a string
    // data.bio is string | undefined

    return c.json({ success: true }, 201);
  });
```

## Path Parameters

```typescript
export const route = new Hono()
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    //    ▲ TypeScript knows: string (required param)

    return c.json({ id }, 200);
  })

  .get('/:userId/posts/:postId', async (c) => {
    const userId = c.req.param('userId');
    const postId = c.req.param('postId');
    //    ▲ Both are string

    return c.json({ userId, postId }, 200);
  });
```

## Query Parameters

```typescript
export const route = new Hono()
  .get('/', async (c) => {
    const page = c.req.query('page');
    //    ▲ TypeScript knows: string | undefined

    const pageNum = page ? Number(page) : 1;

    const filter = c.req.query('filter');
    const includeHidden = c.req.query('includeHidden') === 'true';

    return c.json({ page: pageNum, filter, includeHidden }, 200);
  });
```

## Client Type Inference

```typescript
// src/shared/callable/index.ts
import { Hono } from 'hono';
import { users } from './users';
import { events } from './events';

const app = new Hono()
  .route('/users', users.route)
  .route('/events', events.routes);

// Export type for client
export type CallableType = typeof app;
export default app;

// src/renderer/src/adapters/client.ts
import { hc } from 'hono/client';
import type { CallableType } from '@shared/callable';

export const client = hc<CallableType>('http://internal.localhost', {
  // Custom fetch implementation
});

// USAGE - Full type inference!
const getUsers = async () => {
  const res = await client.users.$get();
  //               ▲ TypeScript knows: Response promise

  if (!res.ok) {
    throw new Error('Failed to fetch users');
  }

  const users = await res.json();
  //    ▲ TypeScript knows the exact return type from route definition

  return users;
};

// POST with typed body
const createUser = async (data: { displayName: string }) => {
  const res = await client.users.$post({
    json: data,
    //    ▲ TypeScript validates against zValidator schema
  });

  return res.json();
};
```

## Context Variables Type Safety

```typescript
// src/shared/callable/index.ts
import type { EventService } from '@shared/services/event.service';
import type { UserService } from '@shared/services/user.service';

// Define context variables type
export type AppVariables = {
  services: {
    event: EventService;
    users: UserService;
    notifications: NotificationService;
  };
};

// Use in route definition
const app = new Hono<{ Variables: AppVariables }>()
  .get('/users', async (c) => {
    // TypeScript knows c.var.services structure
    const users = await c.var.services.users.list();
    //                        ▲ Fully typed service access
    return c.json(users, 200);
  });
```

## Error Response Types

```typescript
// Define error response type
type ErrorResponse = {
  error: string;
  code?: string;
};

// Route with typed error responses
export const route = new Hono<{ Variables: AppVariables }>()
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const result = await firstValueFromResult(c.var.services.users.get(id));

    return result.match(
      (user) => {
        if (user === undefined) {
          return c.json({ error: 'User not found' } as ErrorResponse, 404);
        }
        return c.json(user, 200);
      },
      (error) => c.json({ error: error.message } as ErrorResponse, 500)
    );
  });
```

## Client-Side Type Usage

```typescript
// Full type-safe client usage in renderer
const UserProfile = () => {
  const [user, setUser] = useState<Awaited<ReturnType<typeof fetchUser>> | null>(null);

  const fetchUser = async (id: string) => {
    const res = await client.users[':id'].$get({
      param: { id },
      //       ▲ TypeScript requires 'id' param
    });

    if (res.status === 404) {
      return null;
    }

    return res.json();
    //         ▲ Return type is inferred from route
  };

  // POST with validation
  const createUser = async () => {
    const res = await client.users.$post({
      json: {
        displayName: 'John',  // Required by zValidator
        bio: 'Hello',         // Optional
        // email: 123,        // ❌ TypeScript error: must be string
      },
    });

    if (res.status === 400) {
      // Validation error
      const error = await res.json();
      console.error(error);
      return;
    }

    if (res.status === 201) {
      // Success
      const data = await res.json();
      console.log('Created:', data.success);
    }
  };
};
```

## Type-Safe Atom Integration

```typescript
// src/renderer/src/views/atoms/users.atom.ts
import { atom } from 'jotai';
import { client } from '@adapters/client';

// Return type is inferred from client.users.$get()
const fetchUsersAtom = atom(async () => {
  const res = await client.users.$get();

  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 500) throw new UnknownError();

  return res.json();
  //         ▲ TypeScript infers correct return type
});

// Mutation atom with typed input
const createUserAtom = atom(
  null,
  async (_get, _set, input: { displayName: string; bio?: string }) => {
    const res = await client.users.$post({ json: input });
    //                                          ▲ Type checked against schema

    if (!res.ok) {
      throw new Error('Failed to create user');
    }

    return res.json();
  }
);
```

## Best Practices

### DO:
- Let TypeScript infer types from route definitions
- Use `zValidator` for all input validation
- Export `CallableType` from shared routes
- Use explicit types for complex response structures

### DON'T:
- Use `any` for request bodies
- Skip validation for POST/PUT endpoints
- Cast response types manually
- Ignore type errors in route handlers
