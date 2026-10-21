import type { Metadata } from 'next';
import { SavedView } from '@/components/screens/saved-view';

export const metadata: Metadata = { title: 'ที่บันทึกไว้' };

export default function SavedPage() {
  return <SavedView />;
}
