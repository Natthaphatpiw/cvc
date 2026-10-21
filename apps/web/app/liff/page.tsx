import { LiffEntry } from '@/components/screens/liff-entry';
import { safeNext } from './next-param';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LiffPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return <LiffEntry next={safeNext(sp.next)} autoLogin={sp.login === '1'} />;
}
