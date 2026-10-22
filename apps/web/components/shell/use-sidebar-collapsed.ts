'use client';

import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import { applySidebarCollapsed, readSidebarCollapsed, SIDEBAR_STORAGE_KEY, writeSidebarCollapsed } from './sidebar-state';

// A tiny external store over localStorage, like next-actions.tsx: the 'storage' event syncs other tabs.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== SIDEBAR_STORAGE_KEY) return;
    applySidebarCollapsed(readSidebarCollapsed());
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export type SidebarCollapsedState = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
};

/**
 * Collapsed state of the desktop sidebar. The look never waits for React: the <html> attribute set before paint
 * drives the layout, and this state only feeds tooltips (false during SSR and hydration).
 */
export function useSidebarCollapsed(): SidebarCollapsedState {
  const collapsed = useSyncExternalStore(subscribe, readSidebarCollapsed, () => false);

  // Strict Mode's development remount resets <html> to the attributes React renders, dropping the one the inline
  // script set; put it back from storage before paint (a no-op in production).
  useLayoutEffect(() => {
    applySidebarCollapsed(readSidebarCollapsed());
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    writeSidebarCollapsed(next);
    applySidebarCollapsed(next);
    listeners.forEach((l) => l());
  }, []);

  // Reads storage, not the render value, so a click right after hydration still flips what is on screen.
  const toggleCollapsed = useCallback(() => setCollapsed(!readSidebarCollapsed()), [setCollapsed]);

  return { collapsed, setCollapsed, toggleCollapsed };
}
