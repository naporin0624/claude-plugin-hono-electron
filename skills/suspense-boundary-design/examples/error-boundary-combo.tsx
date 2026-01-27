import { Component, Suspense, ReactNode } from 'react';

// Error Boundary component
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Error UI with retry
const ErrorUI = ({ onRetry }: { onRetry?: () => void }) => (
  <div className="p-4 bg-red-50 border border-red-200 rounded">
    <p className="text-red-700">Failed to load content</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-2 px-4 py-2 bg-red-600 text-white rounded"
      >
        Retry
      </button>
    )}
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
  <ErrorBoundary fallback={<ErrorUI />}>
    <Suspense fallback={<ContentSkeleton />}>
      <AsyncContent />
    </Suspense>
  </ErrorBoundary>
);

// Multiple components with shared error boundary
export const ComponentGroup = () => (
  <ErrorBoundary fallback={<ErrorUI />}>
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
