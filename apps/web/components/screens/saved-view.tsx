'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Pin, Trash } from 'lucide-react';
import type { SavedResult } from '@cvc/schemas';
import { errorMessageTh, systemApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTh } from '@/lib/format';
import { localStore, type LocalSavedSummary } from '@/lib/local-store';
import { useSession } from '@/lib/session';
import { LineLoginButton } from '@/components/line-login-button';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

type Load<T> = { kind: 'loading' } | { kind: 'error'; messageTh: string } | { kind: 'ready'; items: T[] };

type PendingRemoval = { kind: 'line'; item: SavedResult } | { kind: 'guest'; item: LocalSavedSummary };

const iconBtn =
  'inline-flex size-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-text sm:size-8';

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" aria-busy="true" aria-label="กำลังโหลดรายการที่บันทึก">
      <div className="h-9 bg-raised" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 border-t border-rule px-4">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="ml-auto h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptySaved() {
  return (
    <EmptyState
      title="ยังไม่มีผลวิเคราะห์ที่บันทึกไว้"
      description="กดบันทึกในหน้าผลวิเคราะห์เพื่อเก็บไว้ที่นี่"
      action={
        <ButtonLink href="/new" variant="primary">
          วิเคราะห์แบรนด์ใหม่
        </ButtonLink>
      }
    />
  );
}

