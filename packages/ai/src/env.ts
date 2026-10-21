// Environment checks. Every function reads process.env at call time so Next can build without secrets.

export type DemoMode = 'auto' | 'on' | 'off';

export function demoMode(): DemoMode {
  const v = (process.env.DEMO_MODE ?? 'auto').trim().toLowerCase();
  return v === 'on' || v === 'off' ? v : 'auto';
}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** True when text and embedding models should go through Vercel AI Gateway. */
export function useAiGateway(): boolean {
  if (process.env.USE_AI_GATEWAY?.trim().toLowerCase() !== 'true') return false;
  // On Vercel the gateway authenticates with the per-request OIDC token, so VERCEL=1 is enough.
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || process.env.VERCEL === '1');
}

/** OPENAI_API_KEY (or a usable AI Gateway) is present and demo mode is not forced on. */
export function isAiConfigured(): boolean {
  if (demoMode() === 'on') return false;
  return useAiGateway() || hasOpenAiKey();
}

/** Voice transcription needs a real model; the API uses this to tell users that an OpenAI key is required. */
export function transcribeAvailable(): boolean {
  return isAiConfigured();
}

export class AiNotConfiguredError extends Error {
  readonly feature: string;
  constructor(feature: string) {
    super(`AI is not configured (OPENAI_API_KEY or AI Gateway missing) and DEMO_MODE=off: ${feature}`);
    this.name = 'AiNotConfiguredError';
    this.feature = feature;
  }
}

/** The LLM output failed validation even after one repair attempt. */
export class AiOutputError extends Error {
  readonly stage: string;
  readonly issues: string[];
  constructor(stage: string, issues: string[]) {
    super(`${stage}: model output failed validation: ${issues.slice(0, 5).join('; ')}`);
    this.name = 'AiOutputError';
    this.stage = stage;
    this.issues = issues;
  }
}

/** true → use the deterministic stub. Throws when keys are missing and DEMO_MODE=off. */
export function shouldStub(feature: string): boolean {
  if (isAiConfigured()) return false;
  if (demoMode() === 'off') throw new AiNotConfiguredError(feature);
  return true;
}
