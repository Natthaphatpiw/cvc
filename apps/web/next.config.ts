import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import { withBotId } from 'botid/next/config';

// All three apps read the single repo-root .env. Next calls loadEnvConfig(apps/web) before importing this file and
// @next/env caches that result, so the root must be loaded with forceReload. A forced reload first resets
// process.env to Next's initial snapshot, so everything set before this call is put back afterwards (and keeps
// precedence over the file, as with any .env).
const repoRoot = path.resolve(process.cwd(), '../..');
const envBefore = { ...process.env };
loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production', { info: () => undefined, error: console.error }, true);
Object.assign(process.env, envBefore);

function readTranspilePackages(): string[] {
  const raw: unknown = JSON.parse(readFileSync(path.join(process.cwd(), '.transpile.json'), 'utf8'));
  if (!Array.isArray(raw) || !raw.every((p): p is string => typeof p === 'string')) {
    throw new Error('.transpile.json must be a JSON array of package names');
  }
  return raw;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: readTranspilePackages(),
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'profile.line-scdn.net' },
    ],
  },
};

export default withBotId(nextConfig);
