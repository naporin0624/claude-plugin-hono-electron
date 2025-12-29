# ResultAsync Pattern for CQRS Commands

## Overview

Commands in CQRS return `ResultAsync<void, ApplicationError>` from the [neverthrow](https://github.com/supermacro/neverthrow) library. This provides type-safe error handling without exceptions.

## Core Principles

1. **Commands never return business data** - Only `ResultAsync<void, Error>`
2. **All errors are values** - No thrown exceptions
3. **Composable operations** - Chain with `.andThen()`, `.map()`, `.andTee()`
4. **Explicit error handling** - Caller must handle both success and failure

## Basic Usage

```typescript
import { ResultAsync, okAsync, errAsync } from 'neverthrow';

// Define error type
export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

// Command returns ResultAsync
create(data: CreateData): ResultAsync<void, ApplicationError> {
  return ResultAsync.fromPromise(
    this.db.insert(table).values(data),
    (e) => new ApplicationError('Failed to create', e)
  ).map(() => void 0);
}
```

## Composition Patterns

### 1. andThen() - Chain dependent operations

```typescript
create(data: CreateEventData): ResultAsync<void, ApplicationError> {
  return this.#closeExistingActiveEvent()
    .andThen(() => this.#createNewEvent(data))
    .andThen(() => this.#notifySubscribers())
    .map(() => void 0);
}
```

### 2. andTee() - Side effects without changing result

```typescript
create(data: CreateData): ResultAsync<void, ApplicationError> {
  const notify = () => {
    this.#notify.next(Date.now());
    return okAsync(void 0);
  };

  return this.#createInDb(data)
    .andTee(notify)           // Notify subscribers (side effect)
    .andTee(() => this.#log('Created'))
    .map(() => void 0);
}
```

### 3. mapErr() - Transform error types

```typescript
#getToken(): ResultAsync<string, ApplicationError> {
  return ResultAsync.fromPromise(
    this.authService.getToken(),
    () => new ApplicationError('Auth failed')
  ).mapErr((e) => {
    if (e instanceof UnauthorizedError) {
      return new ApplicationError('Please login first');
    }
    return e;
  });
}
```

### 4. combine() - Parallel operations

```typescript
import { ResultAsync } from 'neverthrow';

async batchCreate(items: CreateData[]): ResultAsync<void, ApplicationError> {
  const operations = items.map(item => this.#createSingle(item));

  return ResultAsync.combine(operations)
    .andThen(() => {
      this.#notify.next(Date.now());
      return okAsync(void 0);
    });
}
```

## Service Implementation Example

```typescript
export class InviteServiceImpl implements InviteService {
  constructor(
    private readonly db: Database,
    private readonly authService: AuthService,
    private readonly vrchatAdapter: VRChatAdapter,
  ) {}

  /**
   * Send invite command.
   * Demonstrates multi-step command with error handling.
   */
  send(userId: string, location: Location): ResultAsync<void, ApplicationError> {
    // Step 1: Get auth token
    return this.#getAuthToken()
      // Step 2: Send to VRChat API
      .andThen((token) =>
        this.#sendToVRChat(token, userId, location)
      )
      // Step 3: Record in local database
      .andThen(() =>
        this.#recordInvite(userId, location)
      )
      // Step 4: Notify subscribers
      .andTee(() => {
        this.#notify.next(Date.now());
        return okAsync(void 0);
      })
      // Ensure void return
      .map(() => void 0);
  }

  #getAuthToken(): ResultAsync<string, ApplicationError> {
    return ResultAsync.fromPromise(
      this.authService.getToken(),
      () => new ApplicationError('Failed to get auth token')
    );
  }

  #sendToVRChat(
    token: string,
    userId: string,
    location: Location
  ): ResultAsync<void, ApplicationError> {
    return ResultAsync.fromPromise(
      this.vrchatAdapter.sendInvite(token, userId, location),
      (e) => new ApplicationError('VRChat API error', e)
    );
  }

  #recordInvite(userId: string, location: Location): ResultAsync<void, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db.insert(invites).values({
        userId,
        worldId: location.worldId,
        instanceId: location.instanceId,
        sentAt: new Date(),
      }),
      (e) => new ApplicationError('Database error', e)
    ).map(() => void 0);
  }
}
```

## Error Handling in Hono Routes

```typescript
// src/shared/callable/events/index.ts
import { Hono } from 'hono';
import { firstValueFromResult } from '@utils/observable';

const app = new Hono<{ Variables: AppVariables }>()
  .post('/create', async (c) => {
    const body = await c.req.json();
    const validated = createEventSchema.safeParse(body);

    if (!validated.success) {
      return c.json({ error: 'Invalid input' }, 400);
    }

    // Execute command and handle result
    const result = await c.var.services.event.create(validated.data);

    return result.match(
      () => c.json({ success: true }, 201),
      (error) => {
        // Log error details (not exposed to client)
        console.error('Create failed:', error.cause);

        // Return appropriate status
        if (error.message.includes('unauthorized')) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        return c.json({ error: error.message }, 500);
      }
    );
  });
```

## Calling Commands from Renderer

```typescript
// src/renderer/src/atoms/events.atom.ts
import { atom } from 'jotai';
import { client } from '@adapters/client';

export const createEventAtom = atom(
  null,
  async (_get, _set, data: CreateEventData) => {
    const res = await client.events.create.$post({ json: data });

    if (res.status === 401) {
      throw new UnauthorizedError();
    }

    if (res.status >= 400) {
      const body = await res.json();
      throw new Error(body.error || 'Failed to create event');
    }

    // Success - UI will update via IPC subscription
  }
);

// Usage in component
const Component = () => {
  const [, createEvent] = useAtom(createEventAtom);

  const handleCreate = async () => {
    try {
      await createEvent({ name: 'New Event' });
      // Success - data will automatically update
    } catch (e) {
      // Handle error
      toast.error(e.message);
    }
  };
};
```

## Testing Commands

```typescript
describe('InviteService.send', () => {
  let service: InviteService;
  let mockVRChatAdapter: MockVRChatAdapter;

  beforeEach(() => {
    const db = init();
    runMigrate(db);

    mockVRChatAdapter = {
      sendInvite: vi.fn().mockResolvedValue(undefined),
    };

    service = new InviteServiceImpl(
      db,
      mockAuthService,
      mockVRChatAdapter,
    );
  });

  it('should return ok on success', async () => {
    const result = await service.send('usr_123', mockLocation);

    expect(result.isOk()).toBe(true);
    expect(mockVRChatAdapter.sendInvite).toHaveBeenCalledWith(
      expect.any(String),
      'usr_123',
      mockLocation
    );
  });

  it('should return err on VRChat API failure', async () => {
    mockVRChatAdapter.sendInvite.mockRejectedValue(new Error('API error'));

    const result = await service.send('usr_123', mockLocation);

    expect(result.isErr()).toBe(true);
    result.mapErr((e) => {
      expect(e.message).toContain('VRChat API error');
    });
  });

  it('should not record invite on API failure', async () => {
    mockVRChatAdapter.sendInvite.mockRejectedValue(new Error('API error'));

    await service.send('usr_123', mockLocation);

    const invites = await db.query.invites.findMany();
    expect(invites).toHaveLength(0);
  });
});
```

## Best Practices

### DO:
- Always return `ResultAsync<void, ApplicationError>` from commands
- Use `.andThen()` for sequential dependent operations
- Use `.andTee()` for side effects (notifications, logging)
- Handle all error cases explicitly with `.match()`

### DON'T:
- Return business data from commands (use queries instead)
- Throw exceptions from within ResultAsync chains
- Ignore the error case in `.match()`
- Use `._unsafeUnwrap()` without checking `.isOk()` first
