# Service Interface Type Definition Pattern

This document explains the pattern of defining service interfaces using `.d.ts` files in the shared module.

## Why Use `.d.ts` Files?

### The Problem with `.ts` Files

When you define service interfaces in `.ts` files:

```typescript
// src/shared/services/user.service.ts
import type { Observable } from 'rxjs';

export interface UserService {
  list(): Observable<User[]>;
}
```

Even with `import type`, bundlers may still analyze the file during build. If any runtime code exists in the same file or its dependencies, it can cause issues.

### The Solution: Declaration Files

Using `.d.ts` files guarantees **type-only exports**:

```typescript
// src/shared/services/user.service.d.ts
import type { Observable } from 'rxjs';
import type { ResultAsync } from 'neverthrow';
import type { ApplicationError } from '@shared/typing';

export interface UserService {
  // Queries
  list(): Observable<User[]>;
  get(id: string): Observable<User | undefined>;

  // Commands
  create(data: CreateUserData): ResultAsync<void, ApplicationError>;
  delete(id: string): ResultAsync<void, ApplicationError>;
}
```

**Benefits:**

| Aspect | `.ts` File | `.d.ts` File |
|--------|------------|--------------|
| Bundler analysis | May include | Always skipped |
| Runtime code risk | Possible | Impossible |
| Type-only guarantee | Convention | Enforced |
| IDE support | Full | Full |

## CQRS Return Type Convention

Service interfaces follow CQRS principles with specific return types:

| Operation Type | Return Type | Use Case |
|----------------|-------------|----------|
| **Query** | `Observable<T>` | Read operations with reactive updates |
| **Command** | `ResultAsync<void, Error>` | Write operations with explicit error handling |

### Why This Separation?

1. **Queries return `Observable<T>`**
   - Enables reactive data streams
   - Automatic re-emission when data changes
   - Works with RxJS operators for transformation

2. **Commands return `ResultAsync<void, Error>`**
   - Explicit success/failure handling
   - No reactive subscription needed
   - One-shot operations with clear outcomes

## File Structure

```
src/
├── shared/
│   └── services/
│       ├── index.d.ts          # Re-export all service types
│       ├── user.service.d.ts   # UserService interface
│       └── auth.service.d.ts   # AuthService interface
└── main/
    └── services/
        ├── user.service.ts     # UserServiceImpl
        └── auth.service.ts     # AuthServiceImpl
```

## Complete Example

```typescript
// src/shared/services/user.service.d.ts
import type { Observable } from 'rxjs';
import type { ResultAsync } from 'neverthrow';
import type { ApplicationError } from '@shared/typing';

// Entity types
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateUserData {
  name: string;
  email: string;
}

// Service interface with CQRS separation
export interface UserService {
  // ═══════════════════════════════════════════════════════════════
  // QUERIES - Observable<T>
  // ═══════════════════════════════════════════════════════════════
  list(): Observable<User[]>;
  get(id: string): Observable<User | undefined>;

  // ═══════════════════════════════════════════════════════════════
  // COMMANDS - ResultAsync<void, ApplicationError>
  // ═══════════════════════════════════════════════════════════════
  create(data: CreateUserData): ResultAsync<void, ApplicationError>;
  update(id: string, data: Partial<CreateUserData>): ResultAsync<void, ApplicationError>;
  delete(id: string): ResultAsync<void, ApplicationError>;
}
```

## Import Pattern

Always use `import type` when importing from `.d.ts` files:

```typescript
// src/main/services/user.service.ts
import type { UserService, User, CreateUserData } from '@shared/services/user.service';

export class UserServiceImpl implements UserService {
  // Implementation with database access, file system, etc.
}
```

## Related Documents

- [SKILL.md](SKILL.md) - CQRS pattern overview with implementation examples
- [../hono-ipc-setup/SHARED-DIRECTORY.md](../hono-ipc-setup/SHARED-DIRECTORY.md) - Why shared/ architecture prevents dependency leakage
- [../hono-ipc-setup/FACTORY-PATTERN.md](../hono-ipc-setup/FACTORY-PATTERN.md) - Dependency injection with service interfaces
