'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { authHeaders, errorMessageTh, systemApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { NOTICE_TEXT_TH, NOTICE_VERSION } from '@/lib/config';
import { localStore } from '@/lib/local-store';
import { useSession } from '@/lib/session';
import { LineLoginButton } from '@/components/line-login-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Dialog } from '@/components/ui/dialog';
import { ErrorBlock } from '@/components/ui/error-block';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <SectionHeading id={id} title={title} />
      <Card>{children}</Card>
    </section>
  );
}

/** A setting row: title + description on the left, control on the right. */
function Row({ title, description, control }: { title: ReactNode; description?: ReactNode; control?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-body font-normal text-text">{title}</div>
        {description ? <div className="mt-0.5 text-label text-muted">{description}</div> : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-8 shrink-0 items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-text' : 'bg-control',
      )}
    >
      <span
        aria-hidden
        className={cn('size-4 rounded-full bg-surface transition-transform duration-150', checked ? 'translate-x-3.5' : 'translate-x-0.5')}
      />
    </button>
  );
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LINE_BENEFITS = [
  'เก็บผลวิเคราะห์ไว้ถาวรและเปิดได้จากทุกอุปกรณ์',
  'แชร์ผลวิเคราะห์ให้ทีมหรือลูกค้าด้วยลิงก์',
  'ดูประวัติการวิเคราะห์ทั้งหมดในที่เดียว',
  'การวิเคราะห์ที่ทำในเบราว์เซอร์นี้ย้ายเข้าบัญชีให้อัตโนมัติ',
];

