import { Suspense } from 'react';

// Skeleton components
const HeaderSkeleton = () => (
  <div className="h-16 bg-gray-200 animate-pulse" />
);

const MainContentSkeleton = () => (
  <div className="space-y-4 p-4">
    <div className="h-8 w-1/3 bg-gray-200 animate-pulse rounded" />
    <div className="h-4 w-full bg-gray-200 animate-pulse rounded" />
    <div className="h-4 w-2/3 bg-gray-200 animate-pulse rounded" />
  </div>
);

const SidebarSkeleton = () => (
  <div className="w-64 space-y-2 p-4">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="h-10 bg-gray-200 animate-pulse rounded" />
    ))}
  </div>
);

// Async components (would use Jotai atoms internally)
const Header = () => <header>Header Content</header>;
const MainContent = () => <main>Main Content</main>;
const Sidebar = () => <aside>Sidebar Content</aside>;

// Page layout with independent loading boundaries
export const DashboardPage = () => (
  <div className="min-h-screen flex flex-col">
    {/* Header: Often static, may not need Suspense */}
    <Suspense fallback={<HeaderSkeleton />}>
      <Header />
    </Suspense>

    <div className="flex flex-1">
      {/* Main content: Primary loading boundary */}
      <Suspense fallback={<MainContentSkeleton />}>
        <MainContent />
      </Suspense>

      {/* Sidebar: Independent loading */}
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
    </div>
  </div>
);
