import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'เข้าสู่ระบบด้วย LINE' };

/** LIFF has its own header from LINE, so this layout has no app chrome; screens set their own titles. */
export default function LiffLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-svh bg-ground">{children}</main>;
}
