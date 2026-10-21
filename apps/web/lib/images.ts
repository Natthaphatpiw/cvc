/** Hosts allowed in next.config images.remotePatterns. next/image throws for anything else, so check first. */
export function isAllowedImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.hostname.endsWith('.public.blob.vercel-storage.com') || u.hostname === 'profile.line-scdn.net';
  } catch {
    return false;
  }
}
