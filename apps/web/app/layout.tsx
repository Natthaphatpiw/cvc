import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Mitr } from 'next/font/google';
import { Providers } from '@/components/providers';
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
  themeColor: '#f7f8fc',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={mitr.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
