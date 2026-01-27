---
name: hono-ipc-patterns
description: Advanced patterns for Hono-based Electron IPC including CQRS, Zod validation, error handling, and reactive data with RxJS. Use when implementing complex IPC patterns or needing guidance on architecture decisions.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Hono IPC Patterns

## When to Use

- Implementing CQRS pattern (see [cqrs-pattern](../cqrs-pattern/SKILL.md))
- Adding Zod validation to routes
- Handling errors with Result types (neverthrow)
- Testing IPC routes

## Zod Validation

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

.get('/:id', zValidator('param', z.object({ id: z.string() })), (c) => { ... })
.get('/', zValidator('query', z.object({ limit: z.coerce.number() })), (c) => { ... })
.post('/', zValidator('json', z.object({ name: z.string() })), (c) => { ... })
```

See [ZOD-VALIDATION.md](ZOD-VALIDATION.md) for complete patterns.

## Error Handling

Use Result pattern matching for type-safe error handling:

```typescript
return result.match(
  (data) => c.json(data, 200),
  (error) => c.json({ error: error.message }, error.statusCode ?? 500)
);
```

## Resources

| Topic | File |
|-------|------|
| CQRS Pattern | [../cqrs-pattern/SKILL.md](../cqrs-pattern/SKILL.md) |
| Zod Validation | [ZOD-VALIDATION.md](ZOD-VALIDATION.md) |
