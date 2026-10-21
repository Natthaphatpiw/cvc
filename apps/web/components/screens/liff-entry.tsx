'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { errorMessageTh } from '@/lib/api';
import { NOTICE_TEXT_TH, NOTICE_VERSION, isLiffConfigured, isSupabaseConfigured } from '@/lib/config';
import { getInitializedLiff, initLiff, markLiffSession } from '@/lib/liff';
import { useSession } from '@/lib/session';
import { LineLoginButton } from '@/components/line-login-button';
import { ProductMark } from '@/components/shell/product-mark';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Phase =
  | { kind: 'starting' }
  | { kind: 'unconfigured'; messageTh: string }
  | { kind: 'login' }
  | { kind: 'signing-in' }
  | { kind: 'notice' }
  | { kind: 'redirecting' }
  | { kind: 'error'; messageTh: string };

const LOGIN_ATTEMPT_KEY = 'cvc:liff-login-attempt';

function loginAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(LOGIN_ATTEMPT_KEY) === '1';
  } catch {
    return false;
  }
}

function setLoginAttempted(v: boolean) {
  try {
    if (v) window.sessionStorage.setItem(LOGIN_ATTEMPT_KEY, '1');
    else window.sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
  } catch {
    // ignore
  }
}

/** Starts LINE login and comes back to this exact URL (keeps `next`). */
async function startLogin() {
  const liff = await initLiff();
  setLoginAttempted(true);
  liff.login({ redirectUri: window.location.href });
}

/**
 * LIFF entry and LINE-login landing page: liff.init → login → ID token exchange → notice acknowledgement →
 * redirect to `next`. Also completes web LINE login started from the sidebar (`?login=1`).
 */
