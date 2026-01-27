---
name: suspense-boundary-design
description: Design React Suspense boundaries interactively. Use when planning loading states, configuring boundary granularity, or combining with ErrorBoundary.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Suspense Boundary Design

## Interview Questions

1. **Loading units** - Which components load independently?
2. **Error handling** - Show error UI, retry button, or bubble up?
3. **Loading UI** - Skeleton, spinner, or shimmer?

## Pattern

```tsx
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Skeleton />}>
    <AsyncComponent />
  </Suspense>
</ErrorBoundary>
```

**Rule: ErrorBoundary wraps Suspense (outside).**

## Best Practices

1. Match skeleton to content size (prevents layout shifts)
2. Avoid nested Suspense unless intentional waterfall
3. Group components sharing data under same boundary

## Related

- [jotai-reactive-atoms/HYBRID-ATOM.md](../jotai-reactive-atoms/HYBRID-ATOM.md) - Suspense with async atoms
