import { Bookmark, LayoutList, SquarePen, UserRound, type LucideIcon } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon; match: (pathname: string) => boolean };

export const PRIMARY_NAV: NavItem[] = [
  {
    href: '/',
    label: 'วิเคราะห์',
    icon: LayoutList,
    match: (p) => p === '/' || p.startsWith('/runs/') || p.startsWith('/results/'),
  },
  { href: '/new', label: 'วิเคราะห์ใหม่', icon: SquarePen, match: (p) => p === '/new' },
  { href: '/saved', label: 'ที่บันทึกไว้', icon: Bookmark, match: (p) => p === '/saved' },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: '/account', label: 'บัญชี', icon: UserRound, match: (p) => p === '/account' },
];

/** Screen name for the phone/tablet top bar. */
export function screenName(pathname: string): string {
  if (pathname === '/') return 'การวิเคราะห์';
  if (pathname === '/new') return 'วิเคราะห์ใหม่';
  if (pathname.startsWith('/runs/')) return 'ความคืบหน้า';
  if (pathname.startsWith('/results/')) return 'ผลวิเคราะห์';
  if (pathname === '/saved') return 'ที่บันทึกไว้';
  if (pathname === '/account') return 'บัญชี';
  return 'Convert Cake · Influencer';
}
