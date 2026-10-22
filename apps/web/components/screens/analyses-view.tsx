'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { HistoryItem, RunStatus } from '@cvc/schemas';
import { agentApi, errorMessageTh, systemApi } from '@/lib/api';
import { formatDateTh } from '@/lib/format';
import { localStore, type LocalRun } from '@/lib/local-store';
import { hasResult, isTerminalStatus } from '@/lib/run-status';
import { useSession } from '@/lib/session';
import { AvatarStack, type AvatarStackItem } from '@/components/avatar-stack';
import { RunStatusBadge } from '@/components/run-status-badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

type Row = {
  runId: string;
  brandName: string;
  logoUrl: string | null;
  status: RunStatus;
  createdAt: string;
  resultId: string | null;
  top3: AvatarStackItem[] | null;
};

type State =
  | { kind: 'loading' }
  | { kind: 'error'; messageTh: string }
  | { kind: 'ready'; rows: Row[]; nextCursor: string | null };

function fromHistory(h: HistoryItem): Row {
  return {
    runId: h.runId,
    brandName: h.brandName ?? 'ไม่มีชื่อแบรนด์',
    logoUrl: h.brandLogoUrl,
    status: h.status,
    createdAt: h.createdAt,
    resultId: h.resultId,
    top3: h.top3,
  };
}

function fromLocal(r: LocalRun): Row {
  return {
    runId: r.runId,
    brandName: r.companyName,
    logoUrl: null,
    status: r.status,
    createdAt: r.createdAt,
    resultId: r.resultId,
    top3: null,
  };
}

