# Factory Pattern for Hono Electron IPC

This document explains the factory pattern used for dependency injection in Hono Electron IPC architecture.

## Why Factory Pattern?

1. **Type Isolation**: Main process dependencies don't leak to renderer
2. **Testability**: Services can be mocked for testing
3. **Single Source of Truth**: Route types derived from factory return type
4. **Flexibility**: Different service implementations for dev/prod/test

## Complete Implementation

### Step 1: Define Service Interfaces

```typescript
// src/shared/services/user.service.ts
import type { Observable } from 'rxjs';
import type { ResultAsync } from 'neverthrow';

export interface UserService {
  // Queries return Observable (reactive)
  list(): Observable<User[]>;
  get(id: string): Observable<User | undefined>;

  // Commands return ResultAsync (one-shot)
  create(data: CreateUserData): ResultAsync<void, ApplicationError>;
  update(id: string, data: UpdateUserData): ResultAsync<void, ApplicationError>;
  delete(id: string): ResultAsync<void, ApplicationError>;
}

// src/shared/services/auth.service.ts
export interface AuthService {
  value(): Observable<string | undefined>;
  signIn(token: string): ResultAsync<void, ApplicationError>;
  signOut(): ResultAsync<void, ApplicationError>;
}
```

### Step 2: Create Factory with HonoEnv

```typescript
// src/shared/callable/index.ts
import { Logger as DefaultLogger } from '@open-draft/logger';
import { createFactory } from 'hono/factory';
import { logger } from 'hono/logger';

// Import all route modules
import * as auth from './auth';
import * as users from './users';
import * as events from './events';

// Import service interfaces (types only!)
import type {
  AuthService,
  UserService,
  EventService,
} from '@shared/services';

// Aggregate all services
type Services = {
  auth: AuthService;
  users: UserService;
  events: EventService;
};

// Optional logger interface
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// External dependencies passed to factory
type ExternalDependencies = {
  logger?: Logger;
  services: Services;
};

// Hono context variables
type Variables = {
  logger: Logger;
  services: Services;
};

// Export for use in routes
export type HonoEnv = {
  Variables: Variables;
};

// Default logger fallback
const internalLogger = new DefaultLogger('callable');
const defaultLogger: Logger = {
  debug: internalLogger.debug.bind(internalLogger),
  warn: internalLogger.warning.bind(internalLogger),
  info: internalLogger.info.bind(internalLogger),
  error: internalLogger.error.bind(internalLogger),
};

// Factory function - creates Hono app with DI
const factory = (deps: ExternalDependencies) =>
  createFactory<HonoEnv>({
    initApp(app) {
      // Add request logging
      app.use(logger((deps.logger ?? defaultLogger).debug));

      // Inject services and logger into context
      app.use((c, next) => {
        c.set('services', deps.services);
        c.set('logger', deps.logger ?? defaultLogger);
        return next();
      });
    },
  });

// Create the final app with all routes
export const createApp = (...args: Parameters<typeof factory>) => {
  return factory(...args)
    .createApp()
    .route('/auth', auth.routes)
    .route('/users', users.routes)
    .route('/events', events.routes);
};
```

### Step 3: Export Type for Client

```typescript
// src/shared/callable/types.d.ts
import type { createApp } from '.';

// This type captures the full route structure
export type CallableType = ReturnType<typeof createApp>;
```

### Step 4: Inject Real Services (Main Process)

```typescript
// src/main/callable/index.ts
import { createApp } from '@shared/callable';
import { logger } from '@adapters/logger';
import {
  authService,
  userService,
  eventService,
} from '@services';

// Create app with real service implementations
export const callable = createApp({
  logger,
  services: {
    auth: authService,
    users: userService,
    events: eventService,
  },
});
```

### Step 5: Set Up IPC Handler

