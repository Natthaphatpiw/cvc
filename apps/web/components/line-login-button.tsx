'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';

export type LineLoginButtonProps = {
  /** Custom handler (the /liff page calls liff.login directly); defaults to session.loginWithLine. */
  onClick?: () => void | Promise<void>;
  fullWidth?: boolean;
  className?: string;
};

/**
 * LINE login button in LINE green (LINE brand guideline). The only place --line-green is used.
 * Renders a disabled note when LINE login is not configured.
 */
export function LineLoginButton({ onClick, fullWidth = false, className }: LineLoginButtonProps) {
  const { loginWithLine, canLoginWithLine } = useSession();
  const [busy, setBusy] = useState(false);

  if (!canLoginWithLine && !onClick) {
    return <p className={cn('text-meta text-muted', className)}>ยังไม่ได้ตั้งค่า LINE Login ในระบบนี้</p>;
  }

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await (onClick ? onClick() : loginWithLine());
        } finally {
          setBusy(false);
        }
      }}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-control bg-line-green px-5 text-body font-normal text-white transition-colors duration-150 hover:bg-line-green-hover disabled:cursor-wait sm:h-10',
        fullWidth && 'w-full',
        className,
      )}
    >
      {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.75} /> : null}
      เข้าสู่ระบบด้วย LINE
    </button>
  );
}
