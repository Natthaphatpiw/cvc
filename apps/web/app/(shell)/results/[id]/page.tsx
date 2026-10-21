import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResultPageSkeleton } from '@/components/results/result-layout';
import { ResultScreen } from '@/components/results/result-screen';

export const metadata: Metadata = { title: 'ผลวิเคราะห์' };

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // The creator sheet reads ?creator= with useSearchParams, which needs a Suspense boundary.
    <Suspense fallback={<ResultPageSkeleton />}>
      <ResultScreen key={id} resultId={id} />
    </Suspense>
  );
}
