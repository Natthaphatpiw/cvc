'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** True after hydration on the client; false during SSR. Used before creating portals. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
