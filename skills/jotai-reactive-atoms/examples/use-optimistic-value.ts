/**
 * useOptimisticValue Hook
 *
 * Timestamp-based optimistic update hook for external state (Jotai, etc.).
 * React's built-in useOptimistic has issues with external state management.
 */

import { useCallback, useMemo, useState, useTransition } from 'react';

type TimestampedValue<T> = {
  ts: number;
  value: T;
};

type UseOptimisticValueReturn<T> = {
  value: T;
  isPending: boolean;
  updateOptimistically: (newValue: T) => void;
};

/**
 * Timestamp-based optimistic update hook for external state.
 *
 * React's useOptimistic relies on internal state, causing issues
 * with external state (Jotai, etc.). This hook uses timestamp
 * comparison to always display the latest value.
 *
 * @template T - Type of the managed value
 * @param realValue - Actual value from data source
 * @param onUpdate - Async function to perform the actual update
 * @returns Object containing current value, pending state, and update function
 *
 * @example
 * ```tsx
 * const { value, isPending, updateOptimistically } = useOptimisticValue(
 *   user.displayName,
 *   async (newName) => {
 *     await updateUser({ id: user.id, data: { displayName: newName } });
 *   }
 * );
 *
 * // value shows optimistic update immediately
 * // isPending is true while server request is in flight
 * // When server responds, value automatically syncs
 * ```
 */
export const useOptimisticValue = <T = unknown>(
  realValue: T,
  onUpdate: (value: T) => Promise<void> | void
): UseOptimisticValueReturn<T> => {
  // Convert realValue to timestamped value
  const real = useMemo<TimestampedValue<T>>(
    () => ({ ts: Date.now(), value: realValue }),
    [realValue]
  );

  // Manage optimistic value with timestamp
  const [optimistic, setOptimistic] = useState<TimestampedValue<T>>(real);

  // Compare timestamps to select the latest value
  const value = real.ts > optimistic.ts ? real.value : optimistic.value;

  // Manage pending state with React Transition
  const [isPending, startTransition] = useTransition();

  // Update optimistically and execute actual update
  const updateOptimistically = useCallback(
    (newValue: T) => {
      startTransition(() => {
        setOptimistic({ ts: Date.now(), value: newValue });
        void onUpdate(newValue);
      });
    },
    [onUpdate]
  );

  return { value, isPending, updateOptimistically };
};

// ═══════════════════════════════════════════════════════════════════════════
// Usage Example
// ═══════════════════════════════════════════════════════════════════════════

/*
import { useAtom, useAtomValue } from 'jotai';
import { usersAtom, updateUserAtom } from './users.atom';

const OptimisticUserCard = ({ userId }: { userId: string }) => {
  const users = useAtomValue(usersAtom);
  const [, updateUser] = useAtom(updateUserAtom);

  const user = users.find((u) => u.id === userId);
  if (!user) return null;

  const {
    value: displayName,
    isPending,
    updateOptimistically,
  } = useOptimisticValue(user.displayName, async (newName) => {
    await updateUser({ id: userId, data: { displayName: newName } });
  });

  const handleRename = () => {
    const newName = prompt('Enter new name:', displayName);
    if (newName && newName !== displayName) {
      updateOptimistically(newName);
    }
  };

  return (
    <div className={isPending ? 'opacity-50' : ''}>
      <span>{displayName}</span>
      <button onClick={handleRename} disabled={isPending}>
        {isPending ? 'Saving...' : 'Rename'}
      </button>
    </div>
  );
};
*/
