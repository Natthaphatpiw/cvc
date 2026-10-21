import type { Metadata } from 'next';
import { NewAnalysisForm } from '@/components/screens/new-analysis-form';

export const metadata: Metadata = { title: 'วิเคราะห์ใหม่' };

export default function NewAnalysisPage() {
  return <NewAnalysisForm />;
}