function destination(row: Row): { href: string; label: string } {
  if (hasResult(row.status) && row.resultId) return { href: `/results/${row.resultId}`, label: 'ดูผล' };
  if (isTerminalStatus(row.status)) return { href: `/runs/${row.runId}`, label: 'ดูรายละเอียด' };
  return { href: `/runs/${row.runId}`, label: 'ดูความคืบหน้า' };
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card" aria-busy="true" aria-label="กำลังโหลดรายการ">
      <div className="h-9 bg-raised" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-t border-rule px-4">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="ml-auto h-5 w-20" />
          <Skeleton className="hidden h-3.5 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function AnalysesView() {
  const { status, claimRevision } = useSession();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    setState({ kind: 'loading' });

    void (async () => {
      try {
        if (status === 'line') {
          const page = await systemApi.history();
          if (active) setState({ kind: 'ready', rows: page.items.map(fromHistory), nextCursor: page.nextCursor });
          return;
        }
        const runs = await localStore.listRuns();
        if (!active) return;
        setState({ kind: 'ready', rows: runs.map(fromLocal), nextCursor: null });

        // Runs left before they finished: ask the server for their current status (best effort).
        const stale = runs.filter((r) => !isTerminalStatus(r.status)).slice(0, 10);
        await Promise.all(
          stale.map(async (r) => {
            try {
              const fresh = await agentApi.getRun(r.runId);
              await localStore.updateRun(r.runId, { status: fresh.status, resultId: fresh.resultId });
              if (!active) return;
              setState((s) =>
                s.kind === 'ready'
                  ? {
                      ...s,
                      rows: s.rows.map((row) =>
                        row.runId === r.runId ? { ...row, status: fresh.status, resultId: fresh.resultId } : row,
                      ),
                    }
                  : s,
              );
            } catch {
              // Expired on the server or offline: keep what the browser knows.
            }
          }),
        );
      } catch (e) {
        if (active) setState({ kind: 'error', messageTh: errorMessageTh(e) });
      }
    })();

    return () => {
      active = false;
    };
  }, [status, reloadKey, claimRevision]);

  const loadMore = useCallback(async () => {
    if (state.kind !== 'ready' || !state.nextCursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await systemApi.history(state.nextCursor);
      setState((s) =>
        s.kind === 'ready' ? { kind: 'ready', rows: [...s.rows, ...page.items.map(fromHistory)], nextCursor: page.nextCursor } : s,
      );
    } catch (e) {
      setMoreError(errorMessageTh(e));
    } finally {
      setLoadingMore(false);
    }
  }, [state]);

  const description =
    status === 'line'
      ? 'ประวัติการวิเคราะห์ทั้งหมดของบัญชี LINE นี้'
      : status === 'guest'
        ? 'รายการเก็บในเบราว์เซอร์นี้เท่านั้น ผลวิเคราะห์บนเซิร์ฟเวอร์เก็บไว้ 7 วัน'
        : undefined;

  return (
    <>
      <PageHeader
        title="การวิเคราะห์"
        description={description}
        actions={
          <ButtonLink href="/new" variant="primary">
            วิเคราะห์แบรนด์ใหม่
          </ButtonLink>
        }
      />

      {state.kind === 'loading' ? <TableSkeleton /> : null}

      {state.kind === 'error' ? (
        <ErrorBlock messageTh={state.messageTh} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : null}

      {state.kind === 'ready' && state.rows.length === 0 ? (
        <>
          <EmptyState
            title="ยังไม่มีการวิเคราะห์"
            description="กรอกชื่อแบรนด์อย่างเดียวก็เริ่มได้ ใช้เวลาประมาณ 5–9 นาที"
            action={
              // the page header already carries the one filled button (UI_CONTRACT §6)
              <ButtonLink href="/new" variant="secondary">
                วิเคราะห์แบรนด์ใหม่
              </ButtonLink>
            }
          />
          <FirstRunGuide />
        </>
      ) : null}

      {state.kind === 'ready' && state.rows.length > 0 ? (
        <section aria-label="รายการการวิเคราะห์">
          <p className="mb-2 text-label text-muted">{state.rows.length.toLocaleString('en-US')} รายการ</p>
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left">
                <thead>
                  <tr className="bg-raised text-meta text-muted">
                    <th scope="col" className="h-9 px-4 font-normal">
                      แบรนด์
                    </th>
                    <th scope="col" className="h-9 px-4 font-normal">
                      สถานะ
                    </th>
                    <th scope="col" className="hidden h-9 px-4 font-normal md:table-cell">
                      ครีเอเตอร์
                    </th>
                    <th scope="col" className="hidden h-9 px-4 text-right font-normal sm:table-cell">
                      วันที่
                    </th>
                    <th scope="col" className="hidden h-9 px-4 font-normal sm:table-cell">
                      <span className="sr-only">การทำงาน</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => {
                    const dest = destination(row);
                    return (
                      <tr key={row.runId} className="border-t border-rule transition-colors duration-150 hover:bg-raised">
                        <td className="px-4 py-2">
                          <div className="flex min-h-8 items-center gap-3">
                            <CreatorAvatar src={row.logoUrl} handle={row.brandName} size={32} alt="" />
                            <div className="min-w-0">
                              <Link
                                href={dest.href}
                                className="block max-w-[28ch] truncate font-normal text-text hover:text-accent"
                              >
                                {row.brandName}
                              </Link>
                              <p className="text-meta text-muted sm:hidden">
                                <time dateTime={row.createdAt}>{formatDateTh(row.createdAt)}</time>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <RunStatusBadge status={row.status} />
                        </td>
                        <td className="hidden px-4 py-2 md:table-cell">
                          <AvatarStack items={row.top3 ?? []} />
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2 text-right text-muted sm:table-cell">
                          <time dateTime={row.createdAt}>{formatDateTh(row.createdAt, { withTime: true })}</time>
                        </td>
                        <td className="hidden px-4 py-2 text-right sm:table-cell">
                          <Link
                            href={dest.href}
                            className="whitespace-nowrap text-label text-accent hover:text-accent-ink"
                            aria-label={`${dest.label} ${row.brandName}`}
                          >
                            {dest.label}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {state.nextCursor ? (
            <div className="mt-3 flex flex-col items-start gap-2">
              <Button size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                โหลดเพิ่ม
              </Button>
              {moreError ? (
                <p role="alert" className="text-meta text-negative">
                  {moreError}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

const WHAT_YOU_GET = [
  {
    title: 'ครีเอเตอร์ที่เหมาะกับแบรนด์',
    body: 'รายชื่อครีเอเตอร์ TikTok ไทยเรียงตามคะแนน 5 ด้าน พร้อมเหตุผลและหลักฐานจากคลิปจริง',
  },
  {
    title: 'ผลลัพธ์ที่คาดการณ์ได้',
    body: 'ยอดวิว การมีส่วนร่วม และต้นทุนต่อวิวต่อโพสต์ คำนวณจากผลงานย้อนหลังของแต่ละคน พร้อมบอกสมมติฐาน',
  },
  {
    title: 'แผนและขั้นตอนถัดไป',
    body: 'บทบาทของแต่ละคน รูปแบบการจ้าง ช่วงเวลาโพสต์ งบที่ใช้ และสิ่งที่ต้องทำหลังเลือกครีเอเตอร์',
  },
] as const;

/** First-run only: what an analysis returns, so the empty screen explains the one action on it. */
function FirstRunGuide() {
  return (
    <section aria-labelledby="first-run-title" className="mt-8">
      <h2 id="first-run-title" className="mb-2 text-section font-medium text-text">
        สิ่งที่จะได้จากการวิเคราะห์
      </h2>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border shadow-card md:grid-cols-3">
        {WHAT_YOU_GET.map((item) => (
          <div key={item.title} className="flex flex-col gap-1 bg-surface p-5">
            <h3 className="text-body font-normal text-text">{item.title}</h3>
            <p className="text-label font-light text-muted">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
