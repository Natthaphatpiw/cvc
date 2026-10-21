import path from 'node:path';
import { readFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// All three apps share the repo-root .env (see .env.example). On Vercel the file does not exist and the
// project's own environment variables are used instead. Next calls loadEnvConfig(apps/api) before importing this
// file and @next/env caches that result, so the root needs forceReload; a forced reload resets process.env to Next's
// initial snapshot, so everything set before this call is put back afterwards.
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
  transpilePackages: readTranspilePackages(),
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
};

export default nextConfig;
