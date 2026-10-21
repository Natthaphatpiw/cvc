'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  PERSONAS_SEED,
  RunInput,
  type AudiencePersona,
  type Objective,
  type RunAsset,
  type RunInputDraft,
  type VoiceTranscript,
} from '@cvc/schemas';
import { agentApi, errorMessageTh, systemApi } from '@/lib/api';
import { NOTICE_TEXT_TH, NOTICE_VERSION } from '@/lib/config';
import { formatNumber } from '@/lib/format';
import { localStore } from '@/lib/local-store';
import { useSession } from '@/lib/session';
import { probeUploads, type UploadAvailability } from '@/lib/uploads';
import { MAX_PERSONAS, PersonaPicker } from '@/components/new/persona-picker';
import { OBJECTIVES, ObjectiveControl, objectiveLabel } from '@/components/new/objective-control';
import { ScreenshotUploader } from '@/components/new/screenshot-uploader';
import { VoiceInput, type VoiceValue } from '@/components/new/voice-input';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { ErrorBlock } from '@/components/ui/error-block';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

type FieldKey = 'companyName' | 'websiteUrl' | 'facebookUrl' | 'tiktokUrl' | 'audienceNotes' | 'budget';
type Errors = Partial<Record<FieldKey, string>>;

const FIELD_IDS: Record<FieldKey, string> = {
  companyName: 'new-company-name',
  websiteUrl: 'new-website',
  facebookUrl: 'new-facebook',
  tiktokUrl: 'new-tiktok',
  audienceNotes: 'new-audience-notes',
  budget: 'new-budget-min',
};

const FIELD_ORDER: FieldKey[] = ['companyName', 'websiteUrl', 'facebookUrl', 'tiktokUrl', 'audienceNotes', 'budget'];

type UrlKind = 'website' | 'facebook' | 'tiktok';

/** Accepts bare domains and TikTok @handles; returns an absolute URL or null for an empty field. */
function normalizeUrl(raw: string, kind: UrlKind): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (kind === 'tiktok' && /^@?[A-Za-z0-9._]{2,24}$/.test(v) && !v.includes('.com')) {
    return `https://www.tiktok.com/@${v.replace(/^@/, '')}`;
  }
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function urlError(value: string | null, kind: UrlKind): string | null {
  if (!value) return null;
  let host: string;
  try {
    const u = new URL(value);
    host = u.hostname.toLowerCase();
    if (!host.includes('.')) return 'ลิงก์ไม่ถูกต้อง';
  } catch {
    return 'ลิงก์ไม่ถูกต้อง';
  }
  if (kind === 'facebook' && !/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'ลิงก์นี้ไม่ใช่หน้า Facebook';
  if (kind === 'tiktok' && !/(^|\.)tiktok\.com$/.test(host)) return 'ลิงก์นี้ไม่ใช่โปรไฟล์ TikTok';
  return null;
}

function parseBaht(raw: string): number | null | 'invalid' {
  const v = raw.replace(/[,\s฿]/g, '');
  if (!v) return null;
  if (!/^\d+(\.\d+)?$/.test(v)) return 'invalid';
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 'invalid';
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <SectionHeading id={id} title={title} />
      <Card>{children}</Card>
    </section>
  );
}

