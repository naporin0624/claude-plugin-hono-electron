# Hono RPC API Reference

Complete reference for Hono RPC patterns used in Electron IPC.

## Client API

### Creating the Client

```typescript
import { hc } from 'hono/client';
import type { CallableType } from '@shared/callable/types';

export const client = hc<CallableType>('http://internal.localhost', {
  async fetch(input, init) {
    const { data, ...rest } = await window.electron.ipcRenderer.invoke(
      'hono-rpc-electron',
      input.toString(),
      init?.method,
      serializeHeaders(init?.headers ?? {}),
      init?.body
    );
    return Response.json(data, rest);
  },
});
```

### Making Requests

#### GET Request

```typescript
// GET /users
const res = await client.users.$get();
const users = await res.json();

// GET /users/:id
const res = await client.users[':id'].$get({
  param: { id: 'usr_123' }
});
const user = await res.json();

// GET /users?limit=10&offset=0
const res = await client.users.$get({
  query: { limit: '10', offset: '0' }
});
```

#### POST Request

```typescript
// POST /users with JSON body
const res = await client.users.$post({
  json: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});
const newUser = await res.json();
```

#### PUT Request

```typescript
// PUT /users/:id
const res = await client.users[':id'].$put({
  param: { id: 'usr_123' },
  json: {
    name: 'Updated Name'
  }
});
```

#### DELETE Request

```typescript
// DELETE /users/:id
const res = await client.users[':id'].$delete({
  param: { id: 'usr_123' }
});
```

### Response Handling

```typescript
const res = await client.users.$get();

// Check status using switch
switch (res.status) {
  case 200: {
    const data = await res.json();
    break;
  }
  default:
    console.error('Request failed:', res.status);
}

// Access status code
switch (res.status) {
  case 200:
    const users = await res.json();
    break;
  case 404:
    throw new NotFoundError();
  case 500:
    throw new ServerError();
}
```

## Route Definition

### Basic Route

```typescript
import { Hono } from 'hono';
import type { HonoEnv } from '@shared/callable';

const app = new Hono<HonoEnv>();

export const routes = app
  .get('/', (c) => {
    return c.json({ message: 'Hello' });
  });
```

### Route with Services

```typescript
export const routes = app
  .get('/', (c) => {
    // Access injected services
    const users = c.var.services.users.list();
    return c.json(users);
  });
```

### Route with Parameters

```typescript
export const routes = app
  .get('/:id', (c) => {
    const id = c.req.param('id');
    return c.json({ id });
  })
  .get('/:userId/posts/:postId', (c) => {
    const { userId, postId } = c.req.param();
    return c.json({ userId, postId });
  });
```

### Route with Zod Validation

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

const QueryParams = z.object({
  limit: z.coerce.number().default(10),
  offset: z.coerce.number().default(0),
});

export const routes = app
  .get('/', zValidator('query', QueryParams), (c) => {
    const { limit, offset } = c.req.valid('query');
    return c.json({ limit, offset });
  })
  .post('/', zValidator('json', CreateBody), (c) => {
    const body = c.req.valid('json');
    return c.json(body, 201);
  });
```

## Factory Pattern

### Basic Factory

```typescript
import { createFactory } from 'hono/factory';

type Services = {
  users: UserService;
  auth: AuthService;
};

type Variables = {
  services: Services;
};

export type HonoEnv = {
  Variables: Variables;
};

const factory = (services: Services) =>
  createFactory<HonoEnv>({
    initApp(app) {
      app.use((c, next) => {
        c.set('services', services);
        return next();
      });
    },
  });

export const createApp = (services: Services) => {
  return factory(services)
    .createApp()
    .route('/users', users.routes)
    .route('/auth', auth.routes);
};
```

### With Logger Middleware

```typescript
import { logger } from 'hono/logger';

const factory = (deps: Dependencies) =>
  createFactory<HonoEnv>({
    initApp(app) {
      app.use(logger(deps.logger?.debug ?? console.log));
      app.use((c, next) => {
        c.set('services', deps.services);
        return next();
      });
    },
  });
```

## Error Handling

### Using HTTPException

```typescript
import { HTTPException } from 'hono/http-exception';

.get('/:id', async (c) => {
  const user = await c.var.services.users.get(c.req.param('id'));
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }
  return c.json(user);
})
```

### Error Handler Middleware

```typescript
const factory = (services: Services) =>
  createFactory<HonoEnv>({
    initApp(app) {
      app.onError((err, c) => {
        if (err instanceof HTTPException) {
          return c.json({ error: err.message }, err.status);
        }
        console.error(err);
        return c.json({ error: 'Internal Server Error' }, 500);
      });
    },
  });
```

### Pattern Matching with Result

```typescript
// Using neverthrow Result type
.get('/:id', (c) => {
  return c.var.services.users.get(c.req.param('id')).match(
    (user) => c.json(user, 200),
    (error) => {
      switch (error.type) {
        case 'NotFound':
          return c.json({ error: error.message }, 404);
        case 'Unauthorized':
          return c.json({ error: error.message }, 401);
        default:
          return c.json({ error: 'Internal error' }, 500);
      }
    }
  );
})
```

## Testing Routes

### Direct Route Testing

```typescript
import { Hono } from 'hono';
import { routes } from './users';

describe('Users Route', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use((c, next) => {
      c.set('services', {
        users: mockUserService,
      });
      return next();
    });
    app.route('/users', routes);
  });

  it('should return user by id', async () => {
    mockUserService.get.mockResolvedValue({ id: '1', name: 'Test' });

    const req = new Request('http://localhost/users/1');
    const res = await app.request(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ id: '1', name: 'Test' });
  });
});
```

## Common Zod Schemas

```typescript
// String with constraints
const Name = z.string().min(1).max(100);

// Email
const Email = z.string().email();

// UUID
const UUID = z.string().uuid();

// Custom ID pattern
const UserId = z.string().regex(/^usr_[a-zA-Z0-9]+$/);

// Number coercion (for query params)
const Limit = z.coerce.number().int().positive().max(100).default(10);

// Optional with default
const Offset = z.coerce.number().int().nonnegative().default(0);

// Enum
const Status = z.enum(['active', 'inactive', 'pending']);

// Object
const CreateUser = z.object({
  name: Name,
  email: Email,
  status: Status.optional().default('active'),
});

// Partial for updates
const UpdateUser = CreateUser.partial();
```
