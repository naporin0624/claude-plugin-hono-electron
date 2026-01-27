---
name: hono-ipc-setup
description: Set up Hono-based type-safe IPC architecture for Electron applications. Use when implementing IPC communication, creating routes between main and renderer processes, or migrating from traditional ipcRenderer to type-safe RPC.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm:*), Bash(pnpm:*)
---

# Hono Electron IPC Setup

## When to Use

- Setting up IPC communication in Electron
- Migrating from `ipcRenderer.invoke` / `ipcMain.handle` to Hono
- Adding new IPC routes with full TypeScript support

## Quick Start

```bash
pnpm add hono @hono/zod-validator zod
```

## Directory Structure

```
src/
├── shared/callable/     # Factory and app creation, types.d.ts
├── main/callable/       # Service injection
└── renderer/src/adapters/  # Type-safe hc client
```

## Resources

| Topic | File |
|-------|------|
| Why shared/ directory | [SHARED-DIRECTORY.md](SHARED-DIRECTORY.md) |
| Factory pattern with DI | [FACTORY-PATTERN.md](FACTORY-PATTERN.md) |
| Hono RPC API reference | [REFERENCE.md](REFERENCE.md) |

## Type Safety

```typescript
// src/shared/callable/types.d.ts
export type CallableType = ReturnType<typeof createApp>;

// src/renderer/src/adapters/client.ts
export const client = hc<CallableType>('http://internal.localhost', { ... });
// client.users.$get() - full autocomplete
```

## Related Skills

- [cqrs-pattern](../cqrs-pattern/SKILL.md) - Query/Command separation
- [hono-ipc-routes](../hono-ipc-routes/SKILL.md) - Route implementation
