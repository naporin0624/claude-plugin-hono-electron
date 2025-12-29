---
name: cqrs-pattern
description: Implement CQRS (Command Query Responsibility Segregation) pattern for Electron services. Use when creating service methods, separating read/write operations, or implementing reactive data streams with Observable for queries and ResultAsync for commands.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# CQRS Pattern for Electron Services

## Overview

This skill documents the CQRS (Command Query Responsibility Segregation) pattern used in Electron applications with RxJS and neverthrow.

## Core Principles

| Aspect | Query (Read) | Command (Write) |
|--------|--------------|-----------------|
| Purpose | Read data without side effects | Modify state |
| Return Type | `Observable<T>` | `ResultAsync<void, Error>` |
| Side Effects | None | Database writes, notifications |
| Idempotency | Always idempotent | May not be idempotent |

## Quick Start

### 1. Define Service Interface

```typescript
// src/shared/services/user.service.d.ts
import type { Observable } from 'rxjs';
import type { ResultAsync } from 'neverthrow';
import type { ApplicationError } from '@shared/typing';

interface UserService {
  // Queries - Return Observable
  list(): Observable<User[]>;
  get(id: string): Observable<User | undefined>;

  // Commands - Return ResultAsync
  create(data: CreateUserData): ResultAsync<void, ApplicationError>;
  update(data: UpdateUserData): ResultAsync<void, ApplicationError>;
  delete(id: string): ResultAsync<void, ApplicationError>;
}
```

### 2. Implement Service with BehaviorSubject Bridge

```typescript
// src/main/services/user.service.ts
import { BehaviorSubject, Observable, concat, from } from 'rxjs';
import { distinctUntilChanged, mergeMap } from 'rxjs/operators';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';

export class UserServiceImpl implements UserService {
  #notify = new BehaviorSubject(Date.now());

  constructor(private readonly db: Database) {}

  // QUERY: Returns Observable
  list(): Observable<User[]> {
    return concat(
      from(this.#getUsers()),                    // Initial fetch
      this.#notify.pipe(
        distinctUntilChanged(),
        mergeMap(() => this.#getUsers())         // Re-fetch on changes
      )
    );
  }

  // COMMAND: Returns ResultAsync
  create(data: CreateUserData): ResultAsync<void, ApplicationError> {
    return this.#insertUser(data)
      .andThen(() => {
        this.#notify.next(Date.now());           // Notify subscribers
        return okAsync(void 0);
      });
  }

  // Private: Actual database operation
  async #getUsers(): Promise<User[]> {
    return this.db.query.users.findMany();
  }

  #insertUser(data: CreateUserData): ResultAsync<void, ApplicationError> {
    return ResultAsync.fromPromise(
      this.db.insert(users).values(data),
      (e) => new ApplicationError('Failed to create user', e)
    ).map(() => void 0);
  }
}
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER (CQRS)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│   #notify = new BehaviorSubject(Date.now())                  │
│              │                                                │
│   ┌──────────┴──────────┐                                    │
│   │                     │                                    │
│   ▼                     ▼                                    │
│ QUERY                 COMMAND                                │
│ Observable<T>         ResultAsync<void>                      │
│   │                     │                                    │
│   │ concat(             │ #performOperation()               │
│   │   from(#getData()), │   .andThen(() => {                │
│   │   #notify.pipe(     │     #notify.next(Date.now());     │
│   │     mergeMap(...)   │     return okAsync(void 0);       │
│   │   )                 │   })                               │
│   │ )                   │                                    │
│   │                     │                                    │
│   └──────────┬──────────┘                                    │
│              │                                                │
│              ▼                                                │
│        DATABASE                                              │
└─────────────────────────────────────────────────────────────┘
```

## When to Use

### Use QUERY (Observable) for:
- Listing entities: `list()`, `histories()`
- Getting single entity: `get(id)`, `active()`
- Streaming updates: `notify()` (returns Subject/Observable)
- Any read operation that benefits from reactive updates

### Use COMMAND (ResultAsync) for:
- Creating entities: `create(data)`
- Updating entities: `update(data)`
- Deleting entities: `delete(id)`
- Actions with side effects: `invite()`, `send()`

## Additional Resources

- [OBSERVABLE-PATTERN.md](OBSERVABLE-PATTERN.md) - Detailed Observable implementation
- [RESULT-TYPES.md](RESULT-TYPES.md) - ResultAsync and error handling
- [examples/event-service.ts](examples/event-service.ts) - Complete implementation example
