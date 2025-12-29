---
description: Migrate existing ipcRenderer calls to Hono-based IPC
argument-hint: [--generate-interfaces] [--dry-run]
allowed-tools: Read, Write, Edit, Glob, Grep, Task
---

# Migrate to Hono Electron IPC

Orchestrate migration from traditional `ipcMain.handle()` / `ipcRenderer.invoke()` to Hono-based IPC architecture.

## Arguments

- `--generate-interfaces`: Also generate TypeScript interfaces for services
- `--dry-run`: Analyze and plan without making changes

## Migration Workflow

This command orchestrates multiple subagents to perform a comprehensive migration:

```
┌──────────────────────────────────────────────────────────┐
│                    Migration Orchestrator                 │
│                      (this command)                       │
└──────────────────────────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ IPC Analyzer │   │   Service    │   │  Directory   │
│   Agent      │   │  Separator   │   │   Planner    │
└──────────────┘   └──────────────┘   └──────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                 ┌──────────────────┐
                 │  Route Planner   │
                 │      Agent       │
                 └──────────────────┘
                           │
    ┌──────────┬───────────┼───────────┬──────────┐
    ▼          ▼           ▼           ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Route 1 │ │Route 2 │ │Route 3 │ │Route 4 │ │Route N │
│Executor│ │Executor│ │Executor│ │Executor│ │Executor│
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
                    (Parallel Execution)
```

## Step 1: Analyze Existing IPC

Use the `ipc-analyzer` agent to find all existing IPC usage:

```
Task: subagent_type=hono-electron-ipc:ipc-analyzer
Prompt: Analyze all ipcMain.handle and ipcRenderer.invoke calls in this codebase.
        Return a structured report of all IPC channels, their parameters, and return types.
```

The analyzer will find:
- All `ipcMain.handle('channel-name', handler)` in main process
- All `ipcRenderer.invoke('channel-name', ...args)` in renderer
- Request/response data structures
- Service dependencies

## Step 2: Plan Route Structure

Use the `route-planner` agent to design the migration:

```
Task: subagent_type=hono-electron-ipc:route-planner
Prompt: Based on the IPC analysis, design a Hono route structure.
        Group related handlers into routes.
        Design RESTful URL patterns.
        Plan service interface requirements.
```

The planner will produce:
- Route groupings (e.g., all user-related handlers → `/users` route)
- RESTful mappings (e.g., `get-user` → `GET /users/:id`)
- Service interface definitions (if `--generate-interfaces`)

## Step 3: Execute Migration

Use the `migration-executor` agent for each route (in parallel):

```
Task: subagent_type=hono-electron-ipc:migration-executor (parallel)
Prompt: Implement the {route-name} route based on the migration plan.
        Create route file with Hono handlers.
        Migrate handler logic.
        Update imports and registrations.
```

Each executor will:
1. Create route file in `src/shared/callable/{route}/`
2. Migrate handler logic from `ipcMain.handle` to Hono route
3. Add Zod validation where applicable
4. Update `src/shared/callable/index.ts` to register route

## Step 4: Cleanup

After all routes are migrated:
1. Update main process entry to use single IPC handler
2. Remove old `ipcMain.handle` calls (mark as deprecated or delete)
3. Update renderer to use new client
4. Remove old `ipcRenderer.invoke` calls

## IPC Pattern Mapping

| Old Pattern | New Pattern |
|-------------|-------------|
| `ipcMain.handle('get-user', (_, id) => ...)` | `GET /users/:id` |
| `ipcMain.handle('create-user', (_, data) => ...)` | `POST /users` |
| `ipcMain.handle('update-user', (_, id, data) => ...)` | `PUT /users/:id` |
| `ipcMain.handle('delete-user', (_, id) => ...)` | `DELETE /users/:id` |
| `ipcMain.handle('list-users', () => ...)` | `GET /users` |
| `ipcMain.handle('search-users', (_, query) => ...)` | `GET /users?search=xxx` |

## Example Migration

### Before (Traditional IPC)

**Main Process:**
```typescript
ipcMain.handle('get-user', async (_, userId: string) => {
  const user = await userService.findById(userId);
  return user;
});

ipcMain.handle('create-user', async (_, data: CreateUserData) => {
  const user = await userService.create(data);
  return user;
});
```

**Renderer:**
```typescript
const user = await ipcRenderer.invoke('get-user', userId);
const newUser = await ipcRenderer.invoke('create-user', userData);
```

### After (Hono IPC)

**Route Definition (`src/shared/callable/users/index.ts`):**
```typescript
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { HonoEnv } from '@shared/callable';

const CreateUserBody = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const routes = new Hono<HonoEnv>()
  .get('/:id', (c) => {
    const id = c.req.param('id');
    return c.var.services.user.findById(id).then(user => c.json(user));
  })
  .post('/', zValidator('json', CreateUserBody), (c) => {
    const data = c.req.valid('json');
    return c.var.services.user.create(data).then(user => c.json(user, 201));
  });
```

**Renderer:**
```typescript
const res = await client.users[':id'].$get({ param: { id: userId } });
const user = await res.json();

const res2 = await client.users.$post({ json: userData });
const newUser = await res2.json();
```

## Dry Run Mode

With `--dry-run`, the command will:
1. Analyze existing IPC
2. Generate migration plan
3. Output proposed changes without writing files
4. Highlight potential issues

## Verification After Migration

1. **Type Check**: Run `tsc --noEmit` to verify no type errors
2. **Build**: Ensure project builds successfully
3. **Test**: Run existing tests (update IPC mocks if needed)
4. **Manual Test**: Verify IPC calls work in running app

## Rollback

If migration fails:
1. Old IPC handlers remain until explicitly deleted
2. New routes can be removed from `src/shared/callable/`
3. Revert `src/shared/callable/index.ts` to remove route registrations
