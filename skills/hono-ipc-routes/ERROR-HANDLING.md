# Route Handler Error Handling

In Electron's main process, **unhandled exceptions crash the entire application**. Use [neverthrow](https://github.com/supermacro/neverthrow) to handle errors as values.

## Error Classes

```typescript
// src/main/errors/index.ts
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
```

## firstValueFromResult

Converts `Observable<T>` to `Promise<Result<T, Error>>` with timeout:

```typescript
// src/main/utils/observable.ts
import { firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
import { Result, ResultAsync } from 'neverthrow';
import { QueryTimeoutError, QueryError, type FirstValueFromResultError } from '@errors';

const DEFAULT_TIMEOUT_MS = 5000;

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

## instanceof Narrowing

```typescript
result.match(
  (event) => c.json(event, 200),
  (error) => {
    if (error instanceof QueryTimeoutError) {
      return c.json({ error: 'Request timed out' }, 504);
    }
    // error is QueryError
    console.error('Query failed:', error.cause);
    return c.json({ error: error.message }, 500);
  }
);
```

## Patterns Summary

| HTTP Method | Pattern | Service Return | Handler |
|-------------|---------|----------------|---------|
| GET | Query | `Observable<T>` | `firstValueFromResult(obs).match(...)` |
| POST/PUT/DELETE | Command | `ResultAsync<void, E>` | `result.match(...)` |