export function SavedView() {
  const { status, canLoginWithLine } = useSession();
  const toast = useToast();
  const [line, setLine] = useState<Load<SavedResult>>({ kind: 'loading' });
  const [guest, setGuest] = useState<Load<LocalSavedSummary>>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [pinBusy, setPinBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    if (status === 'line') {
      setLine({ kind: 'loading' });
      systemApi
        .listSaved()
        .then((items) => active && setLine({ kind: 'ready', items }))
        .catch((e: unknown) => active && setLine({ kind: 'error', messageTh: errorMessageTh(e) }));
    } else {
      setGuest({ kind: 'loading' });
      void localStore.listSavedResults().then((items) => active && setGuest({ kind: 'ready', items }));
    }
    return () => {
      active = false;
    };
  }, [status, reloadKey]);

  const lineItems = useMemo(
    () =>
      line.kind === 'ready'
        ? [...line.items].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [line],
  );

  const togglePin = async (item: SavedResult) => {
    setPinBusy(item.id);
    try {
      const updated = await systemApi.updateSaved(item.id, { isPinned: !item.isPinned });
      setLine((s) => (s.kind === 'ready' ? { ...s, items: s.items.map((i) => (i.id === item.id ? updated : i)) } : s));
    } catch (e) {
      toast.show(errorMessageTh(e), 'negative');
    } finally {
      setPinBusy(null);
    }
  };

  const confirmRemove = async () => {
    if (!pending) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      if (pending.kind === 'line') {
        await systemApi.deleteSaved(pending.item.id);
        setLine((s) => (s.kind === 'ready' ? { ...s, items: s.items.filter((i) => i.id !== pending.item.id) } : s));
      } else {
        await localStore.removeSavedResult(pending.item.resultId);
        setGuest((s) =>
          s.kind === 'ready' ? { ...s, items: s.items.filter((i) => i.resultId !== pending.item.resultId) } : s,
        );
      }
      setPending(null);
      toast.show('นำออกจากรายการที่บันทึกแล้ว', 'positive');
    } catch (e) {
      setRemoveError(e instanceof Error && pending.kind === 'guest' ? e.message : errorMessageTh(e));
    } finally {
      setRemoving(false);
    }
  };

  const isGuest = status === 'guest';

  return (
    <>
      <PageHeader
        title="ที่บันทึกไว้"
        description={
          status === 'line'
            ? 'ผลวิเคราะห์ที่บันทึกไว้ในบัญชี LINE นี้ ปักหมุดรายการที่ใช้บ่อยไว้ด้านบนได้'
            : status === 'guest'
              ? 'ผลวิเคราะห์ที่บันทึกไว้ในเบราว์เซอร์นี้'
              : undefined
        }
      />

      {isGuest ? (
        <div className="mb-6 flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-body font-normal text-text">บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น</p>
            <p className="text-label text-muted">
              ล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่องแล้วรายการจะหายไป เข้าสู่ระบบด้วย LINE เพื่อเก็บไว้ถาวรและเปิดได้จากทุกอุปกรณ์
            </p>
          </div>
          {canLoginWithLine ? <LineLoginButton className="w-full sm:w-auto" /> : null}
        </div>
      ) : null}

      {status === 'loading' ? <ListSkeleton /> : null}

      {status === 'line' ? (
        line.kind === 'loading' ? (
          <ListSkeleton />
        ) : line.kind === 'error' ? (
          <ErrorBlock messageTh={line.messageTh} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : lineItems.length === 0 ? (
          <EmptySaved />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-raised text-meta text-muted">
                    <th scope="col" className="h-9 px-4 font-normal">
                      ชื่อ
                    </th>
                    <th scope="col" className="hidden h-9 px-4 font-normal md:table-cell">
                      แท็ก
                    </th>
                    <th scope="col" className="hidden h-9 px-4 text-right font-normal sm:table-cell">
                      อัปเดต
                    </th>
                    <th scope="col" className="h-9 w-24 px-2 font-normal">
                      <span className="sr-only">การทำงาน</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-rule transition-colors duration-150 hover:bg-raised">
                      <td className="px-4 py-2.5">
                        <Link href={`/results/${encodeURIComponent(item.resultId)}`} className="font-normal text-text hover:text-accent">
                          {item.title}
                        </Link>
                        {item.note ? <p className="max-w-[48ch] truncate text-label text-muted">{item.note}</p> : null}
                        <p className="text-meta text-muted sm:hidden">
                          <time dateTime={item.updatedAt}>{formatDateTh(item.updatedAt)}</time>
                        </p>
                      </td>
                      <td className="hidden px-4 py-2.5 md:table-cell">
                        {item.tags.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {item.tags.slice(0, 4).map((t) => (
                              <Badge key={t}>{t}</Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 text-right text-muted sm:table-cell">
                        <time dateTime={item.updatedAt}>{formatDateTh(item.updatedAt)}</time>
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            aria-pressed={item.isPinned}
                            aria-label={item.isPinned ? `เลิกปักหมุด ${item.title}` : `ปักหมุด ${item.title}`}
                            disabled={pinBusy === item.id}
                            onClick={() => void togglePin(item)}
                            className={cn(iconBtn, item.isPinned && 'text-accent hover:text-accent-ink')}
                          >
                            <Pin aria-hidden className="size-4" strokeWidth={1.5} fill={item.isPinned ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            aria-label={`นำ ${item.title} ออกจากที่บันทึกไว้`}
                            onClick={() => {
                              setRemoveError(null);
                              setPending({ kind: 'line', item });
                            }}
                            className={iconBtn}
                          >
                            <Trash aria-hidden className="size-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : null}

      {isGuest ? (
        guest.kind === 'loading' ? (
          <ListSkeleton />
        ) : guest.kind === 'error' ? (
          <ErrorBlock messageTh={guest.messageTh} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : guest.items.length === 0 ? (
          <EmptySaved />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-raised text-meta text-muted">
                  <th scope="col" className="h-9 px-4 font-normal">
                    ชื่อ
                  </th>
                  <th scope="col" className="hidden h-9 px-4 font-normal md:table-cell">
                    แบรนด์
                  </th>
                  <th scope="col" className="hidden h-9 px-4 text-right font-normal sm:table-cell">
                    บันทึกเมื่อ
                  </th>
                  <th scope="col" className="h-9 w-14 px-2 font-normal">
                    <span className="sr-only">การทำงาน</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {guest.items.map((item) => (
                  <tr key={item.resultId} className="border-t border-rule transition-colors duration-150 hover:bg-raised">
                    <td className="px-4 py-2.5">
                      <Link href={`/results/${encodeURIComponent(item.resultId)}`} className="font-normal text-text hover:text-accent">
                        {item.title}
                      </Link>
                      <p className="text-meta text-muted md:hidden">
                        {item.brandName} · <time dateTime={item.savedAt}>{formatDateTh(item.savedAt)}</time>
                      </p>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted md:table-cell">{item.brandName}</td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-right text-muted sm:table-cell">
                      <time dateTime={item.savedAt}>{formatDateTh(item.savedAt)}</time>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        aria-label={`ลบ ${item.title} ออกจากเบราว์เซอร์นี้`}
                        onClick={() => {
                          setRemoveError(null);
                          setPending({ kind: 'guest', item });
                        }}
                        className={iconBtn}
                      >
                        <Trash aria-hidden className="size-4" strokeWidth={1.5} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        role="alertdialog"
        title={pending?.kind === 'guest' ? 'ลบผลที่บันทึกไว้ในเบราว์เซอร์นี้?' : 'นำออกจากที่บันทึกไว้?'}
        description={
          pending?.kind === 'guest'
            ? `"${pending.item.title}" จะหายจากเบราว์เซอร์นี้ และกู้คืนไม่ได้`
            : pending
              ? `"${pending.item.title}" จะหายจากรายการนี้ ผลวิเคราะห์ยังเปิดได้จากหน้าการวิเคราะห์`
              : undefined
        }
        actions={
          <>
            <Button onClick={() => setPending(null)} data-autofocus>
              ไม่ลบ
            </Button>
            <Button variant="danger" loading={removing} onClick={() => void confirmRemove()}>
              {pending?.kind === 'guest' ? 'ลบ' : 'นำออก'}
            </Button>
          </>
        }
      >
        {removeError ? (
          <p role="alert" className="text-label text-negative">
            {removeError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
