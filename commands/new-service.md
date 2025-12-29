# Create New CQRS Service

Create a new service following the CQRS (Command Query Responsibility Segregation) pattern.

## Parameters

- **name**: The service name (e.g., "event", "user", "notification")
- **entity**: The entity type managed by this service

## Instructions

1. Define service interface at `src/shared/services/{name}.service.d.ts`
2. Implement service at `src/main/services/{name}.service.ts`
3. Write tests at `src/main/services/__tests__/{name}.service.test.ts`
4. Follow CQRS pattern strictly:
   - Queries return `Observable<T>`
   - Commands return `ResultAsync<void, ApplicationError>`

## Interface Template

```typescript
// src/shared/services/{name}.service.d.ts
import type { Observable } from 'rxjs';
import type { ResultAsync } from 'neverthrow';
import type { ApplicationError } from '@shared/typing';

// Entity type
export interface {Entity} {
  id: string;
  // Add entity fields
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// Create data type
export interface Create{Entity}Data {
  name: string;
  // Add create fields (no id, createdAt, updatedAt)
}

// Update data type
export interface Update{Entity}Data {
  id: string;
  name?: string;
  // Add optional update fields
}

// Snapshot type for granular updates
export type {Entity}Snapshot = {
  type: 'create' | 'update' | 'delete';
  value: {Entity};
};

// Service interface
export interface {Name}Service {
  // ═══════════════════════════════════════════════════════════════════════
  // QUERIES - Return Observable<T>
  // ═══════════════════════════════════════════════════════════════════════

  /** List all entities */
  list(): Observable<{Entity}[]>;

  /** Get single entity by ID */
  get(id: string): Observable<{Entity} | undefined>;

  /** Stream of granular changes */
  notify(): Observable<{Entity}Snapshot>;

  // ═══════════════════════════════════════════════════════════════════════
  // COMMANDS - Return ResultAsync<void, ApplicationError>
  // ═══════════════════════════════════════════════════════════════════════

  /** Create new entity */
  create(data: Create{Entity}Data): ResultAsync<void, ApplicationError>;

  /** Update existing entity */
  update(data: Update{Entity}Data): ResultAsync<void, ApplicationError>;

  /** Delete entity by ID */
  delete(id: string): ResultAsync<void, ApplicationError>;
}
```

## Implementation Template

```typescript
// src/main/services/{name}.service.ts
import { BehaviorSubject, Observable, Subject, concat, from, of } from 'rxjs';
import { distinctUntilChanged, mergeMap, throwError } from 'rxjs/operators';
import { ResultAsync, okAsync, errAsync, ok, err } from 'neverthrow';
import type { Result } from 'neverthrow';
import type { Database } from '@db/index';
import type {
  {Name}Service,
  {Entity},
  Create{Entity}Data,
  Update{Entity}Data,
  {Entity}Snapshot,
} from '@shared/services/{name}.service';
import { ApplicationError } from '@shared/typing';
import * as schema from '@db/schema';

export class {Name}ServiceImpl implements {Name}Service {
  // BehaviorSubject for list refresh notifications
  #notify = new BehaviorSubject(Date.now());

  // Subject for granular change notifications
  #notifier = new Subject<{Entity}Snapshot>();

  constructor(
    private readonly db: Database,
    // Add dependencies (e.g., authService)
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════

  list(): Observable<{Entity}[]> {
    return concat(
      from(this.#getAll()),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getAll()),
      ),
    ).pipe(
      mergeMap((result) =>
        result.match(
          (items) => of(items),
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  get(id: string): Observable<{Entity} | undefined> {
    return concat(
      from(this.#getById(id)),
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getById(id)),
      ),
    ).pipe(
      mergeMap((result) =>
        result.match(
          (item) => of(item),
          (error) => throwError(() => error),
        ),
      ),
    );
  }

  notify(): Observable<{Entity}Snapshot> {
    return this.#notifier.asObservable();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════════════

  create(data: Create{Entity}Data): ResultAsync<void, ApplicationError> {
    return this.#insert(data)
      .andThen((entity) => {
        this.#notify.next(Date.now());
        this.#notifier.next({ type: 'create', value: entity });
        return okAsync(void 0);
      });
  }

  update(data: Update{Entity}Data): ResultAsync<void, ApplicationError> {
    return this.#update(data)
      .andThen((entity) => {
        this.#notify.next(Date.now());
        this.#notifier.next({ type: 'update', value: entity });
        return okAsync(void 0);
      });
  }

  delete(id: string): ResultAsync<void, ApplicationError> {
    return this.#getById(id)
      .andThen((result) =>
        result.match(
          (entity) => {
            if (entity === undefined) {
              return errAsync(new ApplicationError('Entity not found'));
            }
            return this.#remove(id).map(() => entity);
          },
          (error) => errAsync(error),
        ),
      )
      .andThen((entity) => {
        this.#notify.next(Date.now());
        this.#notifier.next({ type: 'delete', value: entity });
        return okAsync(void 0);
      });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════

  async #getAll(): Promise<Result<{Entity}[], ApplicationError>> {
    try {
      const items = await this.db.query.{entities}.findMany();
      return ok(items);
    } catch (e) {
      return err(new ApplicationError('Failed to fetch', e));
    }
  }

  async #getById(id: string): Promise<Result<{Entity} | undefined, ApplicationError>> {
    try {
      const item = await this.db.query.{entities}.findFirst({
        where: (fields, { eq }) => eq(fields.id, id),
      });
      return ok(item);
    } catch (e) {
      return err(new ApplicationError('Failed to fetch', e));
    }
  }

  #insert(data: Create{Entity}Data): ResultAsync<{Entity}, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db.insert(schema.{entities}).values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning().then(rows => rows[0]),
      (e) => new ApplicationError('Failed to create', e),
    );
  }

  #update(data: Update{Entity}Data): ResultAsync<{Entity}, ApplicationError> {
    const { id, ...updates } = data;
    return ResultAsync.fromPromise(
      this.db.update(schema.{entities})
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.{entities}.id, id))
        .returning()
        .then(rows => rows[0]),
      (e) => new ApplicationError('Failed to update', e),
    );
  }

  #remove(id: string): ResultAsync<void, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db.delete(schema.{entities}).where(eq(schema.{entities}.id, id)),
      (e) => new ApplicationError('Failed to delete', e),
    ).map(() => void 0);
  }
}
```

