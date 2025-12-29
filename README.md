# hono-electron-ipc

A Claude Code plugin for implementing type-safe IPC communication in Electron applications using Hono RPC, CQRS architecture, and reactive state management.

## Features

- **Type-Safe IPC**: Full TypeScript inference across main and renderer processes
- **Factory Pattern with DI**: Dependency injection for testable services
- **Zod Validation**: Request validation with Zod schemas
- **CQRS Architecture**: Observable queries and ResultAsync commands
- **Reactive State**: Jotai hybrid atoms with IPC subscriptions
- **Migration Support**: Migrate existing ipcRenderer/ipcMain to Hono

## Installation

### From Marketplace

```bash
/plugin marketplace add napochaan/hono-electron-ipc
/plugin install hono-electron-ipc
```

### Local Development

```bash
claude --plugin-dir ./hono-electron-ipc
```

## Quick Start

### 1. Initialize Hono IPC

```bash
/hono-electron-ipc:init
```

This scaffolds the complete directory structure:

```
src/
├── shared/
│   └── callable/
│       ├── index.ts          # Factory and app creation
│       └── types.d.ts        # Type export for client
├── main/
│   └── callable/
│       └── index.ts          # Service injection
└── renderer/
    └── src/
        └── adapters/
            └── client.ts     # Type-safe hc client
```

### 2. Add Routes (Basic)

```bash
/hono-electron-ipc:add-route users
```

Creates a new route with Zod validation:

```typescript
// src/shared/callable/users/index.ts
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

const app = new Hono<HonoEnv>();

export const routes = app
  .get('/', (c) => c.json({ users: [] }))
  .get('/:id', (c) => c.json({ id: c.req.param('id') }));
```

### 3. Use in Renderer

```typescript
import { client } from '@adapters/client';

// Full autocomplete and type checking!
const res = await client.users[':id'].$get({ param: { id: 'usr_123' } });
const user = await res.json();
```

## Advanced Patterns

### CQRS Service with Observable Queries

```bash
/hono-electron-ipc:new-service users
```

Creates a CQRS service:

```typescript
export class UserServiceImpl implements UserService {
  #notify = new BehaviorSubject(Date.now());

  // Query: Observable for reactive data streams
  list(): Observable<User[]> {
    return concat(
      from(this.#getUsers()),
      this.#notify.pipe(mergeMap(() => this.#getUsers()))
    );
  }

  // Command: ResultAsync for type-safe operations
  create(data: CreateUserData): ResultAsync<void, Error> {
    return this.#insertUser(data)
      .andThen(() => {
        this.#notify.next(Date.now());
        return okAsync(void 0);
      });
  }
}
```

### Reactive Jotai Atoms with IPC Subscriptions

```bash
/hono-electron-ipc:new-hybrid-atom users
```

Creates a hybrid atom (stream + HTTP fallback):

```typescript
// Stream atom (IPC subscription)
const streamUsersAtom = atom<{ value: User[] }>();
streamUsersAtom.onMount = (set) => {
  const handler = debounce(async () => {
    const data = await client.users.$get().then(r => r.json());
    set({ value: data });
  }, 300);
  handler();
  return usersSource.subscribe(handler);
};

// Hybrid selector
export const usersAtom = atom(async (get) => {
  const stream = get(streamUsersAtom);
  if (stream === undefined) return get(singleFetchAtom);
  return stream.value;
});
```

### Type-Safe Route with CQRS Integration

```bash
/hono-electron-ipc:new-route users
```

Creates a route with CQRS service integration:

```typescript
const route = new Hono()
  .get('/', async (c) => {
    const users = await firstValueFromResult(
      c.var.services.users.list()
    );
    return users.match(
      (data) => c.json(data, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  });

// Client: Full type inference
const users = await client.users.$get().then(r => r.json());
```

## Migrating Existing IPC

```bash
/hono-electron-ipc:migrate
```

This orchestrates a full migration from traditional IPC to Hono:

1. **Analyze** - Finds all `ipcMain.handle` and `ipcRenderer.invoke` calls
2. **Plan** - Designs RESTful route structure
3. **Execute** - Creates route files and updates registrations

## Commands

### Basic Commands

| Command | Description |
|---------|-------------|
| `/hono-electron-ipc:init` | Initialize Hono IPC architecture |
| `/hono-electron-ipc:add-route [name]` | Add a basic route with validation |
| `/hono-electron-ipc:migrate` | Migrate existing IPC to Hono |

### Advanced Commands (CQRS + Reactive)

| Command | Description |
|---------|-------------|
| `/hono-electron-ipc:new-service [name]` | Create CQRS service with Observable/ResultAsync |
| `/hono-electron-ipc:new-route [name]` | Create route with CQRS integration |
| `/hono-electron-ipc:new-hybrid-atom [name]` | Create Jotai hybrid atom with IPC subscription |

## Skills

### Core Skills

#### hono-ipc-setup

Auto-triggers when discussing IPC setup, Hono for Electron, or type-safe IPC.

