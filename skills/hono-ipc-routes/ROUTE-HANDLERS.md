# Route Handler Implementation

## Route Structure

```typescript
// src/shared/callable/{resource}/index.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppVariables } from '../index';

// ═══════════════════════════════════════════════════════════════════════════
// Schema Definitions
// ═══════════════════════════════════════════════════════════════════════════

const createEventSchema = z.object({
  name: z.string().min(1).max(100),
  maxInvitees: z.number().int().min(1).max(100).optional(),
  autoInviterRejoin: z.boolean().optional(),
});

const updateEventSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hidden: z.boolean().optional(),
  autoInviterRejoin: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Route Implementation
// ═══════════════════════════════════════════════════════════════════════════

export const routes = new Hono<{ Variables: AppVariables }>()
  // ─────────────────────────────────────────────────────────────────────────
  // GET /events/active - Get active event (Query)
  // ─────────────────────────────────────────────────────────────────────────
  .get('/active', async (c) => {
    const result = await firstValueFromResult(
      c.var.services.event.active()
    );

    return result.match(
      (event) => event
        ? c.json(event, 200)
        : c.json(null, 200),
      (error) => {
        console.error('Failed to get active event:', error);
        return c.json({ error: error.message }, 500);
      }
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // GET /events/histories - Get event histories (Query)
  // ─────────────────────────────────────────────────────────────────────────
  .get('/histories', async (c) => {
    const includeHidden = c.req.query('includeHidden') === 'true';

    const result = await firstValueFromResult(
      c.var.services.event.histories(includeHidden)
    );

    return result.match(
      (events) => c.json(events, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // POST /events - Create event (Command)
  // ─────────────────────────────────────────────────────────────────────────
  .post('/', zValidator('json', createEventSchema), async (c) => {
    const data = c.req.valid('json');

    const result = await c.var.services.event.create(data);

    return result.match(
      () => c.json({ success: true }, 201),
      (error) => {
        if (error.message.includes('unauthorized')) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        return c.json({ error: error.message }, 500);
      }
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /events/:id - Update event (Command)
  // ─────────────────────────────────────────────────────────────────────────
  .put('/:id', zValidator('json', updateEventSchema), async (c) => {
    const id = Number(c.req.param('id'));
    const data = c.req.valid('json');

    if (Number.isNaN(id)) {
      return c.json({ error: 'Invalid ID' }, 400);
    }

    const result = await c.var.services.event.update({ id, ...data });

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /events/:id - Delete event (Command)
  // ─────────────────────────────────────────────────────────────────────────
  .delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));

    if (Number.isNaN(id)) {
      return c.json({ error: 'Invalid ID' }, 400);
    }

    const result = await c.var.services.event.delete(id);

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // POST /events/active/invite/:userId - Send invite (Command)
  // ─────────────────────────────────────────────────────────────────────────
  .post('/active/invite/:userId', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json<{ worldId: string; instanceId: string }>();

    const location = {
      worldId: body.worldId,
      instanceId: body.instanceId,
    };

    const result = await c.var.services.event.invite(userId, location);

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => {
        if (error.message.includes('not in event')) {
          return c.json({ error: 'User not in event' }, 400);
        }
        return c.json({ error: error.message }, 500)
      }
    );
  });

export const events = { routes };
```

## Observable to Value Conversion

For Query handlers (GET), use `firstValueFromResult` to convert `Observable<T>` to `Result<T, Error>`:

```typescript
import { firstValueFromResult } from '@utils/observable';

const result = await firstValueFromResult(c.var.services.event.active());
```

> See [ERROR-HANDLING.md](./ERROR-HANDLING.md) for implementation details and error class definitions.

## Dependency Injection Pattern

```typescript
// src/main/callable/index.ts
import { Hono } from 'hono';
import routes, { type AppVariables } from '@shared/callable';

/**
 * Factory function to create callable with injected services.
 *
 * This pattern follows Open/Closed principle:
 * - Open for extension (add new services)
 * - Closed for modification (existing code unchanged)
 */
export const createCallable = (services: AppVariables['services']) => {
  return new Hono<{ Variables: AppVariables }>()
    .use('*', async (c, next) => {
      // Inject all services into Hono context
      c.set('services', services);
      await next();
    })
    .route('/', routes);
};
```

