import { LiffEntry } from '@/components/screens/liff-entry';
import { safeNext } from '../next-param';

type Params = Promise<{ path: string[] }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LIFF_PARAMS = new Set(['liff.state', 'liff.referrer', 'code', 'state', 'liffClientId', 'liffRedirectUri', 'login', 'next']);

/**
 * LIFF deep links (https://liff.line.me/{id}/results/abc) land on /liff/results/abc after liff.init();
 * finish sign-in here, then continue to the same path inside the app.
 */
export default async function LiffDeepLinkPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ path }, sp] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (LIFF_PARAMS.has(k) || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) query.append(k, item);
  }
  const qs = query.toString();
  const target = `/${path.map((s) => encodeURIComponent(s)).join('/')}${qs ? `?${qs}` : ''}`;
  return <LiffEntry next={safeNext(target)} autoLogin={sp.login === '1'} />;
}
