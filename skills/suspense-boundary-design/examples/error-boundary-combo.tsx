import { Suspense } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

// Error fallback component with retry
const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="p-4 bg-red-50 border border-red-200 rounded">
    <p className="text-red-700">Failed to load content</p>
    <p className="text-sm text-red-500">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-2 px-4 py-2 bg-red-600 text-white rounded"
    >
      Retry
    </button>
  </div>
);

// Loading skeleton
const ContentSkeleton = () => (
  <div className="p-4 space-y-2 animate-pulse">
    <div className="h-6 w-1/2 bg-gray-200 rounded" />
    <div className="h-4 w-full bg-gray-200 rounded" />
  </div>
);

// Async component
const AsyncContent = () => <div>Loaded Content</div>;

// Correct pattern: ErrorBoundary wraps Suspense
export const SafeAsyncComponent = () => (
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <Suspense fallback={<ContentSkeleton />}>
      <AsyncContent />
    </Suspense>
  </ErrorBoundary>
);

// Multiple components with shared error boundary
export const ComponentGroup = () => (
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <div className="grid grid-cols-2 gap-4">
      <Suspense fallback={<ContentSkeleton />}>
        <AsyncContent />
      </Suspense>
      <Suspense fallback={<ContentSkeleton />}>
        <AsyncContent />
      </Suspense>
    </div>
  </ErrorBoundary>
);

// With onReset handler for state cleanup
export const SafeAsyncWithReset = () => (
  <ErrorBoundary
    FallbackComponent={ErrorFallback}
    onReset={() => {
      // Reset any state that caused the error
    }}
  >
    <Suspense fallback={<ContentSkeleton />}>
      <AsyncContent />
    </Suspense>
  </ErrorBoundary>
);