export function NewAnalysisForm() {
  const router = useRouter();
  const toast = useToast();
  const { status, isLiff } = useSession();
  const objectiveLabelId = useId();
  const objectiveHintId = useId();

  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [audienceNotes, setAudienceNotes] = useState('');
  const [objective, setObjective] = useState<Objective>('conversion');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [nCreators, setNCreators] = useState(5);
  const [shots, setShots] = useState<{ assets: RunAsset[]; uploading: boolean }>({ assets: [], uploading: false });
  const [voice, setVoice] = useState<VoiceValue>({ asset: null, transcript: null, busy: false });

  const [personas, setPersonas] = useState<AudiencePersona[] | null>(null);
  const [uploads, setUploads] = useState<UploadAvailability | 'checking'>('checking');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    systemApi
      .personas()
      .then((r) => (r.personas.length > 0 ? r.personas : PERSONAS_SEED))
      .catch(() => PERSONAS_SEED)
      .then((list) => {
        if (active) setPersonas(list);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    void probeUploads().then((a) => {
      if (active) setUploads(a);
    });
    return () => {
      active = false;
    };
  }, [status]);

  const onShots = useCallback((s: { assets: RunAsset[]; uploading: boolean }) => setShots(s), []);
  const onVoice = useCallback((v: VoiceValue) => setVoice(v), []);

  const clearError = (key: FieldKey) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const togglePersona = (id: string) => {
    setPersonaIds((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_PERSONAS ? list : [...list, id],
    );
  };

  const busyUploading = shots.uploading || voice.busy;
  const hasContext =
    !!websiteUrl.trim() || !!facebookUrl.trim() || !!tiktokUrl.trim() || shots.assets.length > 0 || !!voice.asset;

  function buildDraft(): { draft: RunInputDraft | null; errors: Errors } {
    const errs: Errors = {};
    const name = companyName.trim();
    if (!name) errs.companyName = 'กรอกชื่อแบรนด์หรือบริษัท';

    const website = normalizeUrl(websiteUrl, 'website');
    const facebook = normalizeUrl(facebookUrl, 'facebook');
    const tiktok = normalizeUrl(tiktokUrl, 'tiktok');
    const we = urlError(website, 'website');
    const fe = urlError(facebook, 'facebook');
    const te = urlError(tiktok, 'tiktok');
    if (we) errs.websiteUrl = we;
    if (fe) errs.facebookUrl = fe;
    if (te) errs.tiktokUrl = te;

    if (audienceNotes.length > 2000) errs.audienceNotes = 'ยาวเกิน 2,000 ตัวอักษร';

    const min = parseBaht(budgetMin);
    const max = parseBaht(budgetMax);
    let budgetTHB: { min: number; max: number } | null = null;
    if (min === 'invalid' || max === 'invalid') errs.budget = 'กรอกงบเป็นตัวเลข';
    else if (min !== null && max === null) errs.budget = 'กรอกงบสูงสุดด้วย';
    else if (max !== null) {
      const lo = min ?? 0;
      if (lo > max) errs.budget = 'งบต่ำสุดต้องไม่มากกว่างบสูงสุด';
      else budgetTHB = { min: lo, max };
    }

    const voiceTranscripts: VoiceTranscript[] = voice.transcript ? [voice.transcript] : [];
    const draft: RunInputDraft = {
      companyName: name,
      websiteUrl: website,
      facebookUrl: facebook,
      tiktokUrl: tiktok,
      personaIds,
      audienceNotes: audienceNotes.trim() || null,
      assets: [...shots.assets, ...(voice.asset ? [voice.asset] : [])],
      voiceTranscripts,
      campaign: { objective, budgetTHB, nCreators, preferredTiers: [] },
      channel: isLiff ? 'liff' : 'web',
      noticeVersion: NOTICE_VERSION,
    };

    const parsed = RunInput.safeParse(draft);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const head = issue.path[0];
        if (head === 'companyName') errs.companyName ??= 'กรอกชื่อแบรนด์ไม่เกิน 200 ตัวอักษร';
        else if (head === 'websiteUrl') errs.websiteUrl ??= 'ลิงก์ไม่ถูกต้อง';
        else if (head === 'facebookUrl') errs.facebookUrl ??= 'ลิงก์ไม่ถูกต้อง';
        else if (head === 'tiktokUrl') errs.tiktokUrl ??= 'ลิงก์ไม่ถูกต้อง';
        else if (head === 'audienceNotes') errs.audienceNotes ??= 'ยาวเกิน 2,000 ตัวอักษร';
        else if (head === 'campaign') errs.budget ??= 'ตรวจงบและจำนวนครีเอเตอร์อีกครั้ง';
      }
      if (Object.keys(errs).length === 0) return { draft: null, errors: { companyName: 'ข้อมูลบางส่วนไม่ถูกต้อง' } };
    }
    return { draft: Object.keys(errs).length === 0 ? draft : null, errors: errs };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || busyUploading) return;
    setSubmitError(null);
    const { draft, errors: errs } = buildDraft();
    setErrors(errs);
    if (!draft) {
      const first = FIELD_ORDER.find((k) => errs[k]);
      if (first) document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await agentApi.createRun(draft);
      // A deduped answer has claimSecret null: keep the secret stored for that run, or it can never be claimed.
      const prev = await localStore.getRun(res.runId);
      await localStore.putRun({
        runId: res.runId,
        companyName: draft.companyName,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
        claimSecret: res.claimSecret ?? prev?.claimSecret ?? null,
        resultId: prev?.resultId ?? null,
        status: res.status,
        input: draft,
      });
      if (res.deduped) toast.show('พบการวิเคราะห์เดียวกันที่ทำไว้แล้ว เปิดผลเดิมให้แทน');
      router.push(`/runs/${encodeURIComponent(res.runId)}`);
    } catch (err) {
      setSubmitError(errorMessageTh(err));
      setSubmitting(false);
    }
  }

  const uploadsUnavailable = uploads === 'unavailable';
  const objectiveHint = OBJECTIVES.find((o) => o.id === objective)?.hint;
  const summary = [
    companyName.trim() || 'ยังไม่ได้กรอกชื่อแบรนด์',
    objectiveLabel(objective),
    `${nCreators} ครีเอเตอร์`,
    personaIds.length > 0 ? `${personaIds.length} กลุ่มลูกค้า` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader title="วิเคราะห์ใหม่" description="กรอกชื่อแบรนด์อย่างเดียวก็เริ่มได้ ข้อมูลยิ่งครบ ผลยิ่งตรงกับแบรนด์" />

      <form noValidate onSubmit={(e) => void onSubmit(e)}>
        <Section id="new-sec-brand" title="แบรนด์">
          <div className="grid gap-4">
            <Field label="ชื่อแบรนด์หรือบริษัท" required error={errors.companyName}>
              <Input
                id={FIELD_IDS.companyName}
                value={companyName}
                maxLength={200}
                autoComplete="organization"
                placeholder="เช่น ร้านกาแฟบ้านสวน"
                onChange={(e) => {
                  setCompanyName(e.currentTarget.value);
                  clearError('companyName');
                }}
              />
            </Field>
            <Field label="เว็บไซต์" optional error={errors.websiteUrl}>
              <Input
                id={FIELD_IDS.websiteUrl}
                type="url"
                inputMode="url"
                autoComplete="url"
                value={websiteUrl}
                placeholder="https://www.example.co.th"
                onChange={(e) => {
                  setWebsiteUrl(e.currentTarget.value);
                  clearError('websiteUrl');
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facebook" optional error={errors.facebookUrl}>
                <Input
                  id={FIELD_IDS.facebookUrl}
                  type="url"
                  inputMode="url"
                  value={facebookUrl}
                  placeholder="facebook.com/yourpage"
                  onChange={(e) => {
                    setFacebookUrl(e.currentTarget.value);
                    clearError('facebookUrl');
                  }}
                />
              </Field>
              <Field label="TikTok" optional error={errors.tiktokUrl}>
                <Input
                  id={FIELD_IDS.tiktokUrl}
                  inputMode="url"
                  value={tiktokUrl}
                  placeholder="@yourbrand"
                  onChange={(e) => {
                    setTiktokUrl(e.currentTarget.value);
                    clearError('tiktokUrl');
                  }}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section id="new-sec-audience" title="กลุ่มลูกค้า">
          <div className="grid gap-4">
            <Field
              group
              label="ลูกค้าที่อยากได้เป็นใคร (เลือกได้หลายข้อ)"
              hint={personaIds.length > 0 ? `เลือกแล้ว ${personaIds.length} กลุ่ม` : undefined}
            >
              <PersonaPicker personas={personas} selected={personaIds} onToggle={togglePersona} />
            </Field>
            <Field label="อธิบายกลุ่มลูกค้าเพิ่มเติม" optional error={errors.audienceNotes}>
              <Textarea
                id={FIELD_IDS.audienceNotes}
                rows={3}
                value={audienceNotes}
                maxLength={2000}
                placeholder="เช่น ผู้หญิงวัยทำงาน 25–34 ผิวแพ้ง่าย ซื้อของออนไลน์ช่วงเงินเดือนออก"
                onChange={(e) => {
                  setAudienceNotes(e.currentTarget.value);
                  clearError('audienceNotes');
                }}
              />
            </Field>
          </div>
        </Section>

        <Section id="new-sec-campaign" title="แคมเปญ">
          <div className="grid gap-5">
            <div>
              <p id={objectiveLabelId} className="mb-2 text-label font-normal text-text">
                เป้าหมายของแคมเปญ
              </p>
              <ObjectiveControl
                value={objective}
                onChange={setObjective}
                labelledBy={objectiveLabelId}
                describedBy={objectiveHintId}
              />
              <p id={objectiveHintId} className="mt-1.5 text-meta text-muted">
                {objectiveHint}
              </p>
            </div>

            <fieldset aria-describedby={errors.budget ? 'new-budget-error' : 'new-budget-hint'}>
              <legend className="mb-1.5 text-label font-normal text-text">
                งบประมาณรวม (บาท) <span className="font-light text-muted">(ไม่บังคับ)</span>
              </legend>
              <div className="flex items-center gap-2">
                <label htmlFor="new-budget-min" className="sr-only">
                  งบต่ำสุด
                </label>
                <div className="relative min-w-0 flex-1">
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                    ฿
                  </span>
                  <Input
                    id="new-budget-min"
                    inputMode="numeric"
                    className="num pl-7"
                    value={budgetMin}
                    placeholder="100,000"
                    aria-invalid={errors.budget ? true : undefined}
                    onChange={(e) => {
                      setBudgetMin(e.currentTarget.value);
                      clearError('budget');
                    }}
                    onBlur={() => {
                      const n = parseBaht(budgetMin);
                      if (typeof n === 'number') setBudgetMin(formatNumber(n));
                    }}
                  />
                </div>
                <span aria-hidden className="text-muted">
                  –
                </span>
                <label htmlFor="new-budget-max" className="sr-only">
                  งบสูงสุด
                </label>
                <div className="relative min-w-0 flex-1">
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                    ฿
                  </span>
                  <Input
                    id="new-budget-max"
                    inputMode="numeric"
                    className="num pl-7"
                    value={budgetMax}
                    placeholder="300,000"
                    aria-invalid={errors.budget ? true : undefined}
                    onChange={(e) => {
                      setBudgetMax(e.currentTarget.value);
                      clearError('budget');
                    }}
                    onBlur={() => {
                      const n = parseBaht(budgetMax);
                      if (typeof n === 'number') setBudgetMax(formatNumber(n));
                    }}
                  />
                </div>
              </div>
              {errors.budget ? (
                <p id="new-budget-error" className="mt-1.5 text-meta text-negative">
                  {errors.budget}
                </p>
              ) : (
                <p id="new-budget-hint" className="mt-1.5 text-meta text-muted">
                  ใช้คัดครีเอเตอร์ที่ค่าจ้างอยู่ในงบ และคำนวณว่างบพอหรือไม่
                </p>
              )}
            </fieldset>

            <Field label="จำนวนครีเอเตอร์ที่ต้องการ" hint="แนะนำ 3–5 คนสำหรับแคมเปญแรก" className="max-w-[200px]">
              <Select value={nCreators} onChange={(e) => setNCreators(Number(e.currentTarget.value))}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} คน
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section id="new-sec-files" title="ไฟล์ประกอบ">
          {uploads === 'checking' ? (
            <div className="space-y-3" aria-busy="true" aria-label="กำลังตรวจระบบอัปโหลด">
              <Skeleton className="h-24 w-full rounded-card" />
              <Skeleton className="h-9 w-56 rounded-control" />
            </div>
          ) : uploadsUnavailable ? (
            <p className="rounded-control border border-border bg-raised px-3 py-2.5 text-body text-muted">
              ระบบนี้ยังไม่ได้ตั้งค่าที่เก็บไฟล์ จึงแนบรูปและเสียงไม่ได้ในตอนนี้ เล่ารายละเอียดในช่องอธิบายกลุ่มลูกค้าแทนได้
            </p>
          ) : (
            <div className="grid gap-5">
              <div>
                <p className="mb-2 text-label font-normal text-text">
                  รูปหรือแคปหน้าจอ <span className="font-light text-muted">(ไม่บังคับ)</span>
                </p>
                <ScreenshotUploader disabled={false} onChange={onShots} />
              </div>
              <div className="border-t border-rule pt-5">
                <p className="mb-2 text-label font-normal text-text">
                  เล่าด้วยเสียง <span className="font-light text-muted">(ไม่บังคับ)</span>
                </p>
                <VoiceInput disabled={false} isLiff={isLiff} onChange={onVoice} />
              </div>
              <details className="text-meta text-muted">
                <summary className="w-max text-label text-accent hover:text-accent-ink">ไฟล์ของคุณถูกประมวลผลอย่างไร</summary>
                <p className="mt-2 max-w-prose">{NOTICE_TEXT_TH} ไฟล์ที่อัปโหลดแต่ไม่ได้ส่งวิเคราะห์จะถูกลบภายใน 24 ชั่วโมง</p>
              </details>
            </div>
          )}
        </Section>

        {submitError ? <ErrorBlock className="mb-4" messageTh={submitError} /> : null}

        <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-surface px-4 pt-3 safe-bottom sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-t-card lg:border-x lg:px-5">
          {companyName.trim() && !hasContext ? (
            <p className="mb-3 flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-label text-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              ไม่มีลิงก์ รูป หรือเสียงประกอบ ผลลัพธ์อาจตรงกับแบรนด์น้อยลง แต่ยังเริ่มวิเคราะห์ได้
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-normal text-text">{summary}</p>
              <p className="text-meta text-muted">
                {busyUploading
                  ? 'รออัปโหลดไฟล์ให้เสร็จก่อนจึงเริ่มวิเคราะห์ได้'
                  : `ใช้เวลาประมาณ 5–9 นาที · การเริ่มวิเคราะห์ถือว่ารับทราบประกาศความเป็นส่วนตัว (ฉบับ ${NOTICE_VERSION})`}
              </p>
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={busyUploading}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              เริ่มวิเคราะห์
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
