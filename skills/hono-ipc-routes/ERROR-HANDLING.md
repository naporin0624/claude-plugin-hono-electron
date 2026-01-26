# Route Handler Error Handling

## Why Error Handling Matters

In Electron's main process, **unhandled exceptions crash the entire application**. Using [neverthrow](https://github.com/supermacro/neverthrow) ensures all errors are handled explicitly as values, preventing crashes.

## Error Handling Patterns

### Query Pattern (GET) - Observable to Result

For queries that return `Observable<T>`, wrap `firstValueFrom` with `timeout` using `ResultAsync.fromPromise`:

```typescript
import { firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
import { ResultAsync, Result } from 'neverthrow';

const DEFAULT_TIMEOUT_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════

export class QueryTimeoutError extends Error {
  override readonly name = 'QueryTimeoutError';
  constructor(readonly timeoutMs: number) {
    super(`Query timed out after ${timeoutMs}ms`);
  }
}

export class QueryError extends Error {
  override readonly name = 'QueryError';
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : `${cause}`);
  }
}

export type FirstValueFromResultError = QueryTimeoutError | QueryError;

// ═══════════════════════════════════════════════════════════════════════════
// Function Overloads
// ═══════════════════════════════════════════════════════════════════════════

// Overload: no options
export function firstValueFromResult<T>(
  observable: Observable<T>
): Promise<Result<T, FirstValueFromResultError>>;

// Overload: timeout only
export function firstValueFromResult<T>(
  observable: Observable<T>,
  options: { timeout: number }
): Promise<Result<T, FirstValueFromResultError>>;

// Overload: with defaultValue
export function firstValueFromResult<T, D>(
  observable: Observable<T>,
  options: { timeout?: number; defaultValue: D }
): Promise<Result<T | D, FirstValueFromResultError>>;

// Implementation
export async function firstValueFromResult<T, D = never>(
  observable: Observable<T>,
  options: { timeout?: number; defaultValue?: D } = {}
): Promise<Result<T | D, FirstValueFromResultError>> {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const config = 'defaultValue' in options
    ? { defaultValue: options.defaultValue as D }
    : undefined;

  return ResultAsync.fromPromise(
    firstValueFrom(observable.pipe(timeout(timeoutMs)), config),
    (e): FirstValueFromResultError => {
      if (e instanceof TimeoutError) {
        return new QueryTimeoutError(timeoutMs);
      }
      return new QueryError(e);
    }
  );
}
```

**Usage in route handler:**

```typescript
import { Hono } from 'hono';
import { firstValueFromResult } from '@utils/observable';

const routes = new Hono<{ Variables: AppVariables }>()
  // GET /events/active - Query pattern
  .get('/active', async (c) => {
    const result = await firstValueFromResult(
      c.var.services.event.active()
    );

    return result.match(
      (event) => c.json(event ?? null, 200),
      (error) => {
        console.error('Failed to get active event:', error);
        return c.json({ error: error.message }, 500);
      }
    );
  })

  // GET /events/histories - Query with parameters
  .get('/histories', async (c) => {
    const includeHidden = c.req.query('includeHidden') === 'true';

    const result = await firstValueFromResult(
      c.var.services.event.histories(includeHidden)
    );

    return result.match(
      (events) => c.json(events, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  });
```

### Command Pattern (POST/PUT/DELETE) - ResultAsync Direct Match

For commands that already return `ResultAsync<void, ApplicationError>`, use `.match()` directly:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const createEventSchema = z.object({
  name: z.string().min(1).max(100),
});

const routes = new Hono<{ Variables: AppVariables }>()
  // POST /events - Command pattern
  .post('/', zValidator('json', createEventSchema), async (c) => {
    const data = c.req.valid('json');

    const result = await c.var.services.event.create(data);

    return result.match(
      () => c.json({ success: true }, 201),
      (error) => {
        console.error('Create failed:', error.cause);

        if (error.message.includes('unauthorized')) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        return c.json({ error: error.message }, 500);
      }
    );
  })

  // PUT /events/:id - Command with ID parameter
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

  // DELETE /events/:id - Command pattern
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
  });
```

## Complete Utility Implementation

```typescript
// src/main/utils/observable.ts
import { firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
import { Result, ResultAsync } from 'neverthrow';

const DEFAULT_TIMEOUT_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════════
// Error Classes - enables instanceof narrowing
// ═══════════════════════════════════════════════════════════════════════════

export class QueryTimeoutError extends Error {
  override readonly name = 'QueryTimeoutError';
  constructor(readonly timeoutMs: number) {
    super(`Query timed out after ${timeoutMs}ms`);
  }
}

export class QueryError extends Error {
  override readonly name = 'QueryError';
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : `${cause}`);
  }
}

export type FirstValueFromResultError = QueryTimeoutError | QueryError;

// ═══════════════════════════════════════════════════════════════════════════
// Function Overloads
// ═══════════════════════════════════════════════════════════════════════════

export function firstValueFromResult<T>(
  observable: Observable<T>
): Promise<Result<T, FirstValueFromResultError>>;

export function firstValueFromResult<T>(
  observable: Observable<T>,
  options: { timeout: number }
): Promise<Result<T, FirstValueFromResultError>>;

export function firstValueFromResult<T, D>(
  observable: Observable<T>,
  options: { timeout?: number; defaultValue: D }
): Promise<Result<T | D, FirstValueFromResultError>>;

export async function firstValueFromResult<T, D = never>(
  observable: Observable<T>,
  options: { timeout?: number; defaultValue?: D } = {}
): Promise<Result<T | D, FirstValueFromResultError>> {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const config = 'defaultValue' in options
    ? { defaultValue: options.defaultValue as D }
    : undefined;

  return ResultAsync.fromPromise(
    firstValueFrom(observable.pipe(timeout(timeoutMs)), config),
    (e): FirstValueFromResultError => {
      if (e instanceof TimeoutError) {
        return new QueryTimeoutError(timeoutMs);
      }
      return new QueryError(e);
    }
  );
}
```

**Usage with instanceof narrowing:**

```typescript
const result = await firstValueFromResult(service.getActive());

return result.match(
  (event) => c.json(event, 200),
  (error) => {
    if (error instanceof QueryTimeoutError) {
      return c.json({ error: 'Request timed out' }, 504);
    }
    // error is QueryError here
    console.error('Query failed:', error.cause);
    return c.json({ error: error.message }, 500);
  }
);
```

## Summary

| HTTP Method | Pattern | Service Return Type | Handler Pattern |
|-------------|---------|---------------------|-----------------|
| GET | Query | `Observable<T>` | `firstValueFromResult(obs).match(...)` |
| POST | Command | `ResultAsync<void, Error>` | `result.match(...)` |
| PUT | Command | `ResultAsync<void, Error>` | `result.match(...)` |
| DELETE | Command | `ResultAsync<void, Error>` | `result.match(...)` |

## Best Practices

1. **Always use timeout for queries** - Prevents hanging when Observable never emits
2. **Log errors server-side** - Use `console.error()` before returning error response
3. **Map specific errors to HTTP status** - e.g., unauthorized -> 401, not found -> 404
4. **Never expose internal error details** - Return generic messages to client