```typescript
// src/main/index.ts
import { ipcMain } from 'electron';
import { callable } from '@callable';

// Single IPC handler for all routes
ipcMain.handle(
  'hono-rpc-electron',
  async (
    _,
    url: string,
    method?: string,
    headers?: [key: string, value: string][],
    body?: string | ArrayBuffer
  ) => {
    const res = await callable.request(url, { method, headers, body });
    const data = await res.json();

    // Optionally log errors
    if (res.status >= 400) {
      logger.error(`IPC Error: ${res.status} ${url}`);
    }

    return { ...res, data };
  }
);
```

### Step 6: Create Type-Safe Client (Renderer)

```typescript
// src/renderer/src/adapters/client.ts
import { hc } from 'hono/client';
import type { CallableType } from '@shared/callable/types';

const serializeHeader = (headers: HeadersInit): [key: string, value: string][] => {
  const entries: [key: string, value: string][] = [];
  if (Array.isArray(headers)) return headers;
  if (!(headers instanceof Headers)) {
    for (const [key, value] of Object.entries(headers)) {
      entries.push([key, value]);
    }
    return entries;
  }
  return Array.from(headers.entries());
};

export const client = hc<CallableType>('http://internal.localhost', {
  async fetch(input, init) {
    const url = input.toString();
    const args = [
      url,
      init?.method,
      serializeHeader(init?.headers ?? {}),
      init?.body
    ];

    const { data, ...rest } = await window.electron.ipcRenderer.invoke(
      'hono-rpc-electron',
      ...args
    );

    return Response.json(data, rest);
  },
});
```

## Testing with Mock Services

```typescript
// __tests__/routes/users.test.ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@shared/callable/users';
import type { HonoEnv } from '@shared/callable';

describe('Users Route', () => {
  let app: Hono<HonoEnv>;
  let mockUserService: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create fresh mocks
    mockUserService = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
    };

    // Create app with mock services
    app = new Hono<HonoEnv>();
    app.use((c, next) => {
      c.set('services', {
        users: mockUserService,
      } as any);
      return next();
    });
    app.route('/users', routes);
  });

  it('should list users', async () => {
    mockUserService.list.mockReturnValue(
      of([{ id: '1', name: 'Test User' }])
    );

    const req = new Request('http://localhost/users');
    const res = await app.request(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(mockUserService.list).toHaveBeenCalled();
  });

  it('should get user by id', async () => {
    mockUserService.get.mockReturnValue(
      of({ id: '1', name: 'Test User' })
    );

    const req = new Request('http://localhost/users/1');
    const res = await app.request(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe('1');
    expect(mockUserService.get).toHaveBeenCalledWith('1');
  });
});
```

## Adding a New Service

1. **Define interface** in `src/shared/services/`:
   ```typescript
   export interface NewService {
     // ...
   }
   ```

2. **Add to Services type** in `src/shared/callable/index.ts`:
   ```typescript
   type Services = {
     // ...existing
     newService: NewService;
   };
   ```

3. **Inject in main process** in `src/main/callable/index.ts`:
   ```typescript
   export const callable = createApp({
     services: {
       // ...existing
       newService: newServiceImpl,
     },
   });
   ```

4. **Access in routes**:
   ```typescript
   .get('/new', (c) => {
     return c.var.services.newService.method();
   })
   ```

## Type Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  src/shared/callable/index.ts                               │
│                                                             │
│  createApp(deps) → factory(deps).createApp().route(...)    │
│                           │                                 │
│                           ▼                                 │
│  Returns: Hono<HonoEnv> with full route chain              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  src/shared/callable/types.d.ts                             │
│                                                             │
│  export type CallableType = ReturnType<typeof createApp>   │
│  // Captures: method, path, params, body, response types   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  src/renderer/src/adapters/client.ts                        │
│                                                             │
│  export const client = hc<CallableType>(...)               │
│  // Full type inference for all routes!                    │
└─────────────────────────────────────────────────────────────┘
```
