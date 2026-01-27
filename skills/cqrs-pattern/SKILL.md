---
name: cqrs-pattern
description: Implement CQRS pattern for Electron services. Use when creating service methods with Observable queries and ResultAsync commands.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# CQRS Pattern

## Core Principle

| Aspect | Query (Read) | Command (Write) |
|--------|--------------|-----------------|
| Return Type | `Observable<T>` | `ResultAsync<void, Error>` |
| Side Effects | None | Database writes, notifications |

## Resources

| Topic | File |
|-------|------|
| Service interface design | [SERVICE-INTERFACE.md](SERVICE-INTERFACE.md) |
| Observable patterns | [OBSERVABLE-PATTERN.md](OBSERVABLE-PATTERN.md) |
| Result types | [RESULT-TYPES.md](RESULT-TYPES.md) |
| Main process subscription | [MAIN-PROCESS-SUBSCRIPTION.md](MAIN-PROCESS-SUBSCRIPTION.md) |

## Quick Reference

```typescript
interface UserService {
  // Queries → Observable
  list(): Observable<User[]>;
  get(id: string): Observable<User | undefined>;
  // Commands → ResultAsync
  create(data: CreateUserData): ResultAsync<void, ApplicationError>;
}
```

Use `BehaviorSubject` to bridge: commands trigger `#notify.next()`, queries subscribe to it.
