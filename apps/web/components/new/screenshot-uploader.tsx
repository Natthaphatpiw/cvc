'use client';

import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { ImagePlus, RotateCcw, X } from 'lucide-react';
import type { RunAsset } from '@cvc/schemas';
import { errorMessageTh } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, uploadAsset } from '@/lib/uploads';

export const MAX_SCREENSHOTS = 3;

type Item = {
  key: string;
  file: File;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  asset: RunAsset | null;
  error: string | null;
};

export type ScreenshotUploaderProps = {
  disabled: boolean;
  onChange: (state: { assets: RunAsset[]; uploading: boolean }) => void;
};

const isImageType = (t: string): t is (typeof IMAGE_TYPES)[number] => (IMAGE_TYPES as readonly string[]).includes(t);

/** Up to three screenshots: drag/drop, paste or pick; each uploads right away with progress and a thumbnail. */
export function ScreenshotUploader({ disabled, onChange }: ScreenshotUploaderProps) {
  const inputId = useId();
  const hintId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef<Item[]>([]);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    itemsRef.current = items;
    onChangeRef.current({
      assets: items.flatMap((i) => (i.status === 'done' && i.asset ? [i.asset] : [])),
      uploading: items.some((i) => i.status === 'uploading'),
    });
  }, [items]);

  useEffect(() => {
    const map = controllers.current;
    return () => {
      for (const c of map.values()) c.abort();
      for (const i of itemsRef.current) URL.revokeObjectURL(i.previewUrl);
    };
  }, []);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const start = (item: Item) => {
    const controller = new AbortController();
    controllers.current.set(item.key, controller);
    void uploadAsset({
      file: item.file,
      fileName: item.file.name || 'screenshot.png',
      contentType: item.file.type,
      kind: 'screenshot',
      signal: controller.signal,
      onProgress: (pct) => patch(item.key, { progress: pct }),
    })
      .then((asset) => patch(item.key, { status: 'done', progress: 100, asset }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        patch(item.key, { status: 'error', error: errorMessageTh(e) });
      })
      .finally(() => controllers.current.delete(item.key));
  };

  const addFiles = (files: File[]) => {
    if (disabled || files.length === 0) return;
    const problems: string[] = [];
    const room = MAX_SCREENSHOTS - items.length;
    const accepted: Item[] = [];
    for (const file of files) {
      if (!isImageType(file.type)) {
        problems.push(`${file.name || 'ไฟล์'}: รองรับเฉพาะ PNG, JPEG หรือ WebP`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`${file.name || 'ไฟล์'}: ขนาด ${formatBytes(file.size)} เกิน 10 MB`);
        continue;
      }
      if (accepted.length >= room) {
        problems.push(`แนบรูปได้สูงสุด ${MAX_SCREENSHOTS} รูป`);
        break;
      }
      accepted.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'uploading',
        progress: 0,
        asset: null,
        error: null,
      });
    }
    setRejections(problems);
    if (accepted.length === 0) return;
    setItems((list) => [...list, ...accepted]);
    accepted.forEach(start);
  };

  const remove = (key: string) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    setItems((list) => {
      const gone = list.find((i) => i.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return list.filter((i) => i.key !== key);
    });
  };

  const retry = (item: Item) => {
    patch(item.key, { status: 'uploading', progress: 0, error: null });
    start(item);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const onPaste = (e: ClipboardEvent<HTMLLabelElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const full = items.length >= MAX_SCREENSHOTS;

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={cn(
          'flex min-h-24 flex-col items-center justify-center gap-1 rounded-card border border-dashed px-4 py-5 text-center transition-colors duration-150',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
          disabled || full
            ? 'cursor-not-allowed border-control bg-raised text-subtle'
            : dragOver
              ? 'border-accent bg-accent-soft'
              : 'border-control bg-surface hover:border-accent-line hover:bg-raised',
        )}
      >
        <ImagePlus aria-hidden className={cn('size-5', disabled || full ? 'text-subtle' : 'text-accent')} strokeWidth={1.5} />
        <span className={cn('text-body', disabled || full ? 'text-subtle' : 'text-text')}>
          {full ? `แนบครบ ${MAX_SCREENSHOTS} รูปแล้ว` : (
            <>
              ลากรูปหรือแคปหน้าจอมาวางตรงนี้ หรือ <span className="font-normal text-accent">กดเพื่อเลือก</span>
            </>
          )}
        </span>
        <span id={hintId} className="text-meta text-muted">
          เช่น หน้า Facebook โปรไฟล์ TikTok รูปสินค้า หรือบรีฟ · PNG, JPEG, WebP ไม่เกิน 10 MB · สูงสุด {MAX_SCREENSHOTS} รูป
        </span>
        <input
          id={inputId}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          disabled={disabled || full}
          aria-describedby={hintId}
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = '';
          }}
        />
      </label>

      {rejections.length > 0 ? (
        <ul role="alert" className="mt-2 space-y-0.5 text-meta text-negative">
          {rejections.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="รูปที่แนบ">
          {items.map((item, idx) => (
            <li key={item.key} className="w-[72px]">
              <div className="relative size-[72px] overflow-hidden rounded-control border border-border bg-raised">
                {/* Object URL preview; next/image does not handle blob: sources. */}
                <img src={item.previewUrl} alt={`รูปที่ ${idx + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  aria-label={`ลบรูปที่ ${idx + 1}`}
                  className="absolute right-0.5 top-0.5 inline-flex size-7 items-center justify-center rounded-control border border-border bg-surface text-muted transition-colors duration-150 hover:text-text"
                >
                  <X aria-hidden className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
              {item.status === 'uploading' ? (
                <div
                  role="progressbar"
                  aria-label={`กำลังอัปโหลดรูปที่ ${idx + 1}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                  className="mt-1.5 h-1 overflow-hidden rounded-full bg-accent-track"
                >
                  <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${item.progress}%` }} />
                </div>
              ) : null}
              {item.status === 'done' ? <p className="mt-1 text-meta text-muted">อัปโหลดแล้ว</p> : null}
              {item.status === 'error' ? (
                <div className="mt-1 text-meta">
                  <p className="text-negative" title={item.error ?? undefined}>
                    ไม่สำเร็จ
                  </p>
                  <button
                    type="button"
                    onClick={() => retry(item)}
                    aria-label={`อัปโหลดรูปที่ ${idx + 1} อีกครั้ง`}
                    className="inline-flex items-center gap-1 text-accent hover:text-accent-ink"
                  >
                    <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
                    ลองใหม่
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
