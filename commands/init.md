---
description: Set up Hono-based type-safe IPC architecture for Electron
argument-hint: [--src-dir=src]
allowed-tools: Read, Write, Glob, Grep, Bash(npm:*), Bash(pnpm:*)
---

# Initialize Hono Electron IPC Architecture

Set up type-safe IPC communication using Hono RPC for this Electron application.

## Arguments

- `$1` (optional): Source directory path (default: `src`)

## Prerequisites Check

Before setting up, verify:
1. This is an Electron project (check for `electron` in package.json)
2. TypeScript is configured
3. Determine package manager (pnpm, npm, or yarn)

## Installation Steps

### 1. Install Dependencies

Install required packages:
```bash
# Using detected package manager
pnpm add hono @hono/zod-validator zod
# or
npm install hono @hono/zod-validator zod
```

### 2. Create Directory Structure

Create the following directories:
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
            └── client.ts     # Custom hc client
```

### 3. Create Factory File

Create `src/shared/callable/index.ts`:

```typescript
import { createFactory } from 'hono/factory';
import { logger } from 'hono/logger';

// Define your services here
// These will be injected from the main process
type Services = {
  // Add your service interfaces here
  // example: userService: UserService;
};

type Variables = {
  services: Services;
};

export type HonoEnv = {
  Variables: Variables;
};

type ExternalDependencies = {
  services: Services;
};

const factory = (variables: ExternalDependencies) =>
  createFactory<HonoEnv>({
    initApp(app) {
      // Optional: Add request logging
      app.use(logger());

      // Inject services into Hono context
      app.use((c, next) => {
        c.set('services', variables.services);
        return next();
      });
    },
  });

export const createApp = (...args: Parameters<typeof factory>) => {
  return factory(...args).createApp();
  // Routes will be registered here using .route()
  // Example:
  // .route('/users', users.routes)
  // .route('/auth', auth.routes)
};
```

### 4. Create Type Export

Create `src/shared/callable/types.d.ts`:

```typescript
import type { createApp } from '.';

// This type enables full type inference in the renderer process
// Usage: hc<CallableType>('http://internal.localhost', { fetch: customFetch })
export type CallableType = ReturnType<typeof createApp>;
```

### 5. Create Main Process Callable

Create `src/main/callable/index.ts`:

```typescript
import { createApp } from '@shared/callable';
// Import your services here
// import { userService, authService } from '@services';

// Create the Hono app with injected services
export const callable = createApp({
  services: {
    // Inject your services here
    // userService,
    // authService,
  },
});
```

### 6. Create Renderer Client

Create `src/renderer/src/adapters/client.ts`:

```typescript
import { hc } from 'hono/client';

import type { CallableType } from '@shared/callable/types';

/**
 * Serialize headers to array format for IPC transfer
 * Headers cannot be directly serialized through Electron IPC
 */
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

/**
 * Type-safe Hono RPC client for Electron IPC
 *
 * Usage:
 * ```typescript
 * // GET request
 * const res = await client.users[':id'].$get({ param: { id: 'usr_123' } });
 * const user = await res.json();
 *
 * // POST request with body
 * const res = await client.auth.sign_in.$post({ json: { token: 'xxx' } });
 * ```
 */
export const client = hc<CallableType>('http://internal.localhost', {
  async fetch(input, init) {
    const url = input.toString();
    const args = [url, init?.method, serializeHeader(init?.headers ?? {}), init?.body];

    // Use Electron IPC instead of HTTP fetch
    const { data, ...rest } = await window.electron.ipcRenderer.invoke('hono-rpc-electron', ...args);

    // Reconstruct Response object for Hono client compatibility
    return Response.json(data, rest);
  },
});
```

### 7. Add IPC Handler to Main Process

Add the following to your main process entry point (e.g., `src/main/index.ts`):

```typescript
import { ipcMain } from 'electron';
import { callable } from './callable';

// Single IPC handler for all Hono routes
ipcMain.handle(
  'hono-rpc-electron',
  async (_, url: string, method?: string, headers?: [key: string, value: string][], body?: string | ArrayBuffer) => {
    // Route request through Hono
    const res = await callable.request(url, { method, headers, body });
    const data = await res.json();

    // Return response with status info
    return { ...res, data };
  }
);
```

### 8. Configure Path Aliases (if needed)

If not already configured, add path aliases to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

## Verification

After setup, verify the installation:
1. Check that all files are created
2. Ensure no TypeScript errors
3. Build the project to verify paths resolve correctly

## Next Steps

1. Use `/hono-electron-ipc:add-route [name]` to add new routes
2. See `hono-ipc-setup` skill for detailed patterns
3. Check `hono-ipc-patterns` skill for CQRS and validation patterns

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      RENDERER PROCESS                        │
│                                                              │
│  client.users.$get()  →  hc<CallableType> custom fetch()    │
│         ▲                         │                          │
│         │                         ▼                          │
│         │              ipcRenderer.invoke('hono-rpc-electron')
└─────────┼─────────────────────────┼──────────────────────────┘
          │                         │
          │ Response.json()         │
          │                         ▼
┌─────────┴─────────────────────────────────────────────────────┐
│                       MAIN PROCESS                             │
│                                                                │
│  ipcMain.handle('hono-rpc-electron')                           │
│         │                                                      │
│         ▼                                                      │
│  callable.request(url, { method, headers, body })              │
│         │                                                      │
│         ▼                                                      │
│  Hono Router → Route Handler → c.var.services.xxx              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```
