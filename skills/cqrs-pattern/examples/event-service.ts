/**
 * Example: Complete CQRS Service Implementation
 *
 * This demonstrates the full CQRS pattern with:
 * - Observable queries with BehaviorSubject notification
 * - ResultAsync commands with error handling
 * - Snapshot notifications for granular updates
 */

import { BehaviorSubject, Observable, Subject, concat, from, of } from 'rxjs';
import { distinctUntilChanged, mergeMap, throwError } from 'rxjs/operators';
import { ResultAsync, okAsync, errAsync, ok, err } from 'neverthrow';
import type { Result } from 'neverthrow';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface Event {
  id: number;
  name: string;
  status: 'active' | 'closed' | 'cancelled';
  startedAt: Date;
  closedAt: Date | null;
  hidden: boolean;
}

interface CreateEventData {
  name: string;
  maxInvitees?: number;
}

interface UpdateEventData {
  id: number;
  name?: string;
  hidden?: boolean;
}

class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

type Snapshot<T> = {
  type: 'create' | 'update' | 'delete';
  value: T;
};

// ═══════════════════════════════════════════════════════════════════════════
// Service Interface (CQRS)
// ═══════════════════════════════════════════════════════════════════════════

interface EventService {
  // Queries - Return Observable
  active(): Observable<Event | undefined>;
  histories(includeHidden?: boolean): Observable<Event[]>;
  get(id: number): Observable<Event>;
  notify(): Observable<Snapshot<Event>>;

  // Commands - Return ResultAsync
  create(data: CreateEventData): ResultAsync<void, ApplicationError>;
  update(data: UpdateEventData): ResultAsync<void, ApplicationError>;
  close(id: number): ResultAsync<void, ApplicationError>;
  delete(id: number): ResultAsync<void, ApplicationError>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════════════════

export class EventServiceImpl implements EventService {
  // BehaviorSubject for list refresh notifications
  #notify = new BehaviorSubject(Date.now());

  // Subject for granular change notifications
  #notifier = new Subject<Snapshot<Event>>();

  constructor(
    private readonly db: Database, // Drizzle ORM instance
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // QUERIES - Observable<T>
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the currently active event.
   * Automatically re-fetches when #notify emits.
   */
  active(): Observable<Event | undefined> {
    return concat(
      from(this.#getActiveEvent()),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getActiveEvent()),
      ),
    ).pipe(
      mergeMap((result) =>
        result.match(
          (event) => of(event),
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  /**
   * Get event histories with optional hidden filter.
   */
  histories(includeHidden = false): Observable<Event[]> {
    return concat(
      from(this.#getHistories(includeHidden)),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getHistories(includeHidden)),
      ),
    ).pipe(
      mergeMap((result) =>
        result.match(
          (events) => of(events),
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  /**
   * Get single event by ID.
   */
  get(id: number): Observable<Event> {
    return concat(
      from(this.#getById(id)),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getById(id)),
      ),
    ).pipe(
      mergeMap((result) =>
        result.match(
          (event) => {
            if (event === undefined) {
              return throwError(() => new ApplicationError('Event not found'));
            }
            return of(event);
          },
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  /**
   * Expose change notification stream.
   * Useful for optimistic updates in UI.
   */
  notify(): Observable<Snapshot<Event>> {
    return this.#notifier.asObservable();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMMANDS - ResultAsync<void, ApplicationError>
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a new event.
   * Automatically closes any existing active event.
   */
  create(data: CreateEventData): ResultAsync<void, ApplicationError> {
    return this.#closeExistingActive()
      .andThen(() => this.#insertEvent(data))
      .andThen((event) => {
        // Notify all subscribers
        this.#notify.next(Date.now());
        this.#notifier.next({ type: 'create', value: event });
        return okAsync(void 0);
      });
  }

  /**
   * Update an existing event.
   */
  update(data: UpdateEventData): ResultAsync<void, ApplicationError> {
    return this.#updateEvent(data).andThen((event) => {
      this.#notify.next(Date.now());
      this.#notifier.next({ type: 'update', value: event });
      return okAsync(void 0);
    });
  }

  /**
   * Close an active event.
   */
  close(id: number): ResultAsync<void, ApplicationError> {
    return this.#closeEvent(id).andThen((event) => {
      this.#notify.next(Date.now());
      this.#notifier.next({ type: 'update', value: event });
      return okAsync(void 0);
    });
  }

  /**
   * Soft delete (hide) an event.
   */
  delete(id: number): ResultAsync<void, ApplicationError> {
    return this.#hideEvent(id).andThen((event) => {
      this.#notify.next(Date.now());
      this.#notifier.next({ type: 'delete', value: event });
      return okAsync(void 0);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - Database operations
  // ═══════════════════════════════════════════════════════════════════════

  async #getActiveEvent(): Promise<Result<Event | undefined, ApplicationError>> {
    try {
      const event = await this.db.query.events.findFirst({
        where: (fields, { eq }) => eq(fields.status, 'active'),
      });
      return ok(event);
    } catch (e) {
      return err(new ApplicationError('Failed to get active event', e));
    }
  }

  async #getHistories(includeHidden: boolean): Promise<Result<Event[], ApplicationError>> {
    try {
      const events = await this.db.query.events.findMany({
        where: includeHidden ? undefined : (fields, { eq }) => eq(fields.hidden, false),
        orderBy: (fields, { desc }) => desc(fields.startedAt),
      });
      return ok(events);
    } catch (e) {
      return err(new ApplicationError('Failed to get histories', e));
    }
  }

  async #getById(id: number): Promise<Result<Event | undefined, ApplicationError>> {
    try {
      const event = await this.db.query.events.findFirst({
        where: (fields, { eq }) => eq(fields.id, id),
      });
      return ok(event);
    } catch (e) {
      return err(new ApplicationError('Failed to get event', e));
    }
  }

  #closeExistingActive(): ResultAsync<void, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db.update(events).set({ status: 'closed', closedAt: new Date() }).where(eq(events.status, 'active')),
      (e) => new ApplicationError('Failed to close existing event', e),
    ).map(() => void 0);
  }

  #insertEvent(data: CreateEventData): ResultAsync<Event, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db
        .insert(events)
        .values({
          name: data.name,
          status: 'active',
          startedAt: new Date(),
          hidden: false,
        })
        .returning()
        .then((rows) => rows[0]),
      (e) => new ApplicationError('Failed to create event', e),
    );
  }

  #updateEvent(data: UpdateEventData): ResultAsync<Event, ApplicationError> {
    const { id, ...updates } = data;
    return ResultAsync.fromPromise(
      this.db.update(events).set(updates).where(eq(events.id, id)).returning().then((rows) => rows[0]),
      (e) => new ApplicationError('Failed to update event', e),
    );
  }

  #closeEvent(id: number): ResultAsync<Event, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db
        .update(events)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(events.id, id))
        .returning()
        .then((rows) => rows[0]),
      (e) => new ApplicationError('Failed to close event', e),
    );
  }

  #hideEvent(id: number): ResultAsync<Event, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db.update(events).set({ hidden: true }).where(eq(events.id, id)).returning().then((rows) => rows[0]),
      (e) => new ApplicationError('Failed to hide event', e),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Usage Example
// ═══════════════════════════════════════════════════════════════════════════

/*
// Main process subscription
const subscription = new Subscription();

subscription.add(
  eventService.active().subscribe((event) => {
    mainWindow.webContents.send('app:activeEvent', event);
  })
);

subscription.add(
  eventService.notify().subscribe((snapshot) => {
    mainWindow.webContents.send('app:modify:event', snapshot);
  })
);

// Cleanup
app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
*/
