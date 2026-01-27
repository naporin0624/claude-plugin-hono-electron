---
name: jotai-reactive-atoms
description: Implement reactive state management with Jotai atoms in Electron renderer. Use when creating atoms, implementing real-time updates via IPC, or setting up hybrid stream + HTTP fallback patterns.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Jotai Reactive Atoms

## Patterns Overview

| Pattern | Use Case |
|---------|----------|
| Hybrid Atom | Real-time data with HTTP fallback |
| Stream Atom | IPC subscriptions via onMount |
| Write Atom | CRUD mutations |

## Quick Reference

### Hybrid Atom

```typescript
// 1. HTTP fallback
const singleFetchAtom = atomWithRefresh(async () => client.users.$get().then(r => r.json()));

// 2. Stream (IPC updates)
const streamAtom = atom<{ value: User[] }>();
streamAtom.onMount = (set) => usersSource.subscribe(debounce(async () => {
  set({ value: await client.users.$get().then(r => r.json()) });
}, 300));

// 3. Hybrid selector (NOT async)
export const usersAtom = atom((get) => {
  const stream = get(streamAtom);
  return stream !== undefined ? stream.value : get(singleFetchAtom);
});
```

### Write Atom

```typescript
export const createUserAtom = atom(null, async (_get, set, data: CreateUserData) => {
  const res = await client.users.$post({ json: data });
  if (res.status === 201) { set(singleFetchAtom); return res.json(); }
  throw new Error('Failed');
});
```

## Key Rules

1. Hybrid atom getter must NOT be async
2. Always debounce IPC handlers
3. Refresh read atoms after mutations

## Resources

| Topic | File |
|-------|------|
| Hybrid atom details | [HYBRID-ATOM.md](HYBRID-ATOM.md) |
| Write atom patterns | [WRITE-ATOM.md](WRITE-ATOM.md) |
| Event subscription | [EVENT-SUBSCRIPTION.md](EVENT-SUBSCRIPTION.md) |

## Related Skills

- [suspense-boundary-design](../suspense-boundary-design/SKILL.md) - Suspense and ErrorBoundary