Provides:
- Complete setup instructions
- Factory pattern with DI
- Custom client implementation
- Example routes

#### hono-ipc-patterns

Auto-triggers when discussing CQRS patterns, IPC error handling, or Zod validation.

Provides:
- CQRS (Query/Command separation)
- Zod validation patterns
- Error handling with Result types
- Reactive data with RxJS

### Advanced Skills

#### cqrs-pattern

Implement CQRS (Command Query Responsibility Segregation) pattern:

- **Queries**: Return `Observable<T>` for reactive data streams
- **Commands**: Return `ResultAsync<void, Error>` for type-safe operations
- **BehaviorSubject**: Bridge between queries and commands

Files:
- `skills/cqrs-pattern/SKILL.md` - Overview
- `skills/cqrs-pattern/OBSERVABLE-PATTERN.md` - Query implementation
- `skills/cqrs-pattern/RESULT-TYPES.md` - Command implementation

#### jotai-reactive-atoms

Implement reactive Jotai atoms for Electron:

- **Hybrid Atom Pattern**: Stream + HTTP fallback
- **Event Subscription**: Optimized IPC listener sharing
- **Debouncing**: Prevent UI thrashing from rapid updates

Files:
- `skills/jotai-reactive-atoms/SKILL.md` - Overview
- `skills/jotai-reactive-atoms/HYBRID-ATOM.md` - Stream + fallback pattern
- `skills/jotai-reactive-atoms/EVENT-SUBSCRIPTION.md` - IPC optimization

#### hono-ipc-routes

Implement type-safe IPC routes with CQRS:

- **Route Handlers**: HTTP-like semantics over IPC with CQRS services
- **Type Safety**: Full TypeScript inference from routes to client
- **Zod Validation**: Schema-based request validation

Files:
- `skills/hono-ipc-routes/SKILL.md` - Overview
- `skills/hono-ipc-routes/ROUTE-HANDLERS.md` - Route implementation
- `skills/hono-ipc-routes/TYPE-SAFETY.md` - Type system patterns

## Agents

### ipc-analyzer

Analyzes existing IPC usage in codebase:
- Finds all `ipcMain.handle()` calls
- Maps request/response structures
- Identifies service dependencies

### route-planner

Designs Hono route structure:
- Groups handlers into routes
- Creates RESTful URL patterns
- Plans service interfaces

### migration-executor

Executes route migrations:
- Creates route files
- Migrates handler logic
- Updates registrations

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MAIN PROCESS                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Services (CQRS)                    IPC Layer (Hono)                │
│   ┌─────────────────┐                ┌─────────────────┐             │
│   │ Query:          │                │ HTTP-style RPC  │             │
│   │ Observable<T>   │ ◄──────────────│ /users, /events │             │
│   │                 │                │                 │             │
│   │ Command:        │                │ Push Events     │             │
│   │ ResultAsync     │ ──────────────►│ webContents.send│             │
│   └─────────────────┘                └─────────────────┘             │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                      RENDERER PROCESS                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Hono Client            Event Subscription         Jotai Atoms     │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│   │ client.users    │    │ Optimized IPC   │    │ Hybrid Pattern  │ │
│   │ .$get()         │    │ Subscriptions   │───►│ Stream + HTTP   │ │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                       │
│   React Components with Suspense                                     │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Renderer → Main**: `client.users.$get()` → Hono Router → CQRS Service
2. **Main → Renderer (Push)**: Service emits Observable → `webContents.send()` → Jotai atom updates
3. **Reactive Updates**: Database changes trigger BehaviorSubject → all subscribers notified

## Type Safety

The key to type safety is the `CallableType`:

```typescript
// src/shared/callable/types.d.ts
export type CallableType = ReturnType<typeof createApp>;

// src/renderer/src/adapters/client.ts
export const client = hc<CallableType>('http://internal.localhost', { ... });

// Now client has full autocomplete:
// client.users.$get()
// client.users[':id'].$get({ param: { id: 'xxx' } })
// client.auth.sign_in.$post({ json: { token: 'xxx' } })
```

## TDD Workflow

1. **Red**: Write failing test first
2. **Green**: Implement minimal code
3. **Refactor**: Improve while keeping tests green

```typescript
describe('UserService', () => {
  let db: ReturnType<typeof init>;

  beforeEach(() => {
    db = init();           // In-memory SQLite
    runMigrate(db);        // Apply migrations
  });

  it('should list users reactively', async () => {
    const service = new UserServiceImpl(db);
    const values: User[][] = [];

    service.list().subscribe(users => values.push(users));

    await service.create({ name: 'Alice' });

    expect(values).toHaveLength(2); // Initial + after create
  });
});
```

## Requirements

- Node.js >= 18
- Electron
- TypeScript
- Dependencies:
  - Core: `hono`, `@hono/zod-validator`, `zod`
  - CQRS: `rxjs`, `neverthrow`
  - State: `jotai`
  - Database: `drizzle-orm`
  - Testing: `vitest`

## License

MIT

## Author

napochaan

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
