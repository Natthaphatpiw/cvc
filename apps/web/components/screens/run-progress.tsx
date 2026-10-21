'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrandCard, KolPreview, ProgressEvent, RunInputDraft, RunStatusResponse } from '@cvc/schemas';
import { agentApi, ApiError, errorMessageTh } from '@/lib/api';
import { formatDateTh, formatDurationTh, formatEtaTh } from '@/lib/format';
import { localStore } from '@/lib/local-store';
import { hasResult, isTerminalStatus } from '@/lib/run-status';
import { useSession } from '@/lib/session';
import { RunStatusBadge } from '@/components/run-status-badge';
import { RunRail } from '@/components/runs/run-rail';
import { StageList, deriveStages } from '@/components/runs/stage-list';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DemoBanner } from '@/components/ui/demo-banner';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 15000;
/** completed/partial but resultId not written yet: keep polling this many times before giving up. */
const MAX_RESULT_WAIT_TICKS = 15;

type Fatal = { messageTh: string; notFound: boolean };

function latestPartial<K extends 'brand' | 'candidatesFound' | 'preview' | 'resultId'>(
  events: ProgressEvent[],
  key: K,
): NonNullable<NonNullable<ProgressEvent['partial']>[K]> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const v = events[i]?.partial?.[key];
    if (v !== undefined && v !== null) return v as NonNullable<NonNullable<ProgressEvent['partial']>[K]>;
  }
  return null;
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดความคืบหน้า">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
        <Card>
          <Skeleton className="h-1.5 w-full rounded-full" />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="mt-5 flex items-center gap-3">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 w-56" />
            </div>
          ))}
        </Card>
        <Card>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-3.5 w-full" />
        </Card>
      </div>
    </div>
  );
}

