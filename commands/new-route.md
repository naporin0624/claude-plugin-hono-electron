# Create New Hono Route

Create a new type-safe Hono route for Electron IPC communication.

## Parameters

- **resource**: The resource name (e.g., "users", "events", "notifications")
- **path**: The route path prefix (default: `/{resource}`)

## Instructions

1. Create route file at `src/shared/callable/{resource}/index.ts`
2. Follow CQRS pattern:
   - GET endpoints for queries (via Observable)
   - POST/PUT/DELETE endpoints for commands (via ResultAsync)
3. Use Zod schemas for request validation
4. Register route in `src/shared/callable/index.ts`

## Template

```typescript
// src/shared/callable/{resource}/index.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { firstValueFromResult } from '@utils/observable';
import type { AppVariables } from '../index';

// ═══════════════════════════════════════════════════════════════════════════
// Schema Definitions
// ═══════════════════════════════════════════════════════════════════════════

const create{Resource}Schema = z.object({
  // Define required fields
  name: z.string().min(1).max(100),
  // Add optional fields
  description: z.string().max(500).optional(),
});

const update{Resource}Schema = z.object({
  // All fields optional for partial updates
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Route Implementation
// ═══════════════════════════════════════════════════════════════════════════

export const routes = new Hono<{ Variables: AppVariables }>()
  // GET /{resource} - List all
  .get('/', async (c) => {
    const result = await firstValueFromResult(
      c.var.services.{resource}.list()
    );

    return result.match(
      (items) => c.json(items, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // GET /{resource}/:id - Get by ID
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const result = await firstValueFromResult(
      c.var.services.{resource}.get(id)
    );

    return result.match(
      (item) => item
        ? c.json(item, 200)
        : c.json({ error: 'Not found' }, 404),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // POST /{resource} - Create
  .post('/', zValidator('json', create{Resource}Schema), async (c) => {
    const data = c.req.valid('json');
    const result = await c.var.services.{resource}.create(data);

    return result.match(
      () => c.json({ success: true }, 201),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // PUT /{resource}/:id - Update
  .put('/:id', zValidator('json', update{Resource}Schema), async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const result = await c.var.services.{resource}.update({ id, ...data });

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // DELETE /{resource}/:id - Delete
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const result = await c.var.services.{resource}.delete(id);

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  });

export const {resource} = { routes };
```

## Registration

Add to `src/shared/callable/index.ts`:

```typescript
import { {resource} } from './{resource}';

const app = new Hono<{ Variables: AppVariables }>()
  // ... existing routes
  .route('/{resource}', {resource}.routes);
```

## TDD Workflow

1. Write test first in `src/shared/callable/{resource}/__tests__/{resource}.test.ts`
2. Implement route handlers
3. Verify tests pass

## Checklist

- [ ] Schema definitions complete
- [ ] All endpoints implemented (GET, POST, PUT, DELETE)
- [ ] Error handling for all status codes
- [ ] Route registered in main callable
- [ ] Service interface updated
- [ ] Tests written and passing
