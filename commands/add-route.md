---
description: Add a new Hono IPC route with Zod validation
argument-hint: <route-name>
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Add New Hono IPC Route

Generate a new route for Hono-based IPC with proper structure and Zod validation.

## Arguments

- `$1` (required): Route name in kebab-case (e.g., `users`, `auth`, `event-logs`)

## Steps

### 1. Determine Route Location

Find the shared callable directory:
- Look for `src/shared/callable/` directory
- If not found, check for alternative structures

### 2. Create Route File

Create `src/shared/callable/{route-name}/index.ts`:

```typescript
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { HonoEnv } from '@shared/callable';

const app = new Hono<HonoEnv>();

// Define Zod schemas for request validation
// Example: const CreateItemBody = z.object({ name: z.string(), value: z.number() });

// Define route handlers
export const routes = app
  // GET /{route-name}
  .get('/', (c) => {
    // Access services via c.var.services
    // Example: return c.var.services.{service}.list()
    return c.json({ message: 'List items' }, 200);
  })

  // GET /{route-name}/:id
  .get('/:id', (c) => {
    const id = c.req.param('id');
    // Example: return c.var.services.{service}.get(id)
    return c.json({ id, message: 'Get item' }, 200);
  })

  // POST /{route-name}
  // .post('/', zValidator('json', CreateItemBody), (c) => {
  //   const body = c.req.valid('json');
  //   // Example: return c.var.services.{service}.create(body)
  //   return c.json({ message: 'Created' }, 201);
  // })

  // PUT /{route-name}/:id
  // .put('/:id', zValidator('json', UpdateItemBody), (c) => {
  //   const id = c.req.param('id');
  //   const body = c.req.valid('json');
  //   // Example: return c.var.services.{service}.update(id, body)
  //   return c.json({ message: 'Updated' }, 200);
  // })

  // DELETE /{route-name}/:id
  // .delete('/:id', (c) => {
  //   const id = c.req.param('id');
  //   // Example: return c.var.services.{service}.delete(id)
  //   return c.json({ message: 'Deleted' }, 200);
  // });
```

### 3. Register Route in Main App

Update `src/shared/callable/index.ts` to register the new route:

```typescript
import * as {routeName} from './{route-name}';

// In createApp function, add:
.route('/{route-name}', {routeName}.routes)
```

### 4. Add Service Interface (if needed)

If the route requires a service, update the `Services` type in `src/shared/callable/index.ts`:

```typescript
type Services = {
  // Existing services...
  {routeName}: {RouteName}Service;
};
```

### 5. Inject Service in Main Process

Update `src/main/callable/index.ts`:

```typescript
import { {routeName}Service } from '@services';

export const callable = createApp({
  services: {
    // Existing services...
    {routeName}: {routeName}Service,
  },
});
```

## Zod Validation Patterns

### Query Parameters

```typescript
const QueryParams = z.object({
  limit: z.coerce.number().optional().default(10),
  offset: z.coerce.number().optional().default(0),
  search: z.string().optional(),
});

.get('/', zValidator('query', QueryParams), (c) => {
  const { limit, offset, search } = c.req.valid('query');
  // ...
})
```

### JSON Body

```typescript
const CreateBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

.post('/', zValidator('json', CreateBody), (c) => {
  const body = c.req.valid('json');
  // body is fully typed: { name: string, email: string, age?: number }
})
```

### Path Parameters with Validation

```typescript
const IdParam = z.object({
  id: z.string().regex(/^[a-z]{3}_[a-zA-Z0-9]+$/),
});

.get('/:id', zValidator('param', IdParam), (c) => {
  const { id } = c.req.valid('param');
  // id is validated to match the pattern
})
```

## Error Handling Pattern

```typescript
import { HTTPException } from 'hono/http-exception';

.get('/:id', (c) => {
  const id = c.req.param('id');

  return c.var.services.user.get(id).match(
    (user) => c.json(user, 200),
    (error) => {
      if (error.type === 'NotFound') {
        return c.json({ error: 'User not found' }, 404);
      }
      return c.json({ error: 'Internal error' }, 500);
    }
  );
})
```

## Route Naming Conventions

| Route Name | URL Pattern | Variable Name |
|------------|-------------|---------------|
| `users` | `/users` | `users` |
| `auth` | `/auth` | `auth` |
| `event-logs` | `/event-logs` | `eventLogs` |
| `current-user` | `/current-user` | `currentUser` |

## Verification

After adding the route:
1. Check TypeScript compiles without errors
2. Verify route appears in client autocomplete
3. Test with actual IPC call