## Main Process Initialization

```typescript
// src/main/index.ts
import { createCallable } from '@callable';
import { EventServiceImpl } from '@services/event.service';
import { UserServiceImpl } from '@services/user.service';
// ... other imports

// Initialize database
const db = createDatabase();
runMigrations(db);

// Initialize services
const authService = new AuthServiceImpl(storage);
const eventService = new EventServiceImpl(db, authService);
const userService = new UserServiceImpl(db, authService);
const notificationService = new NotificationServiceImpl(db, authService);

// Create callable with all services
const callable = createCallable({
  event: eventService,
  users: userService,
  notifications: notificationService,
  auth: authService,
});

// Register IPC handler
ipcMain.handle('hono-rpc-electron', async (_, url, method, headers, body) => {
  const res = await callable.request(url, { method, headers, body });
  const data = await res.json();

  // Log errors for debugging
  if (res.status >= 400) {
    logService.write('error', 'api-error', {
      url,
      status: res.status,
      error: data.error,
    });
  }

  return { ...res, data };
});
```

## Nested Routes Pattern

```typescript
// src/shared/callable/events/index.ts
import { Hono } from 'hono';
import { invitees } from './invitees';
import { logs } from './logs';

export const routes = new Hono<{ Variables: AppVariables }>()
  .get('/active', ...)
  .post('/', ...)
  // Nested routes
  .route('/active/invitees', invitees.routes)
  .route('/:eventId/logs', logs.routes);

// src/shared/callable/events/invitees/index.ts
export const routes = new Hono<{ Variables: AppVariables }>()
  .get('/', async (c) => {
    // GET /events/active/invitees
    const result = await firstValueFromResult(
      c.var.services.event.getInvitees()
    );
    return result.match(
      (invitees) => c.json(invitees, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })
  .post('/:userId', async (c) => {
    // POST /events/active/invitees/:userId
    const userId = c.req.param('userId');
    // ...
  });
```

## Error Response Patterns

```typescript
// Consistent error response structure
type ErrorResponse = {
  error: string;
  code?: string;
  details?: unknown;
};

// Route handler with comprehensive error handling
.post('/', zValidator('json', schema), async (c) => {
  const data = c.req.valid('json');

  const result = await c.var.services.resource.create(data);

  return result.match(
    () => c.json({ success: true }, 201),
    (error) => {
      // Map specific errors to HTTP status codes
      if (error.name === 'UnauthorizedError') {
        return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      }

      if (error.name === 'NotFoundError') {
        return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
      }

      if (error.name === 'ValidationError') {
        return c.json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.details,
        }, 400);
      }

      // Generic server error
      console.error('Unhandled error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  );
});
```

## Testing Route Handlers

```typescript
import { createCallable } from '@callable';
import { init, runMigrate } from '../../__tests__/helper';

describe('Events Routes', () => {
  let callable: ReturnType<typeof createCallable>;
  let db: ReturnType<typeof init>;

  beforeEach(() => {
    db = init();
    runMigrate(db);

    const mockAuthService = { getToken: vi.fn().mockResolvedValue('token') };
    const eventService = new EventServiceImpl(db, mockAuthService);

    callable = createCallable({ event: eventService });
  });

  it('GET /events/active returns active event', async () => {
    // Insert test data
    await db.insert(events).values({
      name: 'Test Event',
      status: 'active',
      startedAt: new Date(),
    });

    // Make request
    const res = await callable.request('/events/active');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.name).toBe('Test Event');
  });

  it('POST /events creates new event', async () => {
    const res = await callable.request('/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Event' }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(201);

    // Verify in database
    const created = await db.query.events.findFirst();
    expect(created?.name).toBe('New Event');
  });

  it('POST /events returns 400 for invalid input', async () => {
    const res = await callable.request('/events', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),  // Empty name
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
  });
});
```
