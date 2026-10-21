'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { FeedbackRequest, FinalResult, Recommendation } from '@cvc/schemas';
import { ApiError, agentApi } from '@/lib/api';
import { formatCompact, formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Sheet } from '@/components/ui/sheet';
import { Tabs, tabPanelProps } from '@/components/ui/tabs';
import { FitStrip } from './fit-strip';
import { TIER_LABEL } from './labels';
import { ForecastTab, NextStepsTab, OverviewTab, PlaybookTab, VideosTab } from './creator-sheet-tabs';

export type CreatorFeedbackKind = Extract<FeedbackRequest['kind'], 'shortlisted' | 'rejected'>;

const TAB_ITEMS = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'forecast', label: 'คาดการณ์' },
  { id: 'playbook', label: 'วิธีใช้งาน' },
  { id: 'next', label: 'ขั้นตอนถัดไป' },
  { id: 'videos', label: 'วิดีโอ' },
] as const;
type TabId = (typeof TAB_ITEMS)[number]['id'];
const TABS_PREFIX = 'creator-sheet';

function isTabId(id: string): id is TabId {
  return TAB_ITEMS.some((t) => t.id === id);
}

const FEEDBACK_DONE: Record<CreatorFeedbackKind, string> = {
  shortlisted: 'เพิ่มในรายชื่อแล้ว',
  rejected: 'บันทึกว่าไม่เหมาะแล้ว',
};

function CreatorSheetInner({
  rec,
  result,
  open,
  onClose,
  readOnly,
  feedback,
  onFeedback,
}: {
  rec: Recommendation | null;
  result: FinalResult;
  open: boolean;
  onClose: () => void;
  readOnly: boolean;
  feedback: CreatorFeedbackKind | undefined;
  onFeedback?: (creatorId: string, kind: CreatorFeedbackKind) => void;
}) {
  const [tab, setTab] = useState<TabId>('overview');
  const [pending, setPending] = useState<CreatorFeedbackKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!rec) return null;

  const handle = rec.handle.replace(/^@/, '');
  const creatorId = rec.creatorId;

  async function send(kind: CreatorFeedbackKind) {
    setPending(kind);
    setError(null);
    try {
      await agentApi.feedback(result.resultId, { creatorId, kind, reason: null });
      onFeedback?.(creatorId, kind);
    } catch (e) {
      setError(e instanceof ApiError ? e.messageTh : 'บันทึกความเห็นไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setPending(null);
    }
  }

  const title = (
    <div className="flex items-center gap-4 py-2">
      <CreatorAvatar src={rec.avatarUrl} handle={rec.handle} size={64} alt="" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-section font-medium text-text">@{handle}</p>
        {rec.displayName ? <p className="truncate text-label font-light text-muted">{rec.displayName}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label font-light text-muted tabular-nums">
          {rec.tier ? <Badge tone="neutral">{TIER_LABEL[rec.tier]}</Badge> : null}
          <span>{formatCompact(rec.followers)} ผู้ติดตาม</span>
          <span aria-hidden="true">·</span>
          <span>อันดับ {rec.rank}</span>
        </div>
      </div>
    </div>
  );

  const subheader = (
    <div className="px-4 pt-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FitStrip scores={rec.scores} median={rec.benchmarks.poolMedianScores} />
        <span className="text-label font-light text-muted tabular-nums">
          คะแนนรวม <span className="text-body font-normal text-text">{formatNumber(rec.scores.total)}</span>
        </span>
        {rec.addedVia === 'chat' ? <Badge tone="accent">เพิ่มจากแชท</Badge> : null}
        {rec.scores.rankStability !== null && rec.scores.rankStability >= 0.8 ? <Badge tone="positive">อันดับมั่นคง</Badge> : null}
        <span className="ml-auto">
          {result.isDemo ? (
            <Badge tone="neutral">บัญชีตัวอย่าง</Badge>
          ) : (
            <a
              href={rec.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-chip text-body font-normal text-accent hover:underline"
            >
              ดูโปรไฟล์
              <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
              <span className="sr-only">(เปิด TikTok ในแท็บใหม่)</span>
            </a>
          )}
        </span>
      </div>
      <Tabs
        className="mt-3"
        idPrefix={TABS_PREFIX}
        ariaLabel={`รายละเอียด @${handle}`}
        items={[...TAB_ITEMS]}
        value={tab}
        onChange={(id) => {
          if (isTabId(id)) setTab(id);
        }}
      />
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title} subheader={subheader}>
      <div className="flex min-h-full flex-col">
        <div {...tabPanelProps(TABS_PREFIX, tab)} className="flex-1 pb-5 focus-visible:outline-offset-4">
          {tab === 'overview' ? <OverviewTab rec={rec} evidence={result.evidence} /> : null}
          {tab === 'forecast' ? <ForecastTab rec={rec} /> : null}
          {tab === 'playbook' ? <PlaybookTab rec={rec} isDemo={result.isDemo} /> : null}
          {tab === 'next' ? <NextStepsTab rec={rec} resultId={result.resultId} readOnly={readOnly} /> : null}
          {tab === 'videos' ? <VideosTab rec={rec} isDemo={result.isDemo} /> : null}
        </div>

        {readOnly ? null : (
          <footer className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-rule bg-surface px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
            {feedback ? (
              <p role="status" className="text-label font-light text-muted">
                {FEEDBACK_DONE[feedback]}
              </p>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={pending === 'rejected'}
                disabled={pending !== null || feedback === 'rejected'}
                onClick={() => void send('rejected')}
              >
                ไม่เหมาะ
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={pending === 'shortlisted'}
                disabled={pending !== null || feedback === 'shortlisted'}
                onClick={() => void send('shortlisted')}
              >
                เพิ่มในรายชื่อ
              </Button>
            </div>
            {error ? (
              <p role="alert" className="w-full text-label font-light text-negative">
                {error}
              </p>
            ) : null}
          </footer>
        )}
      </div>
    </Sheet>
  );
}

/** Right sheet with everything about one creator (UI_CONTRACT §8 "Creator sheet"). */
export function CreatorSheet({
  rec,
  result,
  open,
  onClose,
  readOnly = false,
  feedback,
  onFeedback,
}: {
  rec: Recommendation | null;
  result: FinalResult;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
  feedback?: CreatorFeedbackKind;
  onFeedback?: (creatorId: string, kind: CreatorFeedbackKind) => void;
}) {
  // Keyed so tab and pending state reset when another creator opens.
  return (
    <CreatorSheetInner
      key={rec?.creatorId ?? 'none'}
      rec={rec}
      result={result}
      open={open && rec !== null}
      onClose={onClose}
      readOnly={readOnly}
      feedback={feedback}
      onFeedback={onFeedback}
    />
  );
}
