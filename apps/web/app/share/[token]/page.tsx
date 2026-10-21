import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResultPageSkeleton } from '@/components/results/result-layout';
import { SharedResultScreen } from '@/components/results/shared-result-screen';
import { ProductMark } from '@/components/shell/product-mark';

export const metadata: Metadata = { title: 'ผลวิเคราะห์ที่แชร์' };

/** Outside the (shell) group: a minimal header with the product mark, then the read-only result. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="min-h-svh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[1344px] items-center gap-2.5 px-4 sm:px-6 lg:px-8">
          <ProductMark size={20} />
          <span className="text-label font-normal text-text">Convert Cake · Influencer</span>
          <span className="ml-auto text-meta text-muted">ผลวิเคราะห์แบบอ่านอย่างเดียว</span>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1344px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <Suspense fallback={<ResultPageSkeleton />}>
          <SharedResultScreen token={token} />
        </Suspense>
      </main>
    </div>
  );
}
