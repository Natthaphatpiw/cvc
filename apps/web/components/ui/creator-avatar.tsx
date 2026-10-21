'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initialsFor } from '@/lib/format';
import { isAllowedImageUrl } from '@/lib/images';

export type CreatorAvatarProps = {
  src: string | null;
  handle: string;
  size?: 32 | 40 | 64;
  /** Defaults to the handle. Pass '' when the name is printed right next to the avatar. */
  alt?: string;
  className?: string;
};

const textSize: Record<32 | 40 | 64, string> = { 32: 'text-[11px]', 40: 'text-meta', 64: 'text-section' };

/** Circle photo with a 1px border ring; initials on accent-soft when there is no photo or it fails to load. */
export function CreatorAvatar({ src, handle, size = 40, alt, className }: CreatorAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // Only hosts in images.remotePatterns render as photos; anything else falls back to initials.
  const photo = isAllowedImageUrl(src) && failedSrc !== src ? src : null;
  const showImage = photo !== null;
  const label = alt ?? handle;
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-accent-soft',
        className,
      )}
      style={{ width: size, height: size }}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : label || undefined}
      aria-hidden={!label ? true : undefined}
    >
      {photo ? (
        <Image
          src={photo}
          alt={label}
          width={size}
          height={size}
          sizes={`${size}px`}
          className="size-full object-cover"
          onError={() => setFailedSrc(photo)}
        />
      ) : (
        <span aria-hidden className={cn('font-normal leading-none text-accent-ink', textSize[size])}>
          {initialsFor(handle)}
        </span>
      )}
    </span>
  );
}
