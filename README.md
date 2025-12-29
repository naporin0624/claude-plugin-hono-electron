# hono-electron-ipc

A Claude Code plugin for implementing type-safe IPC communication in Electron applications using Hono RPC.

## Features

- **Type-Safe IPC**: Full TypeScript inference across main and renderer processes
- **Factory Pattern with DI**: Dependency injection for testable services
- **Zod Validation**: Request validation with Zod schemas
- **Migration Support**: Migrate existing ipcRenderer/ipcMain to Hono
- **RESTful Routes**: HTTP-like API design for IPC

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

### 2. Add Routes

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

## Migrating Existing IPC

```bash
/hono-electron-ipc:migrate
```

This orchestrates a full migration from traditional IPC to Hono:

1. **Analyze** - Finds all `ipcMain.handle` and `ipcRenderer.invoke` calls
2. **Plan** - Designs RESTful route structure
3. **Execute** - Creates route files and updates registrations

## Commands

| Command | Description |
|---------|-------------|
| `/hono-electron-ipc:init` | Initialize Hono IPC architecture |
| `/hono-electron-ipc:add-route [name]` | Add a new route with validation |
| `/hono-electron-ipc:migrate` | Migrate existing IPC to Hono |

## Skills

### hono-ipc-setup

Auto-triggers when discussing IPC setup, Hono for Electron, or type-safe IPC.

Provides:
- Complete setup instructions
- Factory pattern with DI
- Custom client implementation
- Example routes

### hono-ipc-patterns

Auto-triggers when discussing CQRS patterns, IPC error handling, or Zod validation.

Provides:
- CQRS (Query/Command separation)
- Zod validation patterns
- Error handling with Result types
- Reactive data with RxJS

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
┌─────────────────────────────────────────────────────────────┐
│                      RENDERER PROCESS                        │
│                                                              │
│  client.users.$get()  →  hc<CallableType> custom fetch()    │
│         │                                                    │
│         └─→  ipcRenderer.invoke('hono-rpc-electron', ...)   │
└──────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────────────────────────────────────────┐
│                       MAIN PROCESS                            │
│                                                               │
│  ipcMain.handle('hono-rpc-electron')                          │
│         │                                                     │
│         └─→  callable.request(url, { method, body, ... })    │
│                    │                                          │
│                    └─→  Hono Router → Route Handler           │
│                              │                                │
│                              └─→  c.var.services.xxx.method() │
└───────────────────────────────────────────────────────────────┘
```

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

## Requirements

- Node.js >= 18
- Electron
- TypeScript
- Dependencies: `hono`, `@hono/zod-validator`, `zod`

## License

MIT

## Author

napochaan

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
