import type { Metadata } from 'next';
import { RunProgress } from '@/components/screens/run-progress';

export const metadata: Metadata = { title: 'ความคืบหน้าการวิเคราะห์' };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed so a re-submitted run starts with fresh polling state instead of the previous run's events.
  return <RunProgress key={id} runId={id} />;
}
