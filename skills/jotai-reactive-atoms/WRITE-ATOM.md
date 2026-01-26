# Write Atom Pattern

## Overview

Write Atoms enable mutation operations (create, update, delete) through Jotai atoms. Unlike read atoms that return data, write atoms execute side effects and optionally refresh related read atoms.

## Key Concepts

1. **Write-only atoms** - No read value, only write function
2. **Automatic refresh** - Trigger read atom refresh after mutation
3. **Type-safe mutations** - Full TypeScript support for payloads
4. **Error handling** - Consistent error patterns with status codes

## Pattern Structure

```typescript
// Write-only atom: first param is null (no read value)
export const createUserAtom = atom(
  null,
  async (_get, set, data: CreateUserData) => {
    const res = await client.users.$post({ json: data });

    switch (res.status) {
      case 201: {
        set(singleFetchUsersAtom);  // Refresh read atom
        return res.json();
      }
      case 400: {
        const error = await res.json();
        throw new ValidationError(error.error);
      }
      default: {
        throw new Error('Failed to create user');
      }
    }
  }
);

// Usage in component
const [, createUser] = useAtom(createUserAtom);
await createUser({ displayName: 'Alice', bio: null });
```

See [examples/write-atom.ts](examples/write-atom.ts) for complete create/update/delete implementations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WRITE ATOM PATTERN                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Component calls write function                                     │
│         │                                                             │
│         ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ createUserAtom / updateUserAtom / deleteUserAtom            │   │
│   │                                                               │   │
│   │ atom(null, async (_get, set, payload) => {                   │   │
│   │   const res = await client.users.$post({ json: payload });   │   │
│   │   if (res.status === 201) {                                  │   │
│   │     set(usersAtom);  // Refresh read atom                    │   │
│   │     return res.json();                                        │   │
│   │   }                                                           │   │
│   │   throw new Error(...);                                       │   │
│   │ })                                                            │   │
│   └─────────────────────────────────────────────────────────────┘   │
│         │                                                             │
│         │ HTTP Request                                               │
│         ▼                                                             │
│   ┌─────────────────┐                                               │
│   │ Main Process    │                                               │
│   │ Hono Route      │                                               │
│   └────────┬────────┘                                               │
│            │                                                          │
│            │ CQRS Command                                            │
│            ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ Service Layer   │                                               │
│   │ (create/update/ │                                               │
│   │  delete)        │                                               │
│   └────────┬────────┘                                               │
│            │                                                          │
│            │ BehaviorSubject.next()                                  │
│            ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ IPC Push        │ ───► webContents.send('app:users')            │
│   └─────────────────┘                                               │
│            │                                                          │
│            │ Event received by stream atom                           │
│            ▼                                                          │
│   ┌─────────────────┐                                               │
│   │ usersAtom       │ ───► Component re-renders with new data       │
│   └─────────────────┘                                               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence

```
TIME: t0 (Mutation Triggered)
═══════════════════════════════════════════════════════════

  User clicks "Create" button
       │
       ▼
  createUser({ displayName: 'Alice', bio: null, note: null })
       │
       ▼
  createUserAtom write function executes
       │
       ▼
  HTTP POST /users → Main Process
       │
       ▼
  Service.create() → Database insert
       │
       ▼
  Returns 201 + created user


TIME: t1 (Read Atom Refresh)
═══════════════════════════════════════════════════════════

  set(singleFetchUsersAtom)  // Triggered in write atom
       │
       ▼
  HTTP GET /users → Main Process
       │
       ▼
  New user list returned
       │
       ▼
  usersAtom updates → Component re-renders ✓


TIME: t2 (IPC Push - Parallel Path)
═══════════════════════════════════════════════════════════

  Service.create() also triggers BehaviorSubject.next()
       │
       ▼
  webContents.send('app:users')
       │
       ▼
  usersSource subscribers notified
       │
       ▼
  streamUsersAtom refetches (debounced)
       │
       ▼
  Additional re-render (if data changed) ✓
```

## Best Practices

### DO:
- Always refresh related read atoms after successful mutations
- Use specific error classes for different error types
- Handle all relevant HTTP status codes with switch statements
- Use optimistic updates for better UX (see below)

### DON'T:
- Forget to handle error cases
- Skip refreshing read atoms after mutations
- Use `res.ok` instead of `switch(res.status)`

## Optimistic Updates

For optimistic updates with Jotai atoms, use the `useOptimisticValue` hook.

React's built-in `useOptimistic` has issues with external state (Jotai atoms).
`useOptimisticValue` uses timestamp comparison to always show the latest value,
with automatic rollback on error.

```tsx
const { value, isPending, updateOptimistically } = useOptimisticValue(
  user.displayName,
  async (newName) => {
    await updateUser({ id: user.id, data: { displayName: newName } });
  }
);
```

See [examples/use-optimistic-value.ts](examples/use-optimistic-value.ts) for the full implementation.

## Related Documentation

- [HYBRID-ATOM.md](HYBRID-ATOM.md) - Read atom patterns with stream + HTTP fallback
- [EVENT-SUBSCRIPTION.md](EVENT-SUBSCRIPTION.md) - IPC subscription optimization
- [examples/write-atom.ts](examples/write-atom.ts) - Complete write atom implementation
- [examples/use-optimistic-value.ts](examples/use-optimistic-value.ts) - Optimistic update hook
