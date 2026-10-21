import { CreatorAvatar } from '@/components/ui/creator-avatar';

export type AvatarStackItem = { handle: string; avatarUrl: string | null };

/** Up to three 32px creator avatars, overlapped, with a text alternative listing the handles. */
export function AvatarStack({ items }: { items: AvatarStackItem[] }) {
  const shown = items.slice(0, 3);
  if (shown.length === 0) return <span className="text-muted">–</span>;
  const label = shown.map((i) => `@${i.handle.replace(/^@/, '')}`).join(', ');
  return (
    <span className="inline-flex items-center" role="img" aria-label={`ครีเอเตอร์อันดับต้น: ${label}`} title={label}>
      {shown.map((item, i) => (
        <CreatorAvatar
          key={`${item.handle}-${i}`}
          src={item.avatarUrl}
          handle={item.handle}
          size={32}
          alt=""
          className={i > 0 ? '-ml-2 ring-2 ring-surface' : 'ring-2 ring-surface'}
        />
      ))}
    </span>
  );
}