export function LiffEntry({ next, autoLogin }: { next: string; autoLogin: boolean }) {
  const router = useRouter();
  const { status, user, completeLineLogin, acknowledgeNotice } = useSession();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [ackBusy, setAckBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const go = useCallback(() => {
    setPhase({ kind: 'redirecting' });
    router.replace(next);
  }, [next, router]);

  useEffect(() => {
    if (status === 'loading' || startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      if (!isLiffConfigured()) {
        setPhase({ kind: 'unconfigured', messageTh: 'ระบบนี้ยังไม่ได้ตั้งค่า LINE LIFF' });
        return;
      }
      if (!isSupabaseConfigured()) {
        setPhase({ kind: 'unconfigured', messageTh: 'ระบบนี้ยังไม่ได้ตั้งค่าบัญชีผู้ใช้ จึงเข้าสู่ระบบด้วย LINE ไม่ได้' });
        return;
      }
      let liff;
      try {
        liff = await initLiff();
      } catch {
        setPhase({ kind: 'error', messageTh: 'เชื่อมต่อกับ LINE ไม่สำเร็จ กรุณาลองอีกครั้ง' });
        return;
      }
      // A deep link (liff.state) makes the SDK navigate to the target path itself; let it.
      if (new URLSearchParams(window.location.search).has('liff.state')) return;
      if (liff.isInClient()) markLiffSession();

      if (!liff.isLoggedIn()) {
        if (liff.isInClient() || (autoLogin && !loginAttempted())) {
          await startLogin();
          return;
        }
        setPhase({ kind: 'login' });
        return;
      }
      const justLoggedIn = loginAttempted();
      setLoginAttempted(false);

      if (status === 'line') {
        if (user?.needsNoticeAck) setPhase({ kind: 'notice' });
        else go();
        return;
      }

      // The SDK returns a stored ID token without checking exp, and LINE's verify rejects an expired one: log in again,
      // once. A token from the login that just happened is sent as is, so a skewed device clock cannot loop.
      const exp = liff.getDecodedIDToken()?.exp;
      if (!justLoggedIn && !liff.isInClient() && typeof exp === 'number' && exp * 1000 <= Date.now()) {
        liff.logout();
        await startLogin();
        return;
      }

      const idToken = liff.getIDToken();
      if (!idToken) {
        setPhase({ kind: 'error', messageTh: 'ไม่ได้รับข้อมูลยืนยันตัวตนจาก LINE กรุณาเข้าสู่ระบบอีกครั้ง' });
        return;
      }
      setPhase({ kind: 'signing-in' });
      try {
        const me = await completeLineLogin(idToken);
        if (me?.needsNoticeAck) setPhase({ kind: 'notice' });
        else go();
      } catch (e) {
        setPhase({ kind: 'error', messageTh: errorMessageTh(e) });
      }
    })();
  }, [status, user, autoLogin, completeLineLogin, go]);

  const relogin = async () => {
    const liff = getInitializedLiff();
    try {
      if (liff?.isLoggedIn()) liff.logout();
      setLoginAttempted(false);
      await startLogin();
    } catch {
      setPhase({ kind: 'error', messageTh: 'เชื่อมต่อกับ LINE ไม่สำเร็จ กรุณาลองอีกครั้ง' });
    }
  };

  const acknowledge = async () => {
    setAckBusy(true);
    setAckError(null);
    try {
      await acknowledgeNotice();
      go();
    } catch (e) {
      setAckError(errorMessageTh(e));
    } finally {
      setAckBusy(false);
    }
  };

  const busy = phase.kind === 'starting' || phase.kind === 'signing-in' || phase.kind === 'redirecting';

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[480px] flex-col px-4 pt-10 safe-bottom">
      <div className="mb-8 flex items-center gap-2.5">
        <ProductMark size={24} />
        <span className="text-label">
          <span className="block font-normal text-text">Convert Cake</span>
          <span className="block text-muted">Influencer</span>
        </span>
      </div>

      {busy ? (
        <div role="status" aria-live="polite" className="flex items-center gap-3 text-body text-text">
          <LoaderCircle aria-hidden className="size-4 animate-spin text-accent" strokeWidth={1.75} />
          {phase.kind === 'signing-in'
            ? 'กำลังเข้าสู่ระบบ'
            : phase.kind === 'redirecting'
              ? 'กำลังเปิดหน้าถัดไป'
              : 'กำลังเชื่อมต่อกับ LINE'}
        </div>
      ) : null}

      {phase.kind === 'login' ? (
        <div>
          <h1 className="text-title font-medium text-text">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-body text-muted">
            เข้าสู่ระบบด้วย LINE เพื่อเก็บผลวิเคราะห์ไว้ถาวร ดูประวัติ และแชร์ผลให้ทีม
          </p>
          <LineLoginButton fullWidth className="mt-6" onClick={() => startLogin()} />
          <Link href={next} className="mt-4 inline-block text-label text-accent hover:text-accent-ink">
            ใช้งานต่อแบบผู้ใช้ทั่วไป
          </Link>
        </div>
      ) : null}

      {phase.kind === 'notice' ? (
        <div>
          <h1 className="text-title font-medium text-text">ประกาศความเป็นส่วนตัว</h1>
          <Card className="mt-4">
            <p className="text-body text-text">{NOTICE_TEXT_TH}</p>
            <p className="mt-3 text-meta text-muted">ประกาศฉบับ {NOTICE_VERSION}</p>
          </Card>
          {ackError ? (
            <p role="alert" className="mt-3 text-label text-negative">
              {ackError}
            </p>
          ) : null}
          <Button variant="primary" className="mt-6 h-12 w-full" loading={ackBusy} onClick={() => void acknowledge()}>
            รับทราบ
          </Button>
        </div>
      ) : null}

      {phase.kind === 'unconfigured' ? (
        <div>
          <h1 className="text-title font-medium text-text">ยังเข้าสู่ระบบด้วย LINE ไม่ได้</h1>
          <p className="mt-1 text-body text-muted">{phase.messageTh} ใช้งานต่อแบบผู้ใช้ทั่วไปได้</p>
          <ButtonLink href={next} variant="primary" className="mt-6">
            ใช้งานต่อ
          </ButtonLink>
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div>
          <h1 className="text-title font-medium text-text">เข้าสู่ระบบไม่สำเร็จ</h1>
          <p role="alert" className="mt-1 text-body text-muted">
            {phase.messageTh}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <LineLoginButton onClick={() => relogin()} />
            <Link href={next} className="text-label text-accent hover:text-accent-ink">
              ใช้งานต่อแบบผู้ใช้ทั่วไป
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
