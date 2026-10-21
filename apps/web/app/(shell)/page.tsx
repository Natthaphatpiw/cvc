import type { Metadata } from 'next';
import { AnalysesView } from '@/components/screens/analyses-view';

export const metadata: Metadata = { title: 'การวิเคราะห์' };

export default function AnalysesPage() {
  return <AnalysesView />;
}
