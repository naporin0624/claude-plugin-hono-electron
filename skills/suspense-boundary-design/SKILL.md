---
name: suspense-boundary-design
description: Design React Suspense boundaries interactively. Use when planning loading states, configuring boundary granularity, or combining with ErrorBoundary. Guides user through requirements gathering before generating implementation.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Suspense Boundary Design

## Overview

This skill helps design optimal Suspense boundary placement through interactive requirements gathering.

## Interactive Workflow

When user requests Suspense boundary design, gather requirements first:

### Step 1: Identify Loading Units

Ask user:
```
Which components should load independently?
- [ ] Header/Navigation
- [ ] Main content area
- [ ] Sidebar
- [ ] Individual list items
- [ ] Other: ___
```

### Step 2: Error Handling Strategy

Ask user:
```
How should errors be handled?
- [ ] Show error UI in place of failed component
- [ ] Retry button with error message
- [ ] Fallback to cached/stale data
- [ ] Bubble up to parent boundary
```

### Step 3: Loading UI Preference

Ask user:
```
Preferred loading indicator style?
- [ ] Skeleton screens (content-shaped placeholders)
- [ ] Spinners/loading icons
- [ ] Shimmer effects
- [ ] Custom component
```

## Boundary Granularity Trade-offs

| Granularity | Pros | Cons |
|-------------|------|------|
| Coarse (page-level) | Simple, fewer boundaries | Full-page loading, poor UX |
| Fine (component-level) | Independent loading, better UX | More complexity, potential layout shifts |

## Design Patterns

### Pattern 1: Content Regions

```tsx
<Layout>
  <Header />  {/* Static, no Suspense */}
  <Suspense fallback={<MainSkeleton />}>
    <MainContent />
  </Suspense>
  <Suspense fallback={<SidebarSkeleton />}>
    <Sidebar />
  </Suspense>
</Layout>
```

### Pattern 2: With ErrorBoundary (react-error-boundary)

```tsx
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <AsyncComponent />
  </Suspense>
</ErrorBoundary>
```

**Rule: ErrorBoundary wraps Suspense (outside), not inside.**

### Pattern 3: List Items

```tsx
<ul>
  {items.map(item => (
    <Suspense key={item.id} fallback={<ItemSkeleton />}>
      <ListItem id={item.id} />
    </Suspense>
  ))}
</ul>
```

## Best Practices

1. **Match skeleton to content size** - Prevents layout shifts
2. **Avoid nested Suspense** - Unless intentionally creating waterfall
3. **Group related data** - Components sharing data should share boundary
4. **Consider network conditions** - Fine granularity may cause many parallel requests

## Related Skills

- [jotai-reactive-atoms/HYBRID-ATOM.md](../jotai-reactive-atoms/HYBRID-ATOM.md) - Suspense behavior with async atoms
- [jotai-reactive-atoms/SKILL.md](../jotai-reactive-atoms/SKILL.md) - Atom patterns for data fetching

## Examples

- [examples/page-layout.tsx](examples/page-layout.tsx) - Page-level boundaries
- [examples/error-boundary-combo.tsx](examples/error-boundary-combo.tsx) - ErrorBoundary + Suspense
