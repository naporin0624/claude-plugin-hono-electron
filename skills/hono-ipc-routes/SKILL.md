---
name: hono-ipc-routes
description: Implement type-safe IPC communication in Electron using Hono RPC. Use when creating API routes between main and renderer processes, setting up typed clients, or implementing request/response IPC patterns.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Hono IPC Routes

## When to Use

- Creating type-safe API routes for Electron IPC
- Setting up typed Hono client in renderer
- Implementing request/response patterns

## Quick Reference

### Route Definition

```typescript
// src/shared/callable/users/index.ts
export const route = new Hono<{ Variables: AppVariables }>()
  .get('/', async (c) => c.json(await c.var.services.users.list(), 200))
  .get('/:id', async (c) => c.json(await c.var.services.users.get(c.req.param('id')), 200))
  .post('/', zValidator('json', schema), async (c) => { ... });
```

### Client Usage

```typescript
const res = await client.users.$get();
const users = await res.json();  // Fully typed
```

## Resources

| Topic | File |
|-------|------|
| Route implementation | [ROUTE-HANDLERS.md](ROUTE-HANDLERS.md) |
| Type safety patterns | [TYPE-SAFETY.md](TYPE-SAFETY.md) |
| Error handling | [ERROR-HANDLING.md](ERROR-HANDLING.md) |

## Related Skills

- [hono-ipc-setup](../hono-ipc-setup/SKILL.md) - Initial setup
- [cqrs-pattern](../cqrs-pattern/SKILL.md) - Service layer patterns
