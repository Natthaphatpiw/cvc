// Collapsed desktop sidebar. The state lives in localStorage and is mirrored onto <html data-sidebar="collapsed">,
// which drives the grid column (--sidebar-w in app/globals.css) and the `rail:` variant. The inline script below
// sets the attribute before the first paint, so a returning user never sees the wide sidebar flash.
// No React here: app/layout.tsx (a server component) imports SIDEBAR_INIT_SCRIPT.

export const SIDEBAR_STORAGE_KEY = 'cvc:sidebar-collapsed';

/** Runs in <head> before paint. Kept tiny and dependency-free; storage errors leave the sidebar expanded. */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})==="1")document.documentElement.dataset.sidebar="collapsed"}catch(e){}})()`;

// Set when localStorage cannot be written (private mode, quota, blocked storage): the toggle still works for
// this page, it just is not remembered.
let memory: boolean | null = null;

export function readSidebarCollapsed(): boolean {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    memory = null;
  } catch {
    memory = collapsed;
  }
}

export function applySidebarCollapsed(collapsed: boolean): void {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
}