function GuestAccount() {
  const toast = useToast();
  const { canLoginWithLine, isLiff } = useSession();
  const [counts, setCounts] = useState<{ runs: number; saved: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([localStore.listRuns(), localStore.listSavedResults()]).then(([runs, saved]) => {
      if (active) setCounts({ runs: runs.length, saved: saved.length });
    });
    return () => {
      active = false;
    };
  }, []);

  const clearAll = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await localStore.clearAll();
      setCounts({ runs: 0, saved: 0 });
      setConfirmClear(false);
      toast.show('ลบข้อมูลในเบราว์เซอร์นี้แล้ว', 'positive');
    } catch (e) {
      setClearError(e instanceof Error ? e.message : errorMessageTh(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <Section id="acc-guest" title="บัญชี">
        <p className="text-body font-normal text-text">คุณใช้งานแบบผู้ใช้ทั่วไป</p>
        <p className="mt-0.5 text-label text-muted">ผลวิเคราะห์บนเซิร์ฟเวอร์เก็บไว้ 7 วัน และรายการเก็บในเบราว์เซอร์นี้เท่านั้น</p>
        <p className="mt-4 text-label font-normal text-text">เข้าสู่ระบบด้วย LINE แล้วจะได้</p>
        <ul className="mt-2 space-y-1.5">
          {LINE_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-body text-text">
              <Check aria-hidden className="mt-1 size-3.5 shrink-0 text-accent" strokeWidth={2} />
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-5">
          {canLoginWithLine ? (
            <LineLoginButton />
          ) : (
            <p className="text-label text-muted">ระบบนี้ยังไม่ได้ตั้งค่า LINE Login จึงใช้งานได้แบบผู้ใช้ทั่วไปเท่านั้น</p>
          )}
        </div>
      </Section>

      <Section id="acc-browser" title="ข้อมูลในเบราว์เซอร์นี้">
        <div className="divide-y divide-rule">
          <Row
            title="รายการที่เก็บไว้"
            description={
              counts ? (
                <span className="num">
                  การวิเคราะห์ {counts.runs} รายการ · ผลที่บันทึก {counts.saved} รายการ
                </span>
              ) : (
                <Skeleton className="mt-1 h-3.5 w-48" />
              )
            }
            control={
              !isLiff ? (
                <Button
                  size="sm"
                  onClick={() =>
                    void localStore.exportAll().then((data) => downloadJson(data, `convert-cake-influencer-${Date.now()}.json`))
                  }
                >
                  ดาวน์โหลดข้อมูล
                </Button>
              ) : undefined
            }
          />
          <Row
            title="ลบข้อมูลในเบราว์เซอร์นี้"
            description="ลบรายการการวิเคราะห์และผลที่บันทึกไว้ในเบราว์เซอร์นี้ทั้งหมด"
            control={
              <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)}>
                ลบข้อมูล
              </Button>
            }
          />
        </div>
      </Section>

      <Section id="acc-privacy" title="ความเป็นส่วนตัว">
        <p className="text-label text-muted">{NOTICE_TEXT_TH}</p>
        <p className="mt-2 text-meta text-muted">ประกาศฉบับ {NOTICE_VERSION}</p>
      </Section>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        role="alertdialog"
        title="ลบข้อมูลในเบราว์เซอร์นี้?"
        description="รายการการวิเคราะห์และผลที่บันทึกไว้ในเบราว์เซอร์นี้จะหายทั้งหมด และกู้คืนไม่ได้"
        actions={
          <>
            <Button onClick={() => setConfirmClear(false)} data-autofocus>
              ไม่ลบ
            </Button>
            <Button variant="danger" loading={clearing} onClick={() => void clearAll()}>
              ลบข้อมูล
            </Button>
          </>
        }
      >
        {clearError ? (
          <p role="alert" className="text-label text-negative">
            {clearError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

function LineAccount() {
  const router = useRouter();
  const toast = useToast();
  const { user, isLiff, refreshUser, acknowledgeNotice, logout } = useSession();
  const confirmId = useId();
  const [ackBusy, setAckBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUnderstood, setDeleteUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const oaBasicId = process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID?.trim() || null;

  if (!user) {
    return (
      <ErrorBlock
        messageTh="โหลดข้อมูลบัญชีไม่สำเร็จ"
        onRetry={() => {
          setRefreshing(true);
          void refreshUser().finally(() => setRefreshing(false));
        }}
        retryLabel={refreshing ? 'กำลังโหลด…' : 'ลองอีกครั้ง'}
      />
    );
  }

  const ack = async () => {
    setAckBusy(true);
    try {
      await acknowledgeNotice();
      toast.show('บันทึกการรับทราบแล้ว', 'positive');
    } catch (e) {
      toast.show(errorMessageTh(e), 'negative');
    } finally {
      setAckBusy(false);
    }
  };

  const setPush = async (granted: boolean) => {
    setPushBusy(true);
    try {
      await systemApi.consent({ consentType: 'push_notification', version: NOTICE_VERSION, granted });
      await refreshUser();
    } catch (e) {
      toast.show(errorMessageTh(e), 'negative');
    } finally {
      setPushBusy(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/me/export', { headers: await authHeaders(), credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      downloadJson(await res.json(), `convert-cake-influencer-${Date.now()}.json`);
    } catch {
      toast.show('ส่งออกข้อมูลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง', 'negative');
    } finally {
      setExporting(false);
    }
  };

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push('/');
    } finally {
      setLoggingOut(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await systemApi.deleteMe();
      setDeleteOpen(false);
      await logout();
      toast.show('ลบบัญชีและข้อมูลแล้ว', 'positive');
      router.push('/');
    } catch (e) {
      setDeleteError(errorMessageTh(e));
    } finally {
      setDeleting(false);
    }
  };

  const name = user.displayName ?? 'ผู้ใช้ LINE';

  return (
    <>
      <Section id="acc-profile" title="โปรไฟล์">
        <div className="flex items-center gap-4">
          <CreatorAvatar src={user.pictureUrl} handle={name} size={64} alt="" />
          <div className="min-w-0">
            <p className="truncate text-section font-medium text-text">{name}</p>
            <p className="text-label text-muted">ชื่อและรูปจากบัญชี LINE</p>
            {user.role !== 'member' ? (
              <Badge tone="accent" className="mt-1.5">
                {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'นักวางแผน Convert Cake'}
              </Badge>
            ) : null}
          </div>
        </div>
      </Section>

      <Section id="acc-line" title="การเชื่อมต่อ LINE">
        <div className="divide-y divide-rule">
          <Row
            title="เข้าสู่ระบบด้วย LINE แล้ว"
            description="ผลวิเคราะห์และรายการที่บันทึกผูกกับบัญชีนี้"
            control={
              <Button size="sm" loading={loggingOut} onClick={() => void doLogout()}>
                ออกจากระบบ
              </Button>
            }
          />
          <Row
            title="เพื่อน LINE Official Account"
            description={user.isOaFriend ? 'เพิ่มเพื่อนแล้ว' : 'ยังไม่ได้เพิ่มเพื่อน ต้องเพิ่มเพื่อนก่อนจึงจะได้รับการแจ้งเตือนทาง LINE'}
            control={
              !user.isOaFriend && oaBasicId ? (
                <a
                  href={`https://line.me/R/ti/p/${encodeURIComponent(oaBasicId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-label text-accent hover:text-accent-ink"
                >
                  เพิ่มเพื่อน
                </a>
              ) : undefined
            }
          />
          <Row
            title="แจ้งเตือนทาง LINE เมื่อผลพร้อม"
            description="ส่งข้อความเมื่อการวิเคราะห์เสร็จหรือไม่สำเร็จ"
            control={
              <Switch
                checked={user.pushOptIn}
                disabled={pushBusy}
                label="แจ้งเตือนทาง LINE เมื่อผลพร้อม"
                onChange={(v) => void setPush(v)}
              />
            }
          />
        </div>
      </Section>

      <Section id="acc-privacy" title="ความเป็นส่วนตัว">
        <div className="divide-y divide-rule">
          <Row
            title={user.needsNoticeAck ? 'ยังไม่ได้รับทราบประกาศความเป็นส่วนตัวฉบับล่าสุด' : 'รับทราบประกาศความเป็นส่วนตัวแล้ว'}
            description={
              <>
                {NOTICE_TEXT_TH}
                <span className="mt-1 block text-meta">ประกาศฉบับ {NOTICE_VERSION}</span>
              </>
            }
            control={
              user.needsNoticeAck ? (
                <Button size="sm" loading={ackBusy} onClick={() => void ack()}>
                  รับทราบ
                </Button>
              ) : undefined
            }
          />
          {!isLiff ? (
            <Row
              title="ดาวน์โหลดข้อมูลของฉัน"
              description="ไฟล์ JSON ของโปรไฟล์ ผลวิเคราะห์ และรายการที่บันทึก"
              control={
                <Button size="sm" loading={exporting} onClick={() => void exportData()}>
                  ดาวน์โหลด
                </Button>
              }
            />
          ) : null}
        </div>
      </Section>

      <section aria-labelledby="acc-danger" className="mb-6">
        <SectionHeading id="acc-danger" title="ลบบัญชี" />
        <Card>
          <Row
            title="ลบบัญชีและข้อมูลทั้งหมด"
            description="ลบโปรไฟล์ ประวัติการวิเคราะห์ ผลที่บันทึก แชท และลิงก์แชร์ทั้งหมดอย่างถาวร"
            control={
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setDeleteUnderstood(false);
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                ลบบัญชี
              </Button>
            }
          />
        </Card>
      </section>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        role="alertdialog"
        title="ลบบัญชีนี้ถาวร?"
        description="ประวัติการวิเคราะห์ ผลที่บันทึก แชท และลิงก์แชร์ทั้งหมดจะถูกลบและกู้คืนไม่ได้ ประวัติการทำงานบางส่วนของระบบจะหมดอายุเองตามระยะเวลาของผู้ให้บริการ"
        actions={
          <>
            <Button onClick={() => setDeleteOpen(false)} data-autofocus>
              ไม่ลบ
            </Button>
            <Button variant="danger" loading={deleting} disabled={!deleteUnderstood} onClick={() => void deleteAccount()}>
              ลบบัญชีถาวร
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2.5">
          <input
            id={confirmId}
            type="checkbox"
            checked={deleteUnderstood}
            onChange={(e) => setDeleteUnderstood(e.currentTarget.checked)}
            className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
          />
          <label htmlFor={confirmId} className="text-body text-text">
            เข้าใจแล้วว่าลบแล้วกู้คืนไม่ได้
          </label>
        </div>
        {deleteError ? (
          <p role="alert" className="mt-3 text-label text-negative">
            {deleteError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

export function AccountView() {
  const { status } = useSession();
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader title="บัญชี" />
      {status === 'loading' ? (
        <div aria-busy="true" aria-label="กำลังโหลดบัญชี" className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="mb-2 h-5 w-32" />
              <Card>
                <div className="flex items-center gap-4">
                  <Skeleton className="size-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : status === 'line' ? (
        <LineAccount />
      ) : (
        <GuestAccount />
      )}
    </div>
  );
}
