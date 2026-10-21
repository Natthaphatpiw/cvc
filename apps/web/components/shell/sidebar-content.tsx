'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductMark } from './product-mark';
import { ACCOUNT_NAV, PRIMARY_NAV, type NavItem } from './nav';

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-11 items-center gap-2.5 rounded-control px-2 text-body transition-colors duration-150 lg:h-8',
          active ? 'bg-accent-soft font-normal text-accent-ink' : 'font-light text-muted hover:bg-raised hover:text-text',
        )}
      >
        <Icon aria-hidden className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-muted')} strokeWidth={1.5} />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function UserRow() {
  const { status, user, canLoginWithLine, loginWithLine } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex h-12 items-center gap-2.5 px-2" aria-busy="true" aria-label="กำลังโหลดบัญชี">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  }

  if (status === 'line') {
    const name = user?.displayName ?? 'ผู้ใช้ LINE';
    return (
      <div className="flex min-h-12 items-center gap-2.5 px-2 py-1.5">
        <CreatorAvatar src={user?.pictureUrl ?? null} handle={name} size={32} alt="" />
        <div className="min-w-0">
          <p className="truncate text-label font-normal text-text">{name}</p>
          <p className="text-meta text-muted">เชื่อมต่อ LINE แล้ว</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5">
      <p className="text-label font-normal text-text">ผู้ใช้ทั่วไป</p>
      {canLoginWithLine ? (
        <button
          type="button"
          onClick={() => void loginWithLine()}
          className="-ml-1 mt-0.5 inline-flex h-8 items-center rounded-control px-1 text-label text-accent transition-colors duration-150 hover:bg-accent-soft hover:text-accent-ink"
        >
          เข้าสู่ระบบด้วย LINE
        </button>
      ) : (
        <p className="mt-0.5 text-meta text-muted">ข้อมูลเก็บในเบราว์เซอร์นี้</p>
      )}
    </div>
  );
}

/** Workspace block, primary nav, account group and the user row. Shared by the desktop sidebar and the phone menu. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
        aria-label="Convert Cake · Influencer หน้าการวิเคราะห์"
      >
        <ProductMark />
        <span className="min-w-0 text-label">
          <span className="block truncate font-normal text-text">Convert Cake</span>
          <span className="block truncate text-muted">Influencer</span>
        </span>
      </Link>

      <nav aria-label="เมนูหลัก" className="mt-5">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      <div className="mt-auto pt-6">
        <p className="mb-1.5 px-2 text-meta text-muted" id="nav-account-label">
          บัญชี
        </p>
        <nav aria-labelledby="nav-account-label">
          <ul className="space-y-0.5">
            {ACCOUNT_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </ul>
        </nav>
        <div className="mt-2 border-t border-border pt-2">
          <UserRow />
        </div>
      </div>
    </div>
  );
}