## Test Template

```typescript
// src/main/services/__tests__/{name}.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { init, runMigrate } from '../../__tests__/helper';
import { {Name}ServiceImpl } from '../{name}.service';
import * as schema from '@db/schema';

describe('{Name}Service', () => {
  let db: ReturnType<typeof init>;
  let service: {Name}ServiceImpl;

  beforeEach(() => {
    db = init();
    runMigrate(db);
    service = new {Name}ServiceImpl(db);
  });

  describe('list()', () => {
    it('should return empty array when no data', async () => {
      const items = await firstValueFrom(service.list());
      expect(items).toEqual([]);
    });

    it('should return all items', async () => {
      await db.insert(schema.{entities}).values({ name: 'Test' });
      const items = await firstValueFrom(service.list());
      expect(items).toHaveLength(1);
    });
  });

  describe('create()', () => {
    it('should create new entity', async () => {
      const result = await service.create({ name: 'New' });
      expect(result.isOk()).toBe(true);

      const items = await firstValueFrom(service.list());
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('New');
    });
  });

  describe('update()', () => {
    it('should update existing entity', async () => {
      const [inserted] = await db.insert(schema.{entities})
        .values({ name: 'Old' })
        .returning();

      const result = await service.update({ id: inserted.id, name: 'Updated' });
      expect(result.isOk()).toBe(true);

      const item = await firstValueFrom(service.get(inserted.id));
      expect(item?.name).toBe('Updated');
    });
  });

  describe('delete()', () => {
    it('should delete existing entity', async () => {
      const [inserted] = await db.insert(schema.{entities})
        .values({ name: 'ToDelete' })
        .returning();

      const result = await service.delete(inserted.id);
      expect(result.isOk()).toBe(true);

      const items = await firstValueFrom(service.list());
      expect(items).toHaveLength(0);
    });
  });
});
```

## TDD Workflow

1. **Red**: Write failing tests first
2. **Green**: Implement minimal code to pass
3. **Refactor**: Improve while keeping tests green

## Checklist

- [ ] Service interface defined
- [ ] Service implementation complete
- [ ] BehaviorSubject notification pattern
- [ ] All queries return Observable
- [ ] All commands return ResultAsync
- [ ] Tests written (Red phase complete)
- [ ] Tests passing (Green phase complete)
- [ ] Code refactored (Refactor phase complete)
