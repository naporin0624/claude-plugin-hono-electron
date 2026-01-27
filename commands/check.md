---
description: Validate project against Hono Electron IPC architecture patterns
argument-hint: [--fix] [--focus=<category>]
allowed-tools: Read, Glob, Grep
---

# Check Project Patterns

Validate the entire project against established architecture patterns and best practices.

## Arguments

- `--fix`: Suggest or apply fixes for detected issues
- `--focus=<category>`: Check only specific category (structure, cqrs, routes, atoms, ipc, errors)

## Validation Categories

| Category | Checks |
|----------|--------|
| `structure` | Directory structure, file naming conventions |
| `cqrs` | Query returns `Observable<T>`, Command returns `ResultAsync<void, Error>` |
| `routes` | Hono route patterns, Zod validation usage |
| `atoms` | Jotai hybrid atom patterns, non-async selectors |
| `ipc` | IPC communication patterns, timeout handling |
| `errors` | Error boundaries, Result pattern matching |

## Critical Checks

### Timeout in firstValueFrom (HIGH PRIORITY)

**Problem**: `firstValueFrom()` without `timeout()` can hang indefinitely.

```typescript
// BAD - No timeout, can hang forever
const data = await firstValueFrom(service.list());

// GOOD - Has timeout with proper error handling
import { timeout, TimeoutError } from 'rxjs';

const data = await firstValueFrom(
  service.list().pipe(timeout(5000))
).catch((e) => {
  if (e instanceof TimeoutError) {
    throw new ApplicationError('Service timeout');
  }
  throw e;
});
```

**Pattern to search**: `firstValueFrom` without adjacent `timeout`

### Hybrid Atom Async Getter (MEDIUM)

```typescript
// BAD - async getter causes Suspense issues
export const usersAtom = atom(async (get) => { ... });

// GOOD - sync getter with conditional
export const usersAtom = atom((get) => {
  const stream = get(streamAtom);
  return stream !== undefined ? stream.value : get(singleFetchAtom);
});
```

## Validation Workflow

```
1. Run glob/grep to find relevant files
2. Check each file against patterns
3. Report findings with file:line references
4. Optionally suggest fixes
```

## Output Format

```
/check results:

Directory Structure
  [PASS] src/shared/callable/ exists
  [PASS] src/main/services/ exists

CQRS Services
  [PASS] UserService follows CQRS pattern
  [WARN] EventService.get() should return Observable, found Promise
    -> src/main/services/event.service.ts:45

Timeout Handling
  [FAIL] Missing timeout() in firstValueFrom
    -> src/renderer/src/hooks/useUsers.ts:12
    -> src/main/callable/users/index.ts:28

  Suggested fix:
    service.list().pipe(timeout(5000))

Total: 15 passed, 2 warnings, 1 error
```

## Focus Mode Examples

```bash
# Check only atoms
/check --focus=atoms

# Check only with fixes
/check --fix

# Check specific category with fixes
/check --focus=ipc --fix
```

## Pattern References

For detailed patterns, see:
- [cqrs-pattern skill](../skills/cqrs-pattern/SKILL.md)
- [hono-ipc-routes skill](../skills/hono-ipc-routes/SKILL.md)
- [jotai-reactive-atoms skill](../skills/jotai-reactive-atoms/SKILL.md)