export function RunProgress({ runId }: { runId: string }) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [run, setRun] = useState<RunStatusResponse | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isDemo, setIsDemo] = useState(false);
  const [localName, setLocalName] = useState<string | null>(null);
  const [localInput, setLocalInput] = useState<RunInputDraft | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [resultWaitExceeded, setResultWaitExceeded] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void localStore.getRun(runId).then((r) => {
      if (!active || !r) return;
      setLocalName(r.companyName);
      setLocalInput(r.input ?? null);
    });
    agentApi
      .health()
      .then((h) => {
        if (active) setIsDemo(h.demo);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [runId]);

  // Poll events + status every 2 s until the run ends (backoff on network errors).
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let after = 0;
    let failures = 0;
    let resultWaits = 0;
    setFatal(null);
    setConnectionIssue(false);
    setResultWaitExceeded(false);

    const finish = async (r: RunStatusResponse, resultId: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      await localStore.updateRun(runId, { status: r.status, resultId });
      router.replace(`/results/${encodeURIComponent(resultId)}`);
    };

    const tick = async () => {
      try {
        const [ev, r] = await Promise.all([agentApi.events(runId, after), agentApi.getRun(runId)]);
        if (!active) return;
        failures = 0;
        setConnectionIssue(false);
        after = Math.max(after, ev.nextSeq);
        if (ev.events.length > 0) {
          setEvents((list) => {
            const seen = new Set(list.map((e) => e.seq));
            return [...list, ...ev.events.filter((e) => !seen.has(e.seq))].sort((a, b) => a.seq - b.seq);
          });
        }
        setRun(r);

        if (isTerminalStatus(r.status)) {
          await localStore.updateRun(runId, { status: r.status, resultId: r.resultId });
          if (hasResult(r.status)) {
            const resultId = r.resultId ?? ev.events.findLast((e) => e.partial?.resultId)?.partial?.resultId ?? null;
            if (resultId) {
              await finish(r, resultId);
              return;
            }
            resultWaits += 1;
            if (resultWaits >= MAX_RESULT_WAIT_TICKS) {
              setResultWaitExceeded(true);
              return;
            }
          } else {
            return; // failed / cancelled: stop polling
          }
        }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
          setFatal({ messageTh: 'ไม่พบการวิเคราะห์นี้ หรือบัญชีนี้ไม่มีสิทธิ์เปิดดู', notFound: true });
          return;
        }
        failures += 1;
        if (failures >= 3) setConnectionIssue(true);
        if (failures >= 3 && e instanceof ApiError && e.status !== 0 && e.status < 500 && e.status !== 429) {
          setFatal({ messageTh: errorMessageTh(e), notFound: false });
          return;
        }
      }
      if (!active) return;
      const delay = failures > 0 ? Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS) : POLL_MS;
      timer = setTimeout(() => void tick(), delay);
    };

    void tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, retryKey, router]);

  const terminal = run ? isTerminalStatus(run.status) : false;

  useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [terminal]);

  const rows = useMemo(() => deriveStages(events, run), [events, run]);
  const brand = useMemo<BrandCard | null>(() => latestPartial(events, 'brand'), [events]);
  const candidatesFound = useMemo(() => latestPartial(events, 'candidatesFound'), [events]);
  const preview = useMemo<KolPreview[]>(() => latestPartial(events, 'preview') ?? [], [events]);
  const warnings = useMemo(() => {
    const set = new Set<string>(run?.warnings ?? []);
    for (const e of events) for (const w of e.partial?.warnings ?? []) set.add(w);
    return [...set];
  }, [events, run]);

  const pct = Math.max(0, Math.min(100, Math.round(run?.progressPct ?? events[events.length - 1]?.pct ?? 0)));
  const createdMs = run ? Date.parse(run.createdAt) : NaN;
  const lastEventMs = events.length > 0 ? Date.parse(events[events.length - 1]?.at ?? '') : NaN;
  const elapsedSec = Number.isFinite(createdMs)
    ? ((terminal && Number.isFinite(lastEventMs) ? lastEventMs : now) - createdMs) / 1000
    : null;
  const eta = terminal ? null : formatEtaTh(run?.etaSec ?? events[events.length - 1]?.etaSec ?? null);
  const activeRow = rows.find((r) => r.state === 'active');
  const title = run?.companyName || localName || 'การวิเคราะห์';

  const doCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await agentApi.cancel(runId);
      setConfirmCancel(false);
      setRetryKey((k) => k + 1);
    } catch (e) {
      setCancelError(errorMessageTh(e));
    } finally {
      setCancelling(false);
    }
  };

  // Failed run: post the brief kept in this browser again; force skips the dedupe lookup.
  const resubmit = async () => {
    if (!localInput) return;
    setResubmitting(true);
    setResubmitError(null);
    try {
      const res = await agentApi.createRun({ ...localInput, options: { ...localInput.options, force: true } });
      await localStore.putRun({
        runId: res.runId,
        companyName: localInput.companyName,
        createdAt: new Date().toISOString(),
        claimSecret: res.claimSecret,
        resultId: null,
        status: res.status,
        input: localInput,
      });
      router.push(`/runs/${encodeURIComponent(res.runId)}`);
    } catch (e) {
      setResubmitError(errorMessageTh(e));
      setResubmitting(false);
    }
  };

  if (fatal) {
    return (
      <>
        <PageHeader title={title} />
        <ErrorBlock
          messageTh={fatal.messageTh}
          onRetry={fatal.notFound ? undefined : () => setRetryKey((k) => k + 1)}
          action={
            <ButtonLink href="/" size="sm" variant="tertiary">
              กลับหน้าการวิเคราะห์
            </ButtonLink>
          }
          detail={`รหัสการวิเคราะห์ ${runId}`}
        />
      </>
    );
  }

  if (!run) return <PageSkeleton />;

  return (
    <>
      {isDemo ? <DemoBanner /> : null}
      <PageHeader
        title={title}
        meta={<RunStatusBadge status={run.status} />}
        description={
          terminal
            ? `เริ่มเมื่อ ${formatDateTh(run.createdAt, { withTime: true })}`
            : 'กำลังวิเคราะห์ ระบบจะเปิดผลให้อัตโนมัติเมื่อเสร็จ'
        }
        actions={
          !terminal ? (
            <Button onClick={() => setConfirmCancel(true)}>ยกเลิกการวิเคราะห์</Button>
          ) : (
            <ButtonLink href="/new" variant={run.status === 'failed' || run.status === 'cancelled' ? 'primary' : 'secondary'}>
              เริ่มใหม่
            </ButtonLink>
          )
        }
      />

      {run.status === 'failed' ? (
        <ErrorBlock
          className="mb-6"
          messageTh={run.errorMessageTh || 'การวิเคราะห์ไม่สำเร็จ กรุณาเริ่มใหม่อีกครั้ง'}
          action={
            localInput ? (
              <Button size="sm" loading={resubmitting} onClick={() => void resubmit()}>
                ลองอีกครั้งด้วยข้อมูลเดิม
              </Button>
            ) : undefined
          }
          detail={
            <>
              {resubmitError ? <span className="block text-negative">{resubmitError}</span> : null}
              {`รหัสการวิเคราะห์ ${runId} (แจ้งทีมงานได้หากเกิดซ้ำ)`}
            </>
          }
        />
      ) : null}

      {resultWaitExceeded ? (
        <ErrorBlock
          className="mb-6"
          messageTh="วิเคราะห์เสร็จแล้ว แต่ผลลัพธ์ยังไม่พร้อมเปิด"
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      ) : null}

      {connectionIssue && !terminal ? (
        <p role="status" className="mb-4 rounded-control bg-warning-soft px-3 py-2 text-label text-warning">
          การเชื่อมต่อขาดหาย กำลังลองใหม่อัตโนมัติ
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div role="note" className="mb-6 rounded-card border border-warning/20 bg-warning-soft px-4 py-3 text-body text-warning">
          <p className="font-normal">บางแหล่งข้อมูลดึงไม่สำเร็จ ผลลัพธ์อาจไม่ครบ</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-label">
            {warnings.slice(0, 5).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
        <div className="min-w-0 space-y-4">
          {run.status === 'cancelled' ? (
            <EmptyState title="ยกเลิกการวิเคราะห์นี้แล้ว" description="กดเริ่มใหม่ด้านบนเพื่อวิเคราะห์แบรนด์อีกครั้ง" />
          ) : null}

          <Card>
            <div className="mb-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-label text-muted">ความคืบหน้า</p>
                <p className="num text-label text-text">{pct}%</p>
              </div>
              <div
                role="progressbar"
                aria-label="ความคืบหน้าการวิเคราะห์"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent-track"
              >
                <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
              </div>
              <p className="num mt-2 text-meta text-muted">
                {elapsedSec !== null ? `ใช้เวลาไป ${formatDurationTh(elapsedSec)}` : null}
                {eta ? ` · ${eta}` : null}
              </p>
            </div>

            <StageList rows={rows} />

            <p className="sr-only" aria-live="polite">
              {activeRow ? `${activeRow.label} ${activeRow.message ?? ''}` : ''}
            </p>
          </Card>

          {!terminal ? (
            <p className="text-label text-muted">
              {sessionStatus === 'line'
                ? 'ปิดหน้านี้ได้ กลับมาดูผลได้ที่หน้าการวิเคราะห์'
                : 'เปิดหน้านี้ค้างไว้ หรือกลับมาที่ลิงก์เดิมภายใน 7 วัน'}
            </p>
          ) : null}
        </div>

        <RunRail
          brand={brand}
          candidatesFound={candidatesFound}
          preview={preview}
          ended={run.status === 'failed' || run.status === 'cancelled'}
        />
      </div>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        role="alertdialog"
        title="ยกเลิกการวิเคราะห์?"
        description="ระบบจะหยุดและไม่คิดผลลัพธ์ต่อ ต้องเริ่มใหม่หากต้องการผลของแบรนด์นี้"
        actions={
          <>
            <Button onClick={() => setConfirmCancel(false)} data-autofocus>
              วิเคราะห์ต่อ
            </Button>
            <Button variant="danger" loading={cancelling} onClick={() => void doCancel()}>
              ยกเลิกการวิเคราะห์
            </Button>
          </>
        }
      >
        {cancelError ? (
          <p role="alert" className="text-label text-negative">
            {cancelError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
