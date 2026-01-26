/**
 * Example: Complete Hybrid Atom Implementation
 *
 * This demonstrates the full hybrid atom pattern with:
 * - HTTP-only fallback atom
 * - IPC stream subscription atom
 * - Hybrid selector atom
 * - Manual refresh capability
 */

import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';

// ═══════════════════════════════════════════════════════════════════════════
// Mock Imports (Replace with actual imports in your project)
// ═══════════════════════════════════════════════════════════════════════════

// import { client } from '@adapters/client';
// import { preInviteeSnapshot } from '@adapters/ipc-events';
// import { debounce } from '@utils/debounce';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface PreInvitee {
  id: string;
  userId: string;
  displayName: string;
  note: string | null;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shared fetch logic used by both single fetch and stream atoms.
 * Ensures consistent data transformation.
 */
const fetchPreInvitees = async (): Promise<PreInvitee[]> => {
  const res = await client.preInvitees.$get();

  switch (res.status) {
    case 200:
      break;
    case 401:
      throw new UnauthorizedError();
    case 500:
      throw new UnknownError();
    default:
      throw new Error(`Unexpected status: ${res.status}`);
  }

  const data = await res.json();

  // Transform API response to domain model
  return data.map((x) => ({
    id: x.id,
    userId: x.userId,
    displayName: x.displayName,
    note: x.note,
    createdAt: new Date(x.createdAt),
  }));
};

// ═══════════════════════════════════════════════════════════════════════════
// Step 1: Single Fetch Atom (HTTP Fallback)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP-only fetch atom.
 *
 * - Used as fallback when stream isn't ready
 * - atomWithRefresh allows manual refresh via set(atom)
 * - Async atom integrates with Suspense
 */
const singleFetchPreInviteesAtom = atomWithRefresh(
  async (): Promise<PreInvitee[]> => fetchPreInvitees()
);

// ═══════════════════════════════════════════════════════════════════════════
// Step 2: Stream Atom (IPC Subscription)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stream atom that subscribes to IPC snapshot events.
 *
 * This uses the "change signal" pattern:
 * - IPC event signals that data has changed (no payload)
 * - Atom re-fetches data via HTTP
 * - More reliable than sending full data over IPC
 */
const preInviteeSnapshotAtom = atom<{ value: PreInvitee[] }>();

preInviteeSnapshotAtom.onMount = (set) => {
  /**
   * Handler for snapshot events.
   * Debouncing is implicit here since we re-fetch on each event.
   */
  const handleSnapshotUpdate = async () => {
    try {
      const preInvitees = await fetchPreInvitees();
      set({ value: preInvitees });
    } catch (e) {
      console.error('Failed to fetch pre-invitees:', e);
      // Keep previous data on error
    }
  };

  // Subscribe to snapshot events
  // Snapshot events are: { type: 'create' | 'update' | 'delete', value: PreInvitee }
  return preInviteeSnapshot.subscribe(handleSnapshotUpdate);
};

// ═══════════════════════════════════════════════════════════════════════════
// Step 3: Hybrid Selector Atom (Public API)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hybrid atom with read and write operations.
 *
 * Read: Selects between stream and HTTP fallback
 * Write: Manual refresh capability
 */
export const preInviteesAtom = atom(
  // Read function - NO async keyword to avoid unnecessary Suspense
  (get) => {
    const snapshotContainer = get(preInviteeSnapshotAtom);

    // Use stream data if available (synchronous - no Suspense)
    if (snapshotContainer !== undefined) {
      return snapshotContainer.value;
    }

    // Fallback to HTTP if stream not ready (triggers Suspense only on initial load)
    return get(singleFetchPreInviteesAtom);
  },

  // Write function (for manual refresh)
  (_get, set) => {
    // Reset stream state
    set(preInviteeSnapshotAtom, undefined);
    // Trigger HTTP refetch
    set(singleFetchPreInviteesAtom);
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Usage Examples
// ═══════════════════════════════════════════════════════════════════════════

/*
// In Component (Read)
const PreInviteeList = () => {
  const preInvitees = useAtomValue(preInviteesAtom);

  return (
    <ul>
      {preInvitees.map(pi => (
        <li key={pi.id}>{pi.displayName}</li>
      ))}
    </ul>
  );
};

// Manual Refresh (Write)
const RefreshButton = () => {
  const [, refresh] = useAtom(preInviteesAtom);

  return (
    <button onClick={() => refresh()}>
      Refresh
    </button>
  );
};

// With Suspense
const PreInviteesPage = () => (
  <Suspense fallback={<Loading />}>
    <PreInviteeList />
    <RefreshButton />
  </Suspense>
);
*/

// ═══════════════════════════════════════════════════════════════════════════
// Alternative: Simple Logs Atom (Append-Only)
// ═══════════════════════════════════════════════════════════════════════════

interface ApplicationLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * Simple stream atom for append-only data like logs.
 *
 * No HTTP fallback needed:
 * - Logs are accumulated in memory
 * - Initial value is empty array
 * - Each IPC event adds to the array
 */
export const logsAtom = atom<ApplicationLog[]>([]);

logsAtom.onMount = (set) => {
  return appLogSource.subscribe((log) => {
    set((prev) => {
      // Prepend new log, limit to 1000 entries
      const newLogs = [log, ...prev];
      return newLogs.slice(0, 1000);
    });
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// Alternative: AtomFamily for Parameterized Data
// ═══════════════════════════════════════════════════════════════════════════

import { atomFamily } from 'jotai/utils';

interface WorldInfo {
  id: string;
  name: string;
  authorName: string;
  capacity: number;
}

/**
 * AtomFamily for parameterized data.
 *
 * Use when:
 * - Data is keyed by ID
 * - No real-time updates needed
 * - Caching is beneficial
 */
export const worldAtomFamily = atomFamily(
  (worldId: string) => {
    return atom(async (): Promise<WorldInfo> => {
      const res = await client.worlds[':id'].$get({ param: { id: worldId } });

      switch (res.status) {
        case 401:
          throw new UnauthorizedError();
        case 404:
          throw new NotFoundError(`World ${worldId} not found`);
        case 500:
          throw new UnknownError();
      }

      const data = await res.json();
      return {
        id: data.id,
        name: data.name,
        authorName: data.authorName,
        capacity: data.capacity,
      };
    });
  },
  // Equality function for atom caching
  (a, b) => a === b
);

/*
// Usage: Each world ID gets its own cached atom
const WorldCard = ({ worldId }: { worldId: string }) => {
  const world = useAtomValue(worldAtomFamily(worldId));

  return (
    <div>
      <h3>{world.name}</h3>
      <p>By {world.authorName}</p>
    </div>
  );
};
*/
