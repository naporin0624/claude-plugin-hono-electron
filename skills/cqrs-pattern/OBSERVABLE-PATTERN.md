# Observable Pattern for CQRS Queries

## BehaviorSubject Bridge Pattern

The key to reactive CQRS is using `BehaviorSubject` to bridge queries and commands. When a command modifies data, it notifies the BehaviorSubject, which triggers all query subscribers to re-fetch data.

## Implementation Pattern

```typescript
import { BehaviorSubject, Observable, Subject, concat, from, of } from 'rxjs';
import { distinctUntilChanged, mergeMap, throwError } from 'rxjs/operators';
import type { ResultAsync } from 'neverthrow';

export class EventServiceImpl implements EventService {
  // BehaviorSubject for change notifications
  #notify = new BehaviorSubject(Date.now());

  // Subject for snapshot notifications (granular updates)
  #notifier = new Subject<{ type: 'create' | 'update' | 'delete'; value: Event }>();

  constructor(
    private readonly db: Database,
    private readonly authService: AuthService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // QUERIES - Return Observable<T>
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get active event with reactive updates.
   *
   * Pattern: concat(initialFetch, notifyStream)
   * - Initial: Fetch current data immediately
   * - Ongoing: Re-fetch when #notify emits
   */
  active(): Observable<EventInstance | undefined> {
    return concat(
      from(this.#getActiveEvent()),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getActiveEvent()),
      ),
    ).pipe(
      mergeMap((event) =>
        event.match(
          (v) => of(v),
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  /**
   * Get list with filter support.
   */
  histories(includeHidden = false): Observable<EventInstance[]> {
    return concat(
      from(this.#getHistories(includeHidden)),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getHistories(includeHidden)),
      ),
    ).pipe(
      mergeMap((events) =>
        events.match(
          (v) => of(v),
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  /**
   * Expose snapshot stream for granular updates.
   * Used by renderer to track specific changes.
   */
  notify(): Observable<{ type: 'create' | 'update' | 'delete'; value: Event }> {
    return this.#notifier.asObservable();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMMANDS - Return ResultAsync<void, Error>
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create command that notifies subscribers.
   */
  create(data: CreateEventData): ResultAsync<void, ApplicationError> {
    const notify = () => {
      this.#notify.next(Date.now());
      return okAsync(void 0);
    };

    return this.#closeExistingActiveEvent()
      .andThen(() => this.#createEvent(data))
      .andTee(notify)
      .map(() => void 0);
  }

  /**
   * Update command with snapshot notification.
   */
  update(data: UpdateEventData): ResultAsync<void, ApplicationError> {
    return this.#updateEvent(data)
      .andThen((event) => {
        this.#notify.next(Date.now());
        this.#notifier.next({ type: 'update', value: event });
        return okAsync(void 0);
      });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - Database operations
  // ═══════════════════════════════════════════════════════════════════════

  async #getActiveEvent(): Promise<Result<EventInstance | undefined, Error>> {
    try {
      const event = await this.db.query.events.findFirst({
        where: (fields, { eq }) => eq(fields.status, 'active'),
        with: { invitees: true },
      });
      return ok(event);
    } catch (e) {
      return err(new ApplicationError('Failed to get active event', e));
    }
  }

  async #getHistories(includeHidden: boolean): Promise<Result<EventInstance[], Error>> {
    try {
      const events = await this.db.query.events.findMany({
        where: includeHidden ? undefined : (fields, { eq }) => eq(fields.hidden, false),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
      });
      return ok(events);
    } catch (e) {
      return err(new ApplicationError('Failed to get histories', e));
    }
  }
}
```

## Key Patterns

### 1. concat() for Initial + Ongoing Updates

```typescript
// Pattern: concat(initial, ongoing)
return concat(
  from(this.#fetchData()),           // Immediately emit current data
  this.#notify.pipe(
    distinctUntilChanged(),          // Prevent duplicate triggers
    mergeMap(() => this.#fetchData()) // Re-fetch on notification
  )
);
```

### 2. distinctUntilChanged() to Prevent Duplicate Fetches

```typescript
this.#notify.pipe(
  distinctUntilChanged(),  // Only emit when value actually changes
  mergeMap(() => this.#getData())
)
```

### 3. Result Type Integration

```typescript
.pipe(
  mergeMap((result) =>
    result.match(
      (value) => of(value),                    // Success: emit value
      (error) => throwError(() => error)       // Error: propagate as Observable error
    )
  )
)
```

### 4. Snapshot Notifications for Granular Updates

```typescript
// Expose a separate stream for detailed change info
#notifier = new Subject<Snapshot<'create' | 'update' | 'delete', T>>();

notify(): Observable<Snapshot<'create' | 'update' | 'delete', T>> {
  return this.#notifier.asObservable();
}

// In command, emit snapshot
update(data): ResultAsync<void, Error> {
  return this.#performUpdate(data)
    .andThen((updated) => {
      this.#notify.next(Date.now());        // Trigger list re-fetch
      this.#notifier.next({                  // Emit granular change
        type: 'update',
        value: updated
      });
      return okAsync(void 0);
    });
}
```

## Subscription Management in Main Process

```typescript
// src/main/index.ts
import { Subscription } from 'rxjs';

const subscription = new Subscription();

// Subscribe to service observables
subscription.add(
  eventService.active().subscribe((event) => {
    // Check window validity before sending
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:activeEvent', event);
    }
  })
);

subscription.add(
  eventService.notify().subscribe((snapshot) => {
    // Push granular updates
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:modify:event', snapshot);
    }
  })
);

// Cleanup on app quit
app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
```

For detailed patterns including multi-window support, error handling, and per-window subscriptions, see [MAIN-PROCESS-SUBSCRIPTION.md](MAIN-PROCESS-SUBSCRIPTION.md).

## Testing Pattern

```typescript
import { firstValueFrom } from 'rxjs';
import { init, runMigrate } from '../../__tests__/helper';

describe('EventService', () => {
  let db: ReturnType<typeof init>;
  let service: EventService;

  beforeEach(() => {
    db = init();        // In-memory SQLite
    runMigrate(db);     // Apply migrations
    service = new EventServiceImpl(db, mockAuthService);
  });

  it('should return active event via Observable', async () => {
    // Insert test data
    await db.insert(events).values({ status: 'active', name: 'Test' });

    // Use firstValueFrom to get single emission
    const event = await firstValueFrom(service.active());

    expect(event?.name).toBe('Test');
  });

  it('should re-emit when data changes', async () => {
    const emissions: Event[] = [];
    const sub = service.active().subscribe((e) => emissions.push(e));

    // Initial emission
    expect(emissions.length).toBe(1);

    // Create new event (triggers #notify)
    await service.create({ name: 'New Event' });

    // Should have re-emitted
    expect(emissions.length).toBe(2);

    sub.unsubscribe();
  });
});
```
