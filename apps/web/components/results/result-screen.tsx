'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Link2, SlidersHorizontal } from 'lucide-react';
import { ShareLink, type FinalResult, type Objective } from '@cvc/schemas';
import { ApiError, agentApi, apiFetch, systemApi } from '@/lib/api';
import { formatDateTh } from '@/lib/format';
import { localStore } from '@/lib/local-store';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DemoBanner } from '@/components/ui/demo-banner';
import { ErrorBlock } from '@/components/ui/error-block';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, tabPanelProps } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { ChatPanel } from '@/components/chat/chat-panel';
import { OBJECTIVE_LABEL } from './labels';
import { Notice } from './notice';
import { PlanPanel } from './plan-panel';
import { ResultLayout, ResultPageSkeleton } from './result-layout';
import { WeightsSheet } from './weights-sheet';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; messageTh: string }
  | { kind: 'ready'; result: FinalResult; source: 'server' | 'local' };

type Flash = { tone: 'positive' | 'negative' | 'neutral'; text: string };

const RAIL_TABS = [
  { id: 'plan', label: 'แผนงาน' },
  { id: 'chat', label: 'ถาม-ตอบ' },
] as const;
type RailTab = (typeof RAIL_TABS)[number]['id'];
const RAIL_PREFIX = 'result-rail';

