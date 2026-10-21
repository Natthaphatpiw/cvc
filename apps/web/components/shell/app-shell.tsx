'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Menu, SquarePen } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { screenName } from './nav';
import { SidebarContent } from './sidebar-content';

/**
 * Open-plane shell: labelled 240px sidebar on the page ground with one hairline (≥ 1024px);
 * below that a 48px top bar with the screen name and a full-screen menu sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-[80] rounded-control bg-surface px-3 py-2 text-body text-accent shadow-float focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        ข้ามไปเนื้อหาหลัก
      </a>

      <aside className="sticky top-0 hidden h-svh flex-col overflow-y-auto border-r border-border px-2 py-4 lg:flex">
        <SidebarContent />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border bg-ground px-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="เปิดเมนู"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            className="inline-flex size-11 items-center justify-center rounded-control text-text transition-colors duration-150 hover:bg-raised"
          >
            <Menu aria-hidden className="size-5" strokeWidth={1.5} />
          </button>
          <p className="min-w-0 flex-1 truncate text-section font-medium text-text">{screenName(pathname)}</p>
          {pathname !== '/new' ? (
            <Link
              href="/new"
              aria-label="วิเคราะห์แบรนด์ใหม่"
              className="inline-flex size-11 items-center justify-center rounded-control text-accent transition-colors duration-150 hover:bg-accent-soft"
            >
              <SquarePen aria-hidden className="size-5" strokeWidth={1.5} />
            </Link>
          ) : null}
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1344px] px-4 pb-16 pt-5 outline-none sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} ariaLabel="เมนู" title="เมนู" width="full">
        <SidebarContent onNavigate={() => setMenuOpen(false)} />
      </Sheet>
    </div>
  );
}
