# shared/ Directory and DI Pattern

This document explains why the `shared/` directory architecture is essential for Hono Electron IPC and how it prevents dependency leakage between processes.

## The Problem: Dependency Contamination

When implementing IPC handlers directly in the main process, a critical build issue occurs:

```typescript
// BAD: src/main/callable/index.ts
import { Hono } from 'hono';
import { db } from '@main/database';  // SQLite, better-sqlite3, etc.
import { fs } from 'fs-extra';         // Node.js file system

const app = new Hono()
  .get('/users', (c) => {
    const users = db.prepare('SELECT * FROM users').all();
    return c.json(users);
  });

export type AppType = typeof app;  // Type includes db, fs dependencies!
```

When the renderer imports `AppType`:

```typescript
// src/renderer/src/adapters/client.ts
import type { AppType } from '@main/callable';  // Build error!
// Even importing just the TYPE causes bundler to analyze the file,
// pulling in Node.js dependencies into the renderer bundle
```

**Result:**
- Vite/webpack analyzes `@main/callable/index.ts`
- Discovers `better-sqlite3`, `fs-extra`, etc.
- Attempts to bundle Node.js modules for browser
- Build fails with "Module not found: fs" or similar errors

## The Solution: shared/ Directory

The `shared/` directory contains **only type-safe route definitions** with no implementation:

```
src/
├── shared/
│   └── callable/
│       ├── index.ts      # Route definitions + factory (NO implementations)
│       ├── types.d.ts    # Type export for client
│       └── users/
│           └── index.ts  # Route handlers use c.var.services
├── main/
│   └── callable/
│       └── index.ts      # Injects REAL services
└── renderer/
    └── src/
        └── adapters/
            └── client.ts # Type-safe client (types only from shared/)
```

### Key Principle

**shared/** contains:
- Route definitions (URL patterns, HTTP methods)
- Zod validation schemas
- Service interface types
- Factory function that accepts dependencies

**shared/** does NOT contain:
- Database connections
- File system access
- Electron APIs
- Any Node.js-specific code

## DI Implementation Pattern

### Step 1: Define Service Interfaces in shared/

```typescript
// src/shared/services/user.service.ts
import type { Observable } from 'rxjs';
import type { ResultAsync } from 'neverthrow';

// Interface only - no implementation!
export interface UserService {
  list(): Observable<User[]>;
  get(id: string): Observable<User | undefined>;
  create(data: CreateUserData): ResultAsync<void, ApplicationError>;
  update(id: string, data: UpdateUserData): ResultAsync<void, ApplicationError>;
  delete(id: string): ResultAsync<void, ApplicationError>;
}
```

### Step 2: Create Factory with Dependency Injection

```typescript
// src/shared/callable/index.ts
import { createFactory } from 'hono/factory';
import type { UserService } from '@shared/services';

// Service types aggregated
type Services = {
  users: UserService;
  auth: AuthService;
};

// External dependencies interface
type ExternalDependencies = {
  services: Services;
  logger?: Logger;
};

// Context variables available in routes
type Variables = {
  services: Services;
  logger: Logger;
};

export type HonoEnv = {
  Variables: Variables;
};

// Factory accepts dependencies, returns configured app
const factory = (deps: ExternalDependencies) =>
  createFactory<HonoEnv>({
    initApp(app) {
      // Middleware: inject services into context
      app.use((c, next) => {
        c.set('services', deps.services);
        c.set('logger', deps.logger ?? defaultLogger);
        return next();
      });
    },
  });

// Create app with all routes
export const createApp = (...args: Parameters<typeof factory>) => {
  return factory(...args)
    .createApp()
    .route('/users', users.routes)
    .route('/auth', auth.routes);
};
```

### Step 3: Route Handlers Use Injected Services

```typescript
// src/shared/callable/users/index.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { HonoEnv } from '..';

const CreateUserBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const routes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    // Access service through context - no direct import!
    const result = await firstValueFrom(c.var.services.users.list());
    return c.json(result);
  })
  .post('/', zValidator('json', CreateUserBody), async (c) => {
    const body = c.req.valid('json');
    const result = await c.var.services.users.create(body);
    return result.match(
      () => c.json({ success: true }, 201),
      (error) => c.json({ error: error.message }, 500)
    );
  });
```

### Step 4: Inject Real Services in Main Process

```typescript
// src/main/callable/index.ts
import { createApp } from '@shared/callable';
import { userService } from '@main/services/user.service';  // Real implementation
import { authService } from '@main/services/auth.service';

// Only main process imports actual implementations
export const callable = createApp({
  services: {
    users: userService,  // Has db, fs, electron access
    auth: authService,
  },
});
```

## Type Export via .d.ts Files

The `.d.ts` file safely exports types without triggering bundler analysis:

```typescript
// src/shared/callable/types.d.ts
import type { createApp } from '.';

// ReturnType captures the full route structure
export type CallableType = ReturnType<typeof createApp>;
```

### Why .d.ts Works

1. **Declaration files are type-only**: Bundlers skip `.d.ts` files during code analysis
2. **No runtime code**: Contains only type declarations
3. **Safe import**: Renderer can import without pulling dependencies

```typescript
// src/renderer/src/adapters/client.ts
import { hc } from 'hono/client';
import type { CallableType } from '@shared/callable/types';  // Safe!

export const client = hc<CallableType>('http://internal.localhost', {
  // Custom fetch using IPC
});
```

## Bundle Isolation Benefits

| Aspect | Without shared/ | With shared/ |
|--------|-----------------|--------------|
| Renderer bundle | Contains Node.js deps | Browser-safe only |
| Build success | Fails on Node modules | Always succeeds |
| Type safety | Manual or none | Full inference |
| Testability | Hard to mock | Easy mocking |
| Code coupling | High (direct imports) | Low (interfaces) |

## Visual Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       SHARED/ DIRECTORY                         │
│                   (Browser-compatible only)                     │
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │  Services   │   │   Routes    │   │  types.d.ts │           │
│  │ (interfaces)│   │(definitions)│   │(type export)│           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
│         ▲                 │                 │                   │
│         │                 │                 │                   │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          │                 ▼                 ▼
┌─────────┴───────────────────────┐   ┌─────────────────────────┐
│         MAIN PROCESS            │   │    RENDERER PROCESS     │
│                                 │   │                         │
│  ┌─────────────────────────┐    │   │  ┌───────────────────┐  │
│  │  Service Implementations │    │   │  │  hc<CallableType> │  │
│  │  - Database access       │    │   │  │  (type-safe)      │  │
│  │  - File system           │    │   │  └───────────────────┘  │
│  │  - Electron APIs         │    │   │          │              │
│  └─────────────────────────┘    │   │          ▼              │
│            │                    │   │  ┌───────────────────┐  │
│            ▼                    │   │  │ ipcRenderer.invoke │  │
│  ┌─────────────────────────┐    │   │  └───────────────────┘  │
│  │    createApp(deps)       │    │   │                         │
│  │    (injected services)   │    │   │  No Node.js deps here! │
│  └─────────────────────────┘    │   │                         │
└─────────────────────────────────┘   └─────────────────────────┘
```

## Summary

The `shared/` directory pattern ensures:

1. **Bundle isolation**: Node.js dependencies never leak into renderer
2. **Type safety**: Full TypeScript inference across process boundaries
3. **Testability**: Services are easily mockable via DI
4. **Maintainability**: Clear separation between interface and implementation
5. **Build reliability**: No bundler errors from incompatible modules

See [FACTORY-PATTERN.md](FACTORY-PATTERN.md) for complete implementation examples.
