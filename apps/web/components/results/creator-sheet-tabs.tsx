'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import type { FinalResult, KpiRange, Recommendation } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { formatCompact, formatNumber, formatPct, formatTHBRange } from '@/lib/format';
import { AssumptionBadge, ConfidenceBadge } from './estimate-badges';
import {
  benchmarkSourceLabel,
  COLLABORATION_LABEL,
  CONFIDENCE_LABEL,
  FORMAT_LABEL,
  GROUP_LABEL,
  GROUP_ORDER,
  KPI_METHOD_LABEL,
  ROLE_LABEL,
  RUBRIC_LABEL,
  SPONSORED_SOURCE_LABEL,
  STORYLINE_FORMAT_LABEL,
  usesAssumption,
} from './labels';
import { NextActionList } from './next-actions';
import { formatBaht2, formatBaht2Range, formatHourRanges, formatScore, formatWeekdays } from './numbers';
import { cn } from '@/lib/cn';

const TH = 'h-8 px-3 text-meta font-normal text-muted bg-raised whitespace-nowrap';
const TD = 'h-10 px-3 border-b border-rule';

function SheetSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-medium text-text">{title}</h3>
        {aside ? <div className="flex flex-wrap items-center gap-1.5">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function BulletList({ items, empty }: { items: readonly string[]; empty?: string }) {
  if (items.length === 0) {
    return empty ? <p className="text-label font-light text-muted">{empty}</p> : null;
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-body font-light text-text">
      {items.map((t, i) => (
        <li key={`${i}-${t}`}>{t}</li>
      ))}
    </ul>
  );
}

function EvidenceRefs({ refs, evidence }: { refs: readonly string[]; evidence: FinalResult['evidence'] }) {
  if (refs.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {refs.map((ref) => {
        const ev = evidence.find((e) => e.ref === ref);
        const chip = 'rounded-chip bg-accent-soft px-1.5 text-meta font-normal text-accent-ink';
        return ev ? (
          <a
            key={ref}
            href={ev.url}
            target="_blank"
            rel="noopener noreferrer"
            title={ev.title}
            aria-label={`หลักฐาน ${ref}: ${ev.title} (เปิดในแท็บใหม่)`}
            className={cn(chip, 'hover:underline')}
          >
            {ref}
          </a>
        ) : (
          <span key={ref} className={chip}>
            {ref}
          </span>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// ภาพรวม

export function OverviewTab({ rec, evidence }: { rec: Recommendation; evidence: FinalResult['evidence'] }) {
  const a = rec.audience;
  const audienceParts = [
    a.thaiShare !== null ? `ผู้ชมไทย ${formatPct(a.thaiShare, 0)}` : null,
    a.ageTop.length > 0 ? `อายุ ${a.ageTop.join(', ')}` : null,
    a.femaleShare !== null ? `ผู้หญิง ${formatPct(a.femaleShare, 0)}` : null,
  ].filter((p): p is string => p !== null);

  return (
    <div className="flex flex-col gap-6">
      <SheetSection title="ทำไมถึงเหมาะ">
        {rec.narrativeStatus !== 'ready' ? (
          <p className="rounded-control bg-raised px-3 py-2 text-label font-light text-muted">
            ยังไม่มีคำอธิบายจาก AI สำหรับครีเอเตอร์นี้ อันดับคำนวณจากคะแนนที่มีอยู่
          </p>
        ) : null}
        {rec.whyMatchTh.length > 0 ? (
          <ul className="list-disc space-y-1.5 pl-5 text-body font-light text-text">
            {rec.whyMatchTh.map((w, i) => (
              <li key={`${i}-${w.text}`}>
                {w.text}
                <EvidenceRefs refs={w.evidenceRefs} evidence={evidence} />
              </li>
            ))}
          </ul>
        ) : null}
      </SheetSection>

      <SheetSection title="ความเสี่ยง">
        {rec.risksTh.length > 0 || rec.suspectedInjection ? (
          <ul className="flex flex-col gap-1.5">
            {rec.suspectedInjection ? (
              <li className="rounded-control bg-warning-soft px-3 py-2 text-label font-light text-warning">
                ตรวจพบข้อความแปลกในคำอธิบายโปรไฟล์ ระบบไม่ได้ใช้ข้อความนั้นในการประเมิน
              </li>
            ) : null}
            {rec.risksTh.map((r, i) => (
              <li key={`${i}-${r}`} className="rounded-control bg-warning-soft px-3 py-2 text-label font-light text-text">
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-label font-light text-muted">ไม่พบความเสี่ยงที่ควรระวังเป็นพิเศษ</p>
        )}
      </SheetSection>

      <SheetSection title="คะแนนรายกลุ่ม" aside={<span className="text-label font-light text-muted tabular-nums">รวม {formatNumber(rec.scores.total)}</span>}>
        <table className="w-full text-body font-light">
          <thead>
            <tr>
              <th scope="col" className={cn(TH, 'rounded-l-chip text-left')}>กลุ่ม</th>
              <th scope="col" className={cn(TH, 'text-right')}>คะแนน</th>
              <th scope="col" className={cn(TH, 'rounded-r-chip text-right')}>มัธยฐานของกลุ่มที่ประเมิน</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {GROUP_ORDER.map((g) => (
              <tr key={g}>
                <th scope="row" className={cn(TD, 'text-left font-light')}>{GROUP_LABEL[g]}</th>
                <td className={cn(TD, 'text-right font-normal')}>{formatScore(rec.scores[g])}</td>
                <td className={cn(TD, 'text-right text-muted')}>{formatScore(rec.benchmarks.poolMedianScores[g])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rec.scores.missingFeatures.length > 0 ? (
          <p className="text-meta font-light text-muted">
            ยังไม่มีข้อมูล {rec.scores.missingFeatures.join(', ')} คะแนนคำนวณจากข้อมูลที่มี
          </p>
        ) : null}
      </SheetSection>

      <SheetSection title="เกณฑ์การประเมินคอนเทนต์">
        {rec.rubric.length > 0 ? (
          <table className="w-full text-body font-light">
            <thead>
              <tr>
                <th scope="col" className={cn(TH, 'rounded-l-chip text-left')}>เกณฑ์</th>
                <th scope="col" className={cn(TH, 'text-right')}>คะแนน (0–2)</th>
                <th scope="col" className={cn(TH, 'rounded-r-chip text-left')}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {rec.rubric.map((r) => (
                <tr key={r.criterion} className="align-top">
                  <th scope="row" className="border-b border-rule px-3 py-2 text-left font-light">{RUBRIC_LABEL[r.criterion]}</th>
                  <td className="border-b border-rule px-3 py-2 text-right font-normal tabular-nums">{r.score}</td>
                  <td className="border-b border-rule px-3 py-2 text-label text-muted">{r.noteTh || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-label font-light text-muted">ยังไม่มีผลประเมินตามเกณฑ์สำหรับครีเอเตอร์นี้</p>
        )}
      </SheetSection>

      <SheetSection title="กลุ่มผู้ชม (ค่าประมาณ)" aside={<ConfidenceBadge confidence={a.confidence} />}>
        <p className="text-body font-light text-text">
          {audienceParts.length > 0 ? audienceParts.join(' · ') : 'ยังไม่มีข้อมูลกลุ่มผู้ชม'}
        </p>
        {a.sampleSize !== null ? (
          <p className="text-meta font-light text-muted">
            ประมาณจากคอมเมนต์ {formatNumber(a.sampleSize)} รายการ · ความมั่นใจ{CONFIDENCE_LABEL[a.confidence]}
          </p>
        ) : null}
      </SheetSection>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// คาดการณ์

function KpiRow({ label, range, unit }: { label: string; range: KpiRange; unit: string }) {
  return (
    <tr>
      <th scope="row" className={cn(TD, 'text-left font-light')}>
        {label}
      </th>
      <td className={cn(TD, 'text-right')}>{formatNumber(range.p25)}</td>
      <td className={cn(TD, 'text-right font-normal')}>{formatNumber(range.p50)}</td>
      <td className={cn(TD, 'text-right')}>{formatNumber(range.p75)}</td>
      <td className={cn(TD, 'pl-0 text-left text-meta text-muted')}>{unit}</td>
    </tr>
  );
}

export function ForecastTab({ rec }: { rec: Recommendation }) {
  const k = rec.expectedKpis;
  const b = k.basis;
  const assumption = usesAssumption(k);

  return (
    <div className="flex flex-col gap-6">
      <SheetSection
        title="ผลลัพธ์คาดการณ์ต่อโพสต์"
        aside={
          <>
            <ConfidenceBadge confidence={k.confidence} />
            {assumption ? <AssumptionBadge note={b.notesTh.join(' ') || undefined} /> : null}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-body font-light">
            <caption className="sr-only">ผลลัพธ์คาดการณ์ต่อโพสต์ ช่วงต่ำ กลาง สูง</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(TH, 'rounded-l-chip text-left')}>ตัวชี้วัด</th>
                <th scope="col" className={cn(TH, 'text-right')}>ต่ำ (p25)</th>
                <th scope="col" className={cn(TH, 'text-right')}>กลาง (p50)</th>
                <th scope="col" className={cn(TH, 'text-right')}>สูง (p75)</th>
                <th scope="col" className={cn(TH, 'rounded-r-chip pl-0')}>
                  <span className="sr-only">หน่วย</span>
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <KpiRow label="ยอดวิว" range={k.perPost.views} unit="วิว" />
              <KpiRow label="การมีส่วนร่วม" range={k.perPost.engagements} unit="ครั้ง" />
              {k.conversion ? (
                <>
                  <KpiRow label="คลิก" range={k.conversion.clicks} unit="ครั้ง" />
                  <KpiRow label="คำสั่งซื้อ" range={k.conversion.orders} unit="รายการ" />
                </>
              ) : null}
            </tbody>
          </table>
        </div>
      </SheetSection>

      <SheetSection title="ต้นทุน">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 text-body font-light">
          <dt className="border-b border-rule py-2 text-muted">ค่าตัวต่อโพสต์ (โดยประมาณ)</dt>
          <dd className="border-b border-rule py-2 text-right tabular-nums">{formatTHBRange(k.cost.feeTHB)}</dd>
          <dt className="border-b border-rule py-2 text-muted">ต้นทุนต่อวิว (CPV)</dt>
          <dd className="border-b border-rule py-2 text-right tabular-nums">
            {k.cost.cpv ? (
              <>
                {formatBaht2Range(k.cost.cpv)}
                <span className="block text-meta text-muted">กลาง {formatBaht2(k.cost.cpv.p50)}</span>
              </>
            ) : (
              '–'
            )}
          </dd>
          <dt className="border-b border-rule py-2 text-muted">ต้นทุนต่อการมีส่วนร่วม (CPE)</dt>
          <dd className="border-b border-rule py-2 text-right tabular-nums">{formatBaht2(k.cost.cpe)}</dd>
          <dt className="py-2 text-muted">อัตราการมีส่วนร่วมต่อวิว (ER)</dt>
          <dd className="py-2 text-right tabular-nums">{formatPct(k.perPost.erViews)}</dd>
        </dl>
      </SheetSection>

      <SheetSection title="ที่มาของตัวเลข">
        <div className="flex flex-col gap-2 text-body font-light text-text">
          <p>
            {KPI_METHOD_LABEL[b.method]} วิเคราะห์จากคลิป {formatNumber(b.videosAnalyzed)} คลิปในช่วง {formatNumber(b.windowDays)} วัน
            (เป็นคลิปที่มีสปอนเซอร์ {formatNumber(b.sponsoredVideosAnalyzed)} คลิป) ปรับยอดวิวสำหรับโพสต์ที่มีสปอนเซอร์ด้วยตัวคูณ ×
            {formatNumber(b.sponsoredFactor, 2)} {SPONSORED_SOURCE_LABEL[b.sponsoredFactorSource]}
          </p>
          {k.conversion ? (
            <p>
              คลิกและคำสั่งซื้อใช้อัตราคลิก {formatPct(k.conversion.assumptions.ctr, 2)} และอัตราการซื้อ{' '}
              {formatPct(k.conversion.assumptions.cvr, 2)} ({benchmarkSourceLabel(k.conversion.assumptions.source)})
            </p>
          ) : null}
          {b.benchmarkSources.length > 0 ? (
            <p className="text-label text-muted">
              ค่าอ้างอิงที่ใช้: {b.benchmarkSources.map(benchmarkSourceLabel).join(', ')}
            </p>
          ) : null}
          <BulletList items={b.notesTh} />
        </div>
      </SheetSection>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// วิธีใช้งาน

export function PlaybookTab({ rec, isDemo }: { rec: Recommendation; isDemo: boolean }) {
  const p = rec.playbook;
  const s = rec.storyline;
  return (
    <div className="flex flex-col gap-6">
      <SheetSection title="บทบาทในแคมเปญ" aside={<Badge tone="accent">{ROLE_LABEL[p.role]}</Badge>}>
        <p className="text-body font-light text-text">{p.roleReasonTh}</p>
      </SheetSection>

      <SheetSection title="รูปแบบคอนเทนต์ที่แนะนำ">
        {p.recommendedFormats.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {p.recommendedFormats.map((f) => (
              <li key={f}>
                <Badge tone="neutral">{FORMAT_LABEL[f]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-label font-light text-muted">ยังไม่มีคำแนะนำ</p>
        )}
      </SheetSection>

      <SheetSection title="ช่วงเวลาโพสต์">
        {p.postingWindow ? (
          <div className="flex flex-col gap-1 text-body font-light">
            <p>
              <span className="text-muted">วัน </span>
              {formatWeekdays(p.postingWindow.bestDays) || '–'}
              <span className="text-muted"> · เวลา </span>
              <span className="tabular-nums">{formatHourRanges(p.postingWindow.bestHours) || '–'}</span>
            </p>
            <p className="text-label text-muted">{p.postingWindow.basisTh}</p>
          </div>
        ) : (
          <p className="text-label font-light text-muted">คลิปที่มีวันเวลาโพสต์ยังไม่พอสำหรับแนะนำช่วงเวลา</p>
        )}
      </SheetSection>

      <SheetSection title="รูปแบบความร่วมมือ" aside={<Badge tone="neutral">{COLLABORATION_LABEL[p.collaborationModel]}</Badge>}>
        <p className="text-body font-light text-text">{p.collaborationNoteTh}</p>
      </SheetSection>

      <SheetSection title="มุมคอนเทนต์">
        <BulletList items={[...p.contentAnglesTh, ...rec.pitchAnglesTh]} empty="ยังไม่มีคำแนะนำ" />
      </SheetSection>

      <SheetSection title="บรีฟ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-control border border-border p-3">
            <h4 className="text-label font-normal text-positive">ควรทำ</h4>
            <div className="mt-1">
              <BulletList items={p.briefDosTh} empty="–" />
            </div>
          </div>
          <div className="rounded-control border border-border p-3">
            <h4 className="text-label font-normal text-negative">ไม่ควรทำ</h4>
            <div className="mt-1">
              <BulletList items={p.briefDontsTh} empty="–" />
            </div>
          </div>
        </div>
      </SheetSection>

      <SheetSection title="การเจรจา">
        <BulletList items={p.negotiationTh} empty="ยังไม่มีคำแนะนำ" />
      </SheetSection>

      <SheetSection title="ความเสี่ยงและวิธีรับมือ">
        {p.riskMitigations.length > 0 ? (
          <table className="w-full text-body font-light">
            <thead>
              <tr>
                <th scope="col" className={cn(TH, 'w-1/2 rounded-l-chip text-left')}>ความเสี่ยง</th>
                <th scope="col" className={cn(TH, 'rounded-r-chip text-left')}>วิธีรับมือ</th>
              </tr>
            </thead>
            <tbody>
              {p.riskMitigations.map((r, i) => (
                <tr key={`${i}-${r.riskTh}`} className="align-top">
                  <td className="border-b border-rule px-3 py-2">{r.riskTh}</td>
                  <td className="border-b border-rule px-3 py-2">{r.mitigationTh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-label font-light text-muted">ไม่มีความเสี่ยงที่ต้องวางแผนรับมือเป็นพิเศษ</p>
        )}
      </SheetSection>

      <SheetSection
        title="ไอเดียคอนเทนต์"
        aside={s ? <Badge tone="neutral">{isDemo ? 'ข้อความตัวอย่างจากเทมเพลต' : 'ร่างโดย AI ควรตรวจก่อนใช้'}</Badge> : undefined}
      >
        {s ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-body font-light sm:grid-cols-[120px_1fr]">
            <dt className="text-muted">แนวคิด</dt>
            <dd>{s.conceptTh}</dd>
            <dt className="text-muted">ฮุก 3 วินาทีแรก</dt>
            <dd>{s.hookTh}</dd>
            <dt className="text-muted">รูปแบบ</dt>
            <dd>{STORYLINE_FORMAT_LABEL[s.format]}</dd>
            <dt className="text-muted">คำชวน (CTA)</dt>
            <dd>{s.ctaTh}</dd>
            <dt className="text-muted">ตัวอย่างแคปชัน</dt>
            <dd className="whitespace-pre-line rounded-control bg-raised px-3 py-2">{s.sampleCaptionTh}</dd>
            <dt className="text-muted">การเปิดเผยโฆษณา</dt>
            <dd>{s.disclosure}</dd>
          </dl>
        ) : (
          <p className="text-label font-light text-muted">ยังไม่มีไอเดียคอนเทนต์สำหรับครีเอเตอร์นี้</p>
        )}
      </SheetSection>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// ขั้นตอนถัดไป

export function NextStepsTab({ rec, resultId, readOnly }: { rec: Recommendation; resultId: string; readOnly: boolean }) {
  return <NextActionList actions={rec.nextActions} resultId={resultId} readOnly={readOnly} groupByOwner={false} />;
}

// ---------------------------------------------------------------------------------------------
// วิดีโอ

export function VideosTab({ rec, isDemo }: { rec: Recommendation; isDemo: boolean }) {
  if (rec.topVideos.length === 0) {
    return <p className="text-label font-light text-muted">ยังไม่มีคลิปเด่นสำหรับครีเอเตอร์นี้</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rec.topVideos.map((v, i) => (
        <li key={`${i}-${v.url}`} className="flex gap-3 rounded-card border border-border p-3">
          <div className="relative h-[128px] w-[72px] shrink-0 overflow-hidden rounded-control bg-raised">
            {v.coverUrl ? (
              <Image src={v.coverUrl} alt="" fill sizes="72px" className="object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-meta font-light text-muted">
                ไม่มีภาพปก
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-body font-normal tabular-nums text-text">
              {v.views !== null ? `${formatCompact(v.views)} วิว` : 'ไม่มีข้อมูลยอดวิว'}
            </p>
            <p className="text-label font-light text-muted">{v.whyTh}</p>
            {isDemo ? (
              <span className="mt-auto">
                <Badge tone="neutral">คลิปตัวอย่าง</Badge>
              </span>
            ) : (
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center gap-1 self-start rounded-chip text-label font-normal text-accent hover:underline"
              >
                ดูคลิปบน TikTok
                <ExternalLink aria-hidden="true" size={14} strokeWidth={1.5} />
                <span className="sr-only">(เปิดในแท็บใหม่)</span>
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
