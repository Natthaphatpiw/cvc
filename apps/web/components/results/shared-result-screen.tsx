'use client';

import { useCallback, useEffect, useState } from 'react';
import { FinalResult } from '@cvc/schemas';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDateTh } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { DemoBanner } from '@/components/ui/demo-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { PageHeader } from '@/components/ui/page-header';
import { Notice } from './notice';
import { PlanPanel } from './plan-panel';
import { ResultLayout, ResultPageSkeleton } from './result-layout';

type ShareState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; messageTh: string }
  | { kind: 'ready'; result: FinalResult; expiresAt: string | null };

/** GET /api/share/:token may answer with the FinalResult itself or wrap it as { result, expiresAt }. */
function readSharePayload(data: unknown): { result: FinalResult; expiresAt: string | null } | null {
  const direct = FinalResult.safeParse(data);
  if (direct.success) return { result: direct.data, expiresAt: null };
  if (data && typeof data === 'object' && 'result' in data) {
    const inner = FinalResult.safeParse(data.result);
    if (inner.success) {
      const expiresAt = 'expiresAt' in data && typeof data.expiresAt === 'string' ? data.expiresAt : null;
      return { result: inner.data, expiresAt };
    }
  }
  return null;
}

/** Read-only result for someone who received a share link: no chat, no save, no feedback. */
export function SharedResultScreen({ token }: { token: string }) {
  const [state, setState] = useState<ShareState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await apiFetch<unknown>(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const payload = readSharePayload(data);
      setState(payload ? { kind: 'ready', ...payload } : { kind: 'error', messageTh: 'อ่านข้อมูลที่แชร์ไม่ได้ ลองเปิดลิงก์อีกครั้ง' });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 410 || e.status === 501)) {
        setState({ kind: 'unavailable' });
      } else {
        setState({ kind: 'error', messageTh: e instanceof ApiError ? e.messageTh : 'โหลดผลวิเคราะห์ไม่สำเร็จ' });
      }
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') return <ResultPageSkeleton />;

  if (state.kind === 'unavailable') {
    return (
      <EmptyState
        className="mx-auto mt-8 max-w-xl bg-surface"
        title="ลิงก์นี้หมดอายุหรือยังไม่เปิดใช้งาน"
        description="ขอลิงก์ใหม่จากผู้ที่แชร์ผลวิเคราะห์นี้ให้คุณ"
        action={
          <ButtonLink href="/new" variant="secondary">
            สร้างผลวิเคราะห์ของคุณ
          </ButtonLink>
        }
      />
    );
  }

  if (state.kind === 'error') {
    return <ErrorBlock className="mt-8" messageTh={state.messageTh} onRetry={() => void load()} />;
  }

  const { result, expiresAt } = state;
  return (
    <div className="flex flex-col">
      {result.isDemo ? <DemoBanner /> : null}
      <PageHeader
        title={result.brand.name}
        description={result.headlineTh}
        className="mb-2!"
        actions={
          <ButtonLink href="/new" variant="primary">
            สร้างผลวิเคราะห์ของคุณ
          </ButtonLink>
        }
      />
      <p className="mb-6 text-meta text-muted">
        แชร์โดยทีม Convert Cake · อ่านอย่างเดียว · ข้อมูล ณ {formatDateTh(result.methodology.dataAsOf)}
        {expiresAt ? ` · ลิงก์ใช้ได้ถึง ${formatDateTh(expiresAt)}` : ''}
      </p>

      {result.isPartial ? (
        <div className="mb-6">
          <Notice tone="warning" title="ผลวิเคราะห์บางส่วน" role="note">
            บางขั้นตอนหรือแหล่งข้อมูลไม่สำเร็จ ตัวเลขบางส่วนอาจขาดหาย
          </Notice>
        </div>
      ) : null}

      <ResultLayout
        result={result}
        readOnly
        rail={
          <section aria-labelledby="sec-plan">
            <SectionHeading id="sec-plan" title="แผนงาน" />
            <Card>
              <PlanPanel result={result} readOnly />
            </Card>
          </section>
        }
      />
    </div>
  );
}
