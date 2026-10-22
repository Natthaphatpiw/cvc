'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId } from 'react';
import { PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { ProductMark } from './product-mark';
import { ACCOUNT_NAV, PRIMARY_NAV, type NavItem } from './nav';

// Collapsed rail geometry: the sidebar is 76px with 16px padding, so every icon, the product mark and the avatar
// sit on one centre line 38px from the edge in both states; collapsing only hides labels (`rail:` variant, set
// before paint from the <html> attribute) and narrows the rows. `collapsed` (React state) only switches tooltips on.

function NavLink({
  item,
  pathname,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  collapsed: boolean;
}) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <li>
      <Tooltip content={item.label} side="right" disabled={!collapsed} repeatsLabel className="flex">
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'group/nav flex h-11 w-full min-w-0 items-center gap-3 rounded-control pl-[13px] pr-3 text-body transition-colors duration-150',
            active ? 'bg-accent font-normal text-white' : 'font-light text-muted hover:bg-raised hover:text-text',
          )}
        >
          <Icon
            aria-hidden
            className={cn('size-[18px] shrink-0', active ? 'text-white' : 'text-muted group-hover/nav:text-text')}
            strokeWidth={1.75}
          />
          <span className="truncate rail:sr-only">{item.label}</span>
        </Link>
      </Tooltip>
    </li>
  );
}

function UserRow({ collapsed }: { collapsed: boolean }) {
  const { status, user, canLoginWithLine, loginWithLine } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex h-12 items-center gap-2.5 pl-1.5 rail:justify-center rail:pl-0" aria-busy="true" aria-label="กำลังโหลดบัญชี">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-1.5 rail:hidden">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  }

  const name = status === 'line' ? (user?.displayName ?? 'ผู้ใช้ LINE') : 'ผู้ใช้ทั่วไป';
  const avatar =
    status === 'line' ? (
      <CreatorAvatar src={user?.pictureUrl ?? null} handle={name} size={32} alt="" />
    ) : (
      <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-raised text-muted">
        <UserRound className="size-4" strokeWidth={1.75} />
      </span>
    );

  return (
    <>
      <div className="flex min-h-12 items-center gap-2.5 py-1.5 pl-1.5 pr-2 rail:hidden">
        {avatar}
        <div className="min-w-0">
          <p className="truncate text-label font-normal text-text">{name}</p>
          {status === 'line' ? (
            <p className="text-meta text-muted">เชื่อมต่อ LINE แล้ว</p>
          ) : canLoginWithLine ? (
            <button
              type="button"
              onClick={() => void loginWithLine()}
              className="-ml-1 inline-flex h-8 items-center rounded-control px-1 text-label text-accent transition-colors duration-150 hover:bg-accent-soft hover:text-accent-ink"
            >
              เข้าสู่ระบบด้วย LINE
            </button>
          ) : (
            <p className="text-meta text-muted">ข้อมูลเก็บในเบราว์เซอร์นี้</p>
          )}
        </div>
      </div>
      {/* Rail only (display:none elsewhere, so screen readers meet one version): the avatar opens the account page. */}
      <div className="hidden justify-center rail:flex">
        <Tooltip content={name} side="right" disabled={!collapsed} repeatsLabel>
          <Link
            href="/account"
            aria-label={`บัญชี: ${name}`}
            className="inline-flex size-11 items-center justify-center rounded-full transition-colors duration-150 hover:bg-raised"
          >
            {avatar}
          </Link>
        </Tooltip>
      </div>
    </>
  );
}

export type SidebarContentProps = {
  /** Phone menu: close the sheet after a link is followed. */
  onNavigate?: () => void;
  /** Desktop sidebar only: React's view of the collapsed rail (turns the icon tooltips on). */
  collapsed?: boolean;
  /** Desktop sidebar only: shows the collapse toggle in the header row. */
  onToggleCollapsed?: () => void;
};

/**
 * Workspace block (+ collapse toggle on desktop), primary nav, account group and the user row. Shared by the
 * desktop sidebar ([data-rail], which can collapse to icons) and the phone menu sheet (never collapses).
 */
export function SidebarContent({ onNavigate, collapsed = false, onToggleCollapsed }: SidebarContentProps) {
  const pathname = usePathname() ?? '/';
  const accountLabelId = useId();
  const toggleLabel = collapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู';
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 rail:flex-col rail:gap-3">
        <Tooltip content="Convert Cake · Influencer" side="right" disabled={!collapsed} repeatsLabel className="flex min-w-0 flex-1 rail:flex-none">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control py-1.5 pl-[11px] pr-2 transition-colors duration-150 hover:bg-raised rail:w-11 rail:flex-none rail:justify-center rail:px-0"
            aria-label="Convert Cake · Influencer หน้าการวิเคราะห์"
          >
            <ProductMark size={22} />
            <span className="min-w-0 text-label rail:hidden">
              <span className="block truncate font-normal text-text">Convert Cake</span>
              <span className="block truncate text-muted">Influencer</span>
            </span>
          </Link>
        </Tooltip>
        {onToggleCollapsed ? (
          <Tooltip content={toggleLabel} side="right" repeatsLabel>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-text"
            >
              <PanelLeftClose aria-hidden className="size-[18px] rail:hidden" strokeWidth={1.5} />
              <PanelLeftOpen aria-hidden className="hidden size-[18px] rail:block" strokeWidth={1.5} />
              {/* The name follows the attribute set before paint, not React state, so it is right from the first frame. */}
              <span className="sr-only">
                <span className="rail:hidden">ย่อแถบเมนู</span>
                <span className="hidden rail:inline">ขยายแถบเมนู</span>
              </span>
            </button>
          </Tooltip>
        ) : null}
      </div>

      <nav aria-label="เมนูหลัก" className="mt-6">
        <ul className="space-y-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      <div className="mt-auto pt-6">
        <p className="mb-1.5 px-3 text-meta text-muted rail:sr-only" id={accountLabelId}>
          บัญชี
        </p>
        <nav aria-labelledby={accountLabelId}>
          <ul className="space-y-1">
            {ACCOUNT_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </ul>
        </nav>
        <div className="mt-3 border-t border-border pt-3">
          <UserRow collapsed={collapsed} />
        </div>
      </div>
    </div>
  );
}
