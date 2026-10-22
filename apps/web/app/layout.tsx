import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Mitr } from 'next/font/google';
import { Providers } from '@/components/providers';
import { SIDEBAR_INIT_SCRIPT } from '@/components/shell/sidebar-state';
import { APP_NAME } from '@/lib/config';
import './globals.css';

const mitr = Mitr({ subsets: ['thai', 'latin'], weight: ['300', '400', '500', '600'], display: 'swap', variable: '--font-mitr' });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'จับคู่แบรนด์กับครีเอเตอร์ TikTok ไทย พร้อมผลคาดการณ์และแผนงาน',
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3f6fd',
};

// The inline script sets data-sidebar on <html> before the first paint (collapsed desktop sidebar), so React must
// accept that attribute on hydration: suppressHydrationWarning covers <html> itself only.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={mitr.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
