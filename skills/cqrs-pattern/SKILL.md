---
name: cqrs-pattern
description: Implement CQRS (Command Query Responsibility Segregation) pattern for Electron services. Use when creating service methods, separating read/write operations, or implementing reactive data streams with Observable for queries and ResultAsync for commands.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# CQRS Pattern

## Core Principle

| Aspect | Query (Read) | Command (Write) |
|--------|--------------|-----------------|
| Return Type | `Observable<T>` | `ResultAsync<void, Error>` |
| Side Effects | None | Database writes, notifications |

## Quick Reference

```typescript
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

## Implementation Pattern

Use `BehaviorSubject` to bridge queries and commands:

```typescript
#notify = new BehaviorSubject(Date.now());

// Query: subscribes to #notify
list(): Observable<User[]> {
  return concat(from(this.#getUsers()), this.#notify.pipe(mergeMap(() => this.#getUsers())));
}

// Command: triggers #notify
create(data): ResultAsync<void, Error> {
  return this.#insert(data).andThen(() => { this.#notify.next(Date.now()); return okAsync(void 0); });
}
```

## Resources

| Topic | File |
|-------|------|
| Service interface design | [SERVICE-INTERFACE.md](SERVICE-INTERFACE.md) |
| Observable patterns | [OBSERVABLE-PATTERN.md](OBSERVABLE-PATTERN.md) |
| Result types | [RESULT-TYPES.md](RESULT-TYPES.md) |
| Main process subscription | [MAIN-PROCESS-SUBSCRIPTION.md](MAIN-PROCESS-SUBSCRIPTION.md) |