function downloadJson(result: FinalResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cvc-kol-result-${result.resultId.slice(0, 8)}-v${result.version}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function savedTitle(result: FinalResult): string {
  return `${result.brand.name} · ${formatDateTh(result.generatedAt)}`;
}

/** Partial results name what is missing (UI_CONTRACT §9). */
function partialDetail(result: FinalResult): string {
  const missing: string[] = [];
  const noNarrative = result.recommendations.filter((r) => r.narrativeStatus !== 'ready').length;
  if (noNarrative > 0) missing.push(`คำอธิบายของครีเอเตอร์ ${noNarrative} คนยังไม่พร้อม`);
  if (result.evidence.length === 0) missing.push('ไม่มีแหล่งข้อมูลของแบรนด์ที่ดึงได้');
  missing.push(...result.methodology.caveatsTh.slice(0, 2));
  return missing.length > 0 ? missing.join(' · ') : 'บางขั้นตอนไม่สำเร็จ ตัวเลขบางส่วนอาจขาดหาย';
}

export function ResultScreen({ resultId }: { resultId: string }) {
  const session = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [preview, setPreview] = useState<FinalResult | null>(null);
  const [previewPreset, setPreviewPreset] = useState<Objective | null>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>('plan');
  // The chat session is only loaded once the tab is first opened, then kept mounted.
  const [chatMounted, setChatMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashTimer = useRef<number | null>(null);

  const showFlash = useCallback((f: Flash) => {
    setFlash(f);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setPreview(null);
    try {
      const result = await agentApi.getResult(resultId);
      setState({ kind: 'ready', result, source: 'server' });
    } catch (e) {
      const local = await localStore.getSavedResult(resultId).catch(() => null);
      if (local) {
        setState({ kind: 'ready', result: local, source: 'local' });
      } else {
        setState({ kind: 'error', messageTh: e instanceof ApiError ? e.messageTh : 'โหลดผลวิเคราะห์ไม่สำเร็จ' });
      }
    }
  }, [resultId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A creator added from chat (evaluate_kol) creates a new version on the server: refetch quietly.
  const refreshQuietly = useCallback(async () => {
    try {
      const result = await agentApi.getResult(resultId);
      setState({ kind: 'ready', result, source: 'server' });
      setPreview(null);
    } catch {
      // keep what is on screen
    }
  }, [resultId]);

  const result = state.kind === 'ready' ? state.result : null;
  const displayed = preview ?? result;
  const baseRanks = useMemo(
    () => (preview && result ? new Map(result.recommendations.map((r) => [r.creatorId, r.rank] as const)) : null),
    [preview, result],
  );

  if (state.kind === 'loading') return <ResultPageSkeleton />;
  if (state.kind === 'error' || !result || !displayed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="ผลวิเคราะห์" />
        <ErrorBlock messageTh={state.kind === 'error' ? state.messageTh : 'โหลดผลวิเคราะห์ไม่สำเร็จ'} onRetry={() => void load()} />
      </div>
    );
  }

  const isLocal = state.source === 'local';
  const isGuest = session.status !== 'line';

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      if (session.status === 'line') {
        await systemApi.saveResult({ resultId: result.resultId, title: savedTitle(result), note: null, tags: [] });
        showFlash({ tone: 'positive', text: 'บันทึกผลแล้ว ดูได้ที่หน้า ที่บันทึกไว้' });
      } else {
        await localStore.saveResult(result, savedTitle(result));
        showFlash({ tone: 'positive', text: 'บันทึกไว้ในเบราว์เซอร์นี้แล้ว · เข้าสู่ระบบด้วย LINE เพื่อเก็บไว้ถาวร' });
      }
    } catch (e) {
      const text = e instanceof ApiError ? e.messageTh : e instanceof Error && e.message ? e.message : 'บันทึกไม่สำเร็จ ลองอีกครั้ง';
      showFlash({ tone: 'negative', text });
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    if (!result) return;
    setSharing(true);
    try {
      const link = await apiFetch(`/api/results/${encodeURIComponent(result.resultId)}/share`, {
        method: 'POST',
        json: { expiresInDays: 7 },
        schema: ShareLink,
      });
      try {
        await navigator.clipboard.writeText(link.url);
        showFlash({ tone: 'positive', text: `คัดลอกลิงก์แชร์แล้ว ใช้ได้ถึง ${formatDateTh(link.expiresAt)}` });
      } catch {
        showFlash({ tone: 'neutral', text: `ลิงก์แชร์: ${link.url}` });
      }
    } catch (e) {
      const unavailable = e instanceof ApiError && (e.status === 404 || e.status === 501);
      showFlash({
        tone: 'negative',
        text: unavailable ? 'การแชร์ยังไม่เปิดใช้งานในระบบนี้' : e instanceof ApiError ? e.messageTh : 'สร้างลิงก์แชร์ไม่สำเร็จ',
      });
    } finally {
      setSharing(false);
    }
  }

  async function saveVersion() {
    if (!preview) return;
    setSavingVersion(true);
    setVersionError(null);
    try {
      // Weights alone would be saved under the stored preset's label, so a preset preview is saved by name.
      const res = await agentApi.rescore(
        resultId,
        previewPreset ? { preset: previewPreset, save: true } : { weights: preview.methodology.weights, save: true },
      );
      setState({ kind: 'ready', result: res.result, source: 'server' });
      setPreview(null);
      showFlash({ tone: 'positive', text: `บันทึกเป็นเวอร์ชัน ${res.result.version} แล้ว` });
    } catch (e) {
      setVersionError(e instanceof ApiError ? e.messageTh : 'บันทึกเวอร์ชันใหม่ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSavingVersion(false);
    }
  }

  const shareButton = (
    <Button variant="secondary" onClick={() => void share()} loading={sharing} disabled={isGuest || isLocal || session.status === 'loading'}>
      <Link2 aria-hidden="true" size={16} strokeWidth={1.5} />
      แชร์
    </Button>
  );
  const shareReason = isLocal
    ? 'แชร์ได้เฉพาะผลวิเคราะห์ที่ยังอยู่บนเซิร์ฟเวอร์'
    : isGuest
      ? 'เข้าสู่ระบบด้วย LINE เพื่อแชร์ผลลัพธ์'
      : null;

  // The LINE in-app browser cannot save a blob download (DESIGN §10), so export is disabled there with the reason.
  const exportButton = (
    <Button variant="secondary" onClick={() => downloadJson(result)} disabled={session.isLiff}>
      <Download aria-hidden="true" size={16} strokeWidth={1.5} />
      ส่งออก
    </Button>
  );
  const exportReason = session.isLiff ? 'ส่งออกไฟล์ในแอป LINE ไม่ได้ เปิดหน้านี้ในเบราว์เซอร์เพื่อส่งออก' : null;

  const actions = (
    <>
      {shareReason ? (
        <Tooltip content={shareReason}>
          <span tabIndex={0} aria-label={`แชร์: ${shareReason}`} className="inline-flex rounded-control">
            {shareButton}
          </span>
        </Tooltip>
      ) : (
        shareButton
      )}
      {exportReason ? (
        <Tooltip content={exportReason}>
          <span tabIndex={0} aria-label={`ส่งออก: ${exportReason}`} className="inline-flex rounded-control">
            {exportButton}
          </span>
        </Tooltip>
      ) : (
        exportButton
      )}
      <Button
        variant="primary"
        onClick={() => void save()}
        loading={saving}
        disabled={isLocal || session.status === 'loading'}
      >
        บันทึกผล
      </Button>
    </>
  );

  return (
    <div className="flex flex-col">
      {displayed.isDemo ? <DemoBanner /> : null}

      <PageHeader
        title={displayed.brand.name}
        description={displayed.headlineTh}
        actions={actions}
        className="mb-2!"
      />
      <p className="mb-4 text-meta text-muted">
        เวอร์ชัน {displayed.version} · สร้างเมื่อ {formatDateTh(displayed.generatedAt, { withTime: true })} · เป้าหมาย{' '}
        {OBJECTIVE_LABEL[displayed.brief.objective]}
      </p>

      <div aria-live="polite" className="empty:hidden mb-4">
        {flash ? (
          <p
            role="status"
            className={
              flash.tone === 'positive'
                ? 'rounded-control bg-positive-soft px-3 py-2 text-label text-positive'
                : flash.tone === 'negative'
                  ? 'rounded-control bg-negative-soft px-3 py-2 text-label text-negative'
                  : 'rounded-control bg-raised px-3 py-2 text-label text-text [overflow-wrap:anywhere]'
            }
          >
            {flash.text}
          </p>
        ) : null}
      </div>

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {isLocal ? (
          <Notice tone="neutral" title="แสดงสำเนาที่บันทึกไว้ในเบราว์เซอร์นี้">
            โหลดผลวิเคราะห์จากเซิร์ฟเวอร์ไม่ได้ (อาจหมดอายุแล้ว) แชท การปรับน้ำหนัก และการแชร์จึงใช้ไม่ได้
          </Notice>
        ) : null}
        {displayed.isPartial ? (
          <Notice tone="warning" title="ผลวิเคราะห์บางส่วน" role="note">
            {partialDetail(displayed)}
          </Notice>
        ) : null}
        {displayed.redactedCreators > 0 ? (
          <Notice tone="neutral" title={`${displayed.redactedCreators} ครีเอเตอร์ถูกนำออกจากผลลัพธ์นี้ตามคำขอของเจ้าของข้อมูล`} role="note" />
        ) : null}
        {preview ? (
          <Notice
            tone="accent"
            title="จัดอันดับใหม่ด้วยสูตร (ยังไม่บันทึก)"
            actions={
              <>
                <Button variant="tertiary" size="sm" onClick={() => setPreview(null)} disabled={savingVersion}>
                  กลับค่าเดิม
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void saveVersion()} loading={savingVersion}>
                  บันทึกเป็นเวอร์ชันใหม่
                </Button>
              </>
            }
          >
            {versionError ?? 'อันดับและตัวเลขด้านล่างคำนวณจากน้ำหนักที่ปรับ ผลวิเคราะห์ที่บันทึกไว้ยังไม่เปลี่ยน'}
          </Notice>
        ) : null}
      </div>

      <ResultLayout
        result={displayed}
        readOnly={isLocal}
        baseRanks={baseRanks}
        isPreview={preview !== null}
        methodologyAction={
          isLocal ? undefined : (
            <Button variant="tertiary" size="sm" onClick={() => setWeightsOpen(true)}>
              <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.5} />
              ปรับน้ำหนัก
            </Button>
          )
        }
        rail={
          <div className="flex flex-col gap-3">
            <Tabs
              idPrefix={RAIL_PREFIX}
              ariaLabel="แผนงานและถาม-ตอบ"
              items={[...RAIL_TABS]}
              value={railTab}
              onChange={(id) => {
                const next: RailTab = id === 'chat' ? 'chat' : 'plan';
                setRailTab(next);
                if (next === 'chat') setChatMounted(true);
              }}
            />
            <Card {...tabPanelProps(RAIL_PREFIX, 'plan')} hidden={railTab !== 'plan'}>
              <PlanPanel result={displayed} readOnly={isLocal} />
            </Card>
            {/* Kept mounted while hidden so a streaming answer survives a tab switch. */}
            <Card {...tabPanelProps(RAIL_PREFIX, 'chat')} hidden={railTab !== 'chat'}>
              {chatMounted ? (
                <ChatPanel
                  resultId={result.resultId}
                  disabledReason={isLocal ? 'แชทใช้ได้เฉพาะผลวิเคราะห์ที่ยังอยู่บนเซิร์ฟเวอร์' : null}
                  onResultChanged={() => void refreshQuietly()}
                />
              ) : null}
            </Card>
          </div>
        }
      />

      {isLocal ? null : (
        <WeightsSheet
          open={weightsOpen}
          onClose={() => setWeightsOpen(false)}
          resultId={result.resultId}
          current={displayed.methodology}
          onPreview={(next, preset) => {
            setPreview(next);
            setPreviewPreset(preset);
          }}
        />
      )}
    </div>
  );
}
