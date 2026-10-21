import { isAiConfigured } from '@cvc/ai';
import { isKolProviderConfigured } from '@cvc/providers';

// Every reader is a function so Next can build without secrets (env is read at request time).

export type DemoModeSetting = 'auto' | 'on' | 'off';

export function demoModeSetting(): DemoModeSetting {
  const v = (process.env.DEMO_MODE ?? 'auto').trim().toLowerCase();
  return v === 'on' || v === 'off' ? v : 'auto';
}

/** A run is a demo run when any of the core integrations falls back to its mock/stub. */
export function isDemoRun(): boolean {
  return demoModeSetting() === 'on' || !isAiConfigured() || !isKolProviderConfigured();
}

export function demoStepDelayMs(): number {
  const raw = Number.parseInt(process.env.DEMO_STEP_DELAY_MS ?? '', 10);
  if (!Number.isFinite(raw)) return 700;
  return Math.min(Math.max(raw, 0), 10_000);
}

export function envFlag(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

export function envString(name: string): string {
  return (process.env[name] ?? '').trim();
}
