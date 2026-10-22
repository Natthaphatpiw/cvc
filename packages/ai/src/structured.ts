import { PROMPT_VERSION } from '@cvc/schemas';
import { generateText, Output, type ModelMessage, type ToolSet, type UserContent } from 'ai';
import type { z } from 'zod';
import { AiOutputError } from './env';
import { languageModel, type ModelTier, type ReasoningEffort } from './models';
import { reportTextUsage } from './pricing';
import { wellFormed } from './text';
import { LLM_CALL_TIMEOUT_MS, withTimeout } from './timeout';
import type { AiCtx } from './types';

export type StructuredCall<L, D> = {
  /** Stage id: used as the Structured Outputs schema name and the prompt cache key prefix. */
  stage: string;
  tier: ModelTier;
  effort: ReasoningEffort;
  /** Static instructions (cache-friendly prefix). */
  instructions: string;
  /** Dynamic data (spotlighted external content goes here). */
  userContent: UserContent;
  llmSchema: z.ZodType<L>;
  /** Maps the LLM shape to the domain shape (code-owned fields are filled here). */
  toDomain: (raw: L) => D;
  domainSchema: z.ZodType<D>;
  /** Extra semantic checks. Issues trigger one repair; if they persist the value is still returned for the caller to sanitize. */
  check?: (value: D) => string[];
  tools?: ToolSet;
  maxToolCalls?: number;
  maxOutputTokens?: number;
  ctx?: AiCtx;
};

export type StructuredResult<D> = { value: D; issues: string[]; sourceUrls: string[] };

/** Model calls do not retry: the Workflow step owns retries (SYSTEM_DESIGN §4.12). Repairs are counted separately. */
const MODEL_MAX_RETRIES = 0;

/** Text parts with lone surrogates repaired: provider text can carry half an emoji, which fails the whole request. */
function wellFormedContent(content: UserContent): UserContent {
  if (typeof content === 'string') return wellFormed(content);
  return content.map((part) => (part.type === 'text' ? { ...part, text: wellFormed(part.text) } : part));
}

/** Compact, model-readable zod issues (path: message), at most 12 lines. */
export function compactZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
}

type Attempt<D> = { ok: true; value: D; issues: string[]; rawText: string } | { ok: false; issues: string[]; rawText: string };

/**
 * Structured output with strict schema → domain mapping → domain zod validation → one repair turn that sends the
 * compact validation errors back to the model.
 */
export async function generateStructured<L, D>(call: StructuredCall<L, D>): Promise<StructuredResult<D>> {
  const firstMessages: ModelMessage[] = [{ role: 'user', content: wellFormedContent(call.userContent) }];
  const sourceUrls = new Set<string>();

  const first = await attempt(call, firstMessages, sourceUrls);
  if (first.ok && first.issues.length === 0) return { value: first.value, issues: [], sourceUrls: [...sourceUrls] };

  const repairMessages: ModelMessage[] = [
    ...firstMessages,
    { role: 'assistant', content: first.rawText || '(no output)' },
    {
      role: 'user',
      content:
        'Your previous JSON did not pass validation:\n' +
        first.issues.map((i) => `- ${i}`).join('\n') +
        '\nReturn the complete corrected JSON object that follows the schema and every rule in the instructions.',
    },
  ];
  const second = await attempt(call, repairMessages, sourceUrls);
  if (second.ok) return { value: second.value, issues: second.issues, sourceUrls: [...sourceUrls] };
  if (first.ok) return { value: first.value, issues: first.issues, sourceUrls: [...sourceUrls] };
  throw new AiOutputError(call.stage, second.issues);
}

async function attempt<L, D>(call: StructuredCall<L, D>, messages: ModelMessage[], sourceUrls: Set<string>): Promise<Attempt<D>> {
  const { id, model } = languageModel(call.tier);
  const openaiOptions: Record<string, string | number | boolean> = {
    reasoningEffort: call.effort,
    store: false,
    promptCacheKey: `${call.stage}-${PROMPT_VERSION}`,
  };
  if (call.maxToolCalls != null) openaiOptions.maxToolCalls = call.maxToolCalls;

  const t0 = Date.now();
  const tag = `[ai] ${call.stage} ${id}${call.ctx?.runId ? ` run=${call.ctx.runId}` : ''}`;
  let result: Awaited<ReturnType<typeof generateText>>;
  try {
    result = await generateText({
      model,
      instructions: wellFormed(call.instructions),
      messages,
      output: Output.object({ schema: call.llmSchema, name: call.stage }),
      tools: call.tools,
      maxOutputTokens: call.maxOutputTokens,
      maxRetries: MODEL_MAX_RETRIES,
      abortSignal: withTimeout(call.ctx?.signal, LLM_CALL_TIMEOUT_MS),
      providerOptions: { openai: openaiOptions },
    });
  } catch (err) {
    console.error(`${tag} failed after ${seconds(t0)}: ${errorMessage(err)}`);
    throw err;
  }
  console.info(
    `${tag} done in ${seconds(t0)} finish=${result.finishReason} in=${result.usage.inputTokens ?? '?'} out=${result.usage.outputTokens ?? '?'} sources=${result.sources.length}`,
  );
  await reportTextUsage(call.ctx, id, result.usage);
  for (const s of result.sources) {
    if (s.sourceType === 'url') sourceUrls.add(s.url);
  }

  let raw: L;
  try {
    raw = result.output as L;
  } catch (err) {
    const reason = result.finishReason === 'length' ? 'output was truncated (finish reason: length)' : errorMessage(err);
    return { ok: false, issues: [reason], rawText: result.text };
  }

  let mapped: D;
  try {
    mapped = call.toDomain(raw);
  } catch (err) {
    return { ok: false, issues: [`mapping failed: ${errorMessage(err)}`], rawText: result.text };
  }
  const parsed = call.domainSchema.safeParse(mapped);
  if (!parsed.success) return { ok: false, issues: compactZodIssues(parsed.error), rawText: result.text };
  return { ok: true, value: parsed.data, issues: call.check?.(parsed.data) ?? [], rawText: result.text };
}

function seconds(t0: number): string {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
