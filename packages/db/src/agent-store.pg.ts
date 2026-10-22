import {
  BrandProfile,
  EvidenceCard,
  FinalResult,
  PIPELINE_VERSION,
  PROMPT_VERSION,
  RefData,
  TERMINAL_STATUSES,
  type ProgressEvent,
} from '@cvc/schemas';
import type postgres from 'postgres';
import { jsonb, pgCode, transaction, type Queryable, type Sql } from './client';
import {
  candidateFromDb,
  candidateToDb,
  categoryFromRow,
  chatResourceId,
  chatSessionFromRow,
  chatThreadId,
  clampPct,
  creatorToDb,
  evidenceSourceType,
  kpiBenchmarkFromRow,
  personaFromRow,
  rateCardFromRow,
  runFromRow,
  runPatchColumns,
  tierBandFromRow,
  tierBenchmarkFromRow,
  videoToDb,
  type CandidateDbRow,
  type CategoryRow,
  type ChatSessionRow,
  type KpiBenchmarkRow,
  type PersonaRow,
  type RateCardRow,
  type RunModelConfig,
  type RunRow,
  type TierBandRow,
  type TierBenchmarkRow,
} from './mappers';
import { StoreError, type AgentStore, type RunRecord } from './types';
import { canonicalJson, dedupeBy, isUuid, nowIso, sha256Hex, toInt } from './util';

/** run_steps.step_key of the per-run progress event list (one row, output = ProgressEvent[]). */
export const PROGRESS_STEP_KEY = '__progress';

/**
 * Maps "referenced row missing" (23503) and "not a uuid" (22P02) to StoreError('not_found') and unique violations
 * (23505, e.g. a second result id for the same run) to StoreError('conflict').
 */
async function mapPgErrors<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const code = pgCode(err);
    if (code === '23503' || code === '22P02') throw new StoreError('not_found', `${what} not found`);
    if (code === '23505') throw new StoreError('conflict', `${what}: unique constraint violated`);
    throw err;
  }
}

function runSelect(sql: Queryable) {
  return sql`
    select r.id, r.owner_id, r.owner_type, r.channel, r.status, r.stage, r.progress_pct, r.warnings, r.raw_input,
           r.input_hash, r.normalized_input, r.model_config, r.error_message, r.workflow_run_id, r.cost_usd,
           r.created_at, r.updated_at, r.completed_at, bp.id as brand_profile_id, res.id as result_id
    from analysis.runs r
    left join analysis.brand_profiles bp on bp.run_id = r.id
    left join analysis.results res on res.run_id = r.id`;
}

/** Joins SET fragments with commas; postgres.js treats an empty array as a parameter, so return an empty fragment. */
function commaList(sql: Queryable, parts: postgres.PendingQuery<postgres.Row[]>[], leadingComma: boolean) {
  if (parts.length === 0) return sql``;
  return parts.map((p, i) => (i === 0 && !leadingComma ? p : sql`, ${p}`));
}

function canonicalSite(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Finds or creates the analysis.clients row a run's evidence belongs to. */
async function ensureClient(tx: Queryable, name: string, website: string | null): Promise<string> {
  const site = canonicalSite(website);
  if (site) {
    const [row] = await tx<{ id: string }[]>`
      insert into analysis.clients (name, canonical_site) values (${name}, ${site})
      on conflict (canonical_site) where canonical_site is not null do update set updated_at = now()
      returning id`;
    if (row) return row.id;
  }
  const [hit] = await tx<{ id: string }[]>`
    select id from analysis.clients where canonical_site is null and lower(name) = lower(${name})
    order by created_at limit 1`;
  if (hit) return hit.id;
  const [created] = await tx<{ id: string }[]>`insert into analysis.clients (name) values (${name}) returning id`;
  if (!created) throw new Error('failed to create analysis.clients row');
  return created.id;
}

function evidenceSnippet(card: EvidenceCard): string | null {
  const parts = [...card.usp, ...card.claims.map((c) => c.text)].filter((s) => s.trim().length > 0);
  return parts.length ? parts.join(' · ').slice(0, 500) : null;
}

export function createPgAgentStore(sql: Sql): AgentStore {
  async function getRun(runId: string): Promise<RunRecord | null> {
    if (!isUuid(runId)) return null;
    const [row] = await sql<RunRow[]>`${runSelect(sql)} where r.id = ${runId}`;
    return row ? runFromRow(row) : null;
  }

  return {
    kind: 'postgres',

    async createRun(a) {
      const modelConfig: RunModelConfig = { isDemo: a.isDemo };
      const [row] = await sql<RunRow[]>`
        insert into analysis.runs (owner_id, owner_type, channel, status, input_hash, claim_secret_hash, notice_version,
                                   raw_input, objective, pipeline_version, prompt_version, model_config, expires_at)
        values (${a.ownerId}, ${a.ownerType}, ${a.channel}, 'queued', ${a.inputHash}, ${a.claimSecretHash},
                ${a.input.noticeVersion}, ${jsonb(sql, a.input)}, ${a.input.campaign.objective}, ${PIPELINE_VERSION},
                ${PROMPT_VERSION}, ${jsonb(sql, modelConfig)},
                ${a.ownerType === 'guest' ? sql`now() + interval '7 days'` : null})
        returning id, owner_id, owner_type, channel, status, stage, progress_pct, warnings, raw_input, input_hash,
                  normalized_input, model_config, error_message, workflow_run_id, cost_usd, created_at, updated_at,
                  completed_at, null::uuid as brand_profile_id, null::uuid as result_id`;
      if (!row) throw new Error('insert into analysis.runs returned no row');
      return runFromRow(row);
    },

    async findRecentRunByHash(ownerId, inputHash, withinHours) {
      if (!isUuid(ownerId)) return null;
      const [row] = await sql<RunRow[]>`
        ${runSelect(sql)}
        where r.owner_id = ${ownerId} and r.input_hash = ${inputHash}
          and r.created_at > now() - ${withinHours}::float8 * interval '1 hour'
          and r.status not in ('failed', 'cancelled')
        order by r.created_at desc
        limit 1`;
      return row ? runFromRow(row) : null;
    },

    getRun,

    async listStaleRuns(olderThanMinutes, limit = 50) {
      const size = Math.min(1000, Math.max(1, Math.floor(limit)));
      // the status predicate matches runs_inflight_idx (partial index on updated_at)
      const rows = await sql<RunRow[]>`
        ${runSelect(sql)}
        where r.status not in ('completed', 'partial', 'failed', 'cancelled')
          and r.status <> 'awaiting_review'
          and r.updated_at < now() - ${olderThanMinutes}::float8 * interval '1 minute'
        order by r.updated_at asc, r.id
        limit ${size}`;
      return rows.map(runFromRow);
    },

    async updateRun(runId, patch) {
      if (!isUuid(runId)) throw new StoreError('not_found', `run ${runId} not found`);
      const { columns, normalizedInput } = runPatchColumns(patch);
      const names = Object.keys(columns);
      const terminal = patch.status !== undefined && TERMINAL_STATUSES.includes(patch.status);
      const extra = [
        ...(normalizedInput !== undefined ? [sql`normalized_input = ${jsonb(sql, normalizedInput)}`] : []),
        ...(patch.status !== undefined && patch.status !== 'queued' ? [sql`started_at = coalesce(started_at, now())`] : []),
        ...(terminal && patch.completedAt === undefined ? [sql`completed_at = coalesce(completed_at, now())`] : []),
      ];
      if (names.length === 0 && extra.length === 0) return;
      // a non-terminal status must not replace a terminal one (e.g. a progress write racing a cancel)
      const guarded = patch.status !== undefined && !terminal;
      const guard = guarded ? sql`and status not in ('completed', 'partial', 'failed', 'cancelled')` : sql``;
      const res =
        names.length > 0
          ? // the dynamic-column helper must directly follow "update … set" in the same template
            await sql`update analysis.runs set ${sql(columns, names)} ${commaList(sql, extra, true)} where id = ${runId} ${guard}`
          : await sql`update analysis.runs set ${commaList(sql, extra, false)} where id = ${runId} ${guard}`;
      if (res.count === 0) {
        const exists = guarded && (await sql`select 1 from analysis.runs where id = ${runId}`).length > 0;
        if (exists) throw new StoreError('conflict', `run ${runId} is already terminal`);
        throw new StoreError('not_found', `run ${runId} not found`);
      }
    },

    async appendProgress(runId, e) {
      const event = { ...e, pct: clampPct(e.pct), at: nowIso(), seq: 1 };
      // One row per run; the row lock taken by ON CONFLICT DO UPDATE serializes concurrent appends.
      const [row] = await mapPgErrors(`run ${runId}`, () => sql<{ event: ProgressEvent }[]>`
        insert into analysis.run_steps (run_id, step_key, attempt, status, output, finished_at)
        values (${runId}, ${PROGRESS_STEP_KEY}, 1, 'succeeded', jsonb_build_array(${jsonb(sql, event)}::jsonb), now())
        on conflict (run_id, step_key, attempt) do update
          set output = analysis.run_steps.output || jsonb_build_array(
                (excluded.output -> 0) || jsonb_build_object('seq', jsonb_array_length(analysis.run_steps.output) + 1)),
              finished_at = now()
        returning output -> -1 as event`);
      if (!row) throw new Error('appendProgress returned no row');
      return row.event;
    },

    async listProgress(runId, afterSeq) {
      if (!isUuid(runId)) return [];
      const rows = await sql<{ event: ProgressEvent }[]>`
        select e.value as event
        from analysis.run_steps s, jsonb_array_elements(s.output) as e(value)
        where s.run_id = ${runId} and s.step_key = ${PROGRESS_STEP_KEY} and s.attempt = 1
          and (e.value ->> 'seq')::int > ${Math.floor(afterSeq)}
        order by (e.value ->> 'seq')::int`;
      return rows.map((r) => r.event);
    },

    async getStep<T>(runId: string, stepKey: string): Promise<T | null> {
      if (!isUuid(runId)) return null;
      const [row] = await sql<{ output: unknown }[]>`
        select output from analysis.run_steps
        where run_id = ${runId} and step_key = ${stepKey} and status = 'succeeded'
        order by attempt desc limit 1`;
      return row ? ((row.output ?? null) as T | null) : null;
    },

    async putStep(runId, stepKey, output, meta) {
      await mapPgErrors(`run ${runId}`, () => sql`
        insert into analysis.run_steps (run_id, step_key, attempt, status, model, output, cost_usd, latency_ms, finished_at)
        values (${runId}, ${stepKey}, 1, 'succeeded', ${meta?.model ?? null}, ${jsonb(sql, output)},
                ${meta?.costUsd ?? null}, ${toInt(meta?.latencyMs)}, now())
        on conflict (run_id, step_key, attempt) do update
          set status = 'succeeded', model = excluded.model, output = excluded.output, cost_usd = excluded.cost_usd,
              latency_ms = excluded.latency_ms, error = null, finished_at = now()`);
    },

    async saveEvidence(runId, cards) {
      if (cards.length === 0) return;
      if (!isUuid(runId)) throw new StoreError('not_found', `run ${runId} not found`);
      const hashed = await Promise.all(cards.map(async (card) => ({ card, hash: await sha256Hex(canonicalJson(card)) })));
      await transaction(sql, async (tx) => {
        // serialize writers of the same run so refs stay gapless and unique
        await tx`select pg_advisory_xact_lock(hashtext(${'cvc.evidence:' + runId}))`;
        const [run] = await tx<{ company: string | null; website: string | null }[]>`
          select raw_input ->> 'companyName' as company, raw_input ->> 'websiteUrl' as website
          from analysis.runs where id = ${runId}`;
        if (!run) throw new StoreError('not_found', `run ${runId} not found`);
        const existing = await tx<{ content_hash: string | null }[]>`
          select s.content_hash from analysis.evidence e
          left join analysis.client_snapshots s on s.id = e.snapshot_id
          where e.run_id = ${runId}`;
        const seen = new Set(existing.map((r) => r.content_hash));
        const fresh = dedupeBy(hashed, (h) => h.hash).filter((h) => !seen.has(h.hash));
        if (fresh.length === 0) return;
        const clientId = await ensureClient(tx, run.company?.trim() || 'unknown', run.website);
        let n = existing.length;
        for (const { card, hash } of fresh) {
          n += 1;
          const provider = typeof card.stats['provider'] === 'string' ? card.stats['provider'] : 'pipeline';
          const [snap] = await tx<{ id: string }[]>`
            insert into analysis.client_snapshots (client_id, source, source_url, provider, stats, evidence_card,
                                                   content_hash, expires_at)
            values (${clientId}, ${card.source}, ${card.sourceUrl}, ${provider}, ${jsonb(tx, card.stats)},
                    ${jsonb(tx, card)}, ${hash}, now() + interval '7 days')
            returning id`;
          await tx`
            insert into analysis.evidence (run_id, ref, source_type, url, title, snippet, snapshot_id, retrieved_at)
            values (${runId}, ${'E' + n}, ${evidenceSourceType(card.source)}, ${card.sourceUrl},
                    ${card.sourceUrl ?? card.source}, ${evidenceSnippet(card)}, ${snap?.id ?? null}, now())`;
        }
      });
    },

    async listEvidence(runId) {
      if (!isUuid(runId)) return [];
      const rows = await sql<{ card: unknown }[]>`
        select s.evidence_card as card
        from analysis.evidence e join analysis.client_snapshots s on s.id = e.snapshot_id
        where e.run_id = ${runId}
        order by length(e.ref), e.ref`;
      return rows.flatMap((r) => {
        const parsed = EvidenceCard.safeParse(r.card);
        return parsed.success ? [parsed.data] : [];
      });
    },

    async saveBrandProfile(runId, p) {
      const hash = await sha256Hex(canonicalJson(p));
      const [row] = await mapPgErrors(`run ${runId}`, () => sql<{ id: string }[]>`
        insert into analysis.brand_profiles (run_id, schema_version, profile, profile_hash, confidence)
        values (${runId}, ${p.schemaVersion}, ${jsonb(sql, p)}, ${hash}, ${Math.round(p.confidence * 100) / 100})
        on conflict (run_id) do update
          set schema_version = excluded.schema_version, profile = excluded.profile,
              profile_hash = excluded.profile_hash, confidence = excluded.confidence
        returning id`);
      if (!row) throw new Error('saveBrandProfile returned no row');
      return row.id;
    },

    async getBrandProfile(id) {
      if (!isUuid(id)) return null;
      const [row] = await sql<{ profile: unknown }[]>`select profile from analysis.brand_profiles where id = ${id}`;
      return row ? BrandProfile.parse(row.profile) : null;
    },

    async upsertCreator(p, a) {
      const c = creatorToDb(p, a);
      return transaction(sql, async (tx) => {
        // A handle that moved to another account: release it on the old row first (unique (platform, handle)).
        await tx`
          update kol.creators set handle = '__released_' || id::text
          where platform = 'tiktok' and handle = ${c.handle} and platform_user_id <> ${c.platform_user_id}`;
        const [row] = await tx<{ id: string }[]>`
          insert into kol.creators ${tx(c)}
          on conflict (platform, platform_user_id) do update set
            handle = excluded.handle,
            display_name = excluded.display_name,
            bio = excluded.bio,
            bio_link = excluded.bio_link,
            avatar_url = coalesce(excluded.avatar_url, kol.creators.avatar_url),
            avatar_source_url = coalesce(excluded.avatar_source_url, kol.creators.avatar_source_url),
            is_verified = excluded.is_verified,
            country_code = coalesce(excluded.country_code, kol.creators.country_code),
            primary_language = coalesce(excluded.primary_language, kol.creators.primary_language),
            is_shop_seller = excluded.is_shop_seller,
            is_commerce_user = excluded.is_commerce_user,
            follower_count = coalesce(excluded.follower_count, kol.creators.follower_count),
            following_count = coalesce(excluded.following_count, kol.creators.following_count),
            likes_count = coalesce(excluded.likes_count, kol.creators.likes_count),
            video_count = coalesce(excluded.video_count, kol.creators.video_count),
            tier = coalesce(excluded.tier, kol.creators.tier),
            data_sources = array(select distinct unnest(kol.creators.data_sources || excluded.data_sources)),
            last_refreshed_at = now()
          returning id`;
        if (!row) throw new Error('upsertCreator returned no row');
        return row.id;
      });
    },

    async setCreatorAvatar(creatorId, avatarUrl, sourceUrl) {
      if (!isUuid(creatorId)) return;
      await sql`
        update kol.creators
        set avatar_url = ${avatarUrl}, avatar_source_url = ${sourceUrl},
            avatar_cached_at = case when ${avatarUrl}::text is null then null else now() end
        where id = ${creatorId}`;
    },

    async saveVideos(creatorId, videos, coverUrls) {
      const rows = dedupeBy(videos, (v) => v.platformVideoId).map((v) =>
        videoToDb(creatorId, v, coverUrls?.[v.platformVideoId] ?? null),
      );
      if (rows.length === 0) return;
      await mapPgErrors(`creator ${creatorId}`, () => sql`
        insert into kol.creator_videos ${sql(rows)}
        on conflict (platform_video_id) do update set
          creator_id = excluded.creator_id,
          url = excluded.url,
          posted_at = coalesce(excluded.posted_at, kol.creator_videos.posted_at),
          caption = excluded.caption,
          hashtags = excluded.hashtags,
          duration_s = coalesce(excluded.duration_s, kol.creator_videos.duration_s),
          views = coalesce(excluded.views, kol.creator_videos.views),
          likes = coalesce(excluded.likes, kol.creator_videos.likes),
          comments = coalesce(excluded.comments, kol.creator_videos.comments),
          shares = coalesce(excluded.shares, kol.creator_videos.shares),
          saves = coalesce(excluded.saves, kol.creator_videos.saves),
          is_sponsored = excluded.is_sponsored,
          is_ad = excluded.is_ad,
          has_shop_product = excluded.has_shop_product,
          location_created = excluded.location_created,
          text_language = excluded.text_language,
          cover_url = coalesce(excluded.cover_url, kol.creator_videos.cover_url),
          cover_source_url = coalesce(excluded.cover_source_url, kol.creator_videos.cover_source_url),
          captured_at = now()`);
    },

    async saveCandidates(runId, rows) {
      const values = dedupeBy(rows, (r) => r.creatorId).map((r) => {
        const c = candidateToDb(runId, r);
        return {
          ...c,
          dossier_snapshot: jsonb(sql, c.dossier_snapshot),
          evaluation: jsonb(sql, c.evaluation),
          sub_scores: jsonb(sql, c.sub_scores),
        };
      });
      if (values.length === 0) return;
      await mapPgErrors(`run ${runId} or creator`, () => sql`
        insert into analysis.candidates ${sql(values)}
        on conflict (run_id, creator_id) do update set
          discovered_via = array(select distinct unnest(analysis.candidates.discovered_via || excluded.discovered_via)),
          gate_failures = excluded.gate_failures,
          dossier_snapshot = excluded.dossier_snapshot,
          evaluation = excluded.evaluation,
          suspected_injection = excluded.suspected_injection,
          sub_scores = excluded.sub_scores,
          missing_features = excluded.missing_features,
          final_score = excluded.final_score,
          rank = excluded.rank,
          rank_stability = excluded.rank_stability,
          data_confidence = excluded.data_confidence,
          status = excluded.status`);
    },

    async listCandidates(runId) {
      if (!isUuid(runId)) return [];
      const rows = await sql<CandidateDbRow[]>`
        select c.creator_id, k.handle, c.status, c.discovered_via, c.gate_failures, c.dossier_snapshot, c.evaluation,
               c.suspected_injection, c.sub_scores, k.platform_user_id, k.follower_count, k.country_code,
               k.video_count, k.last_posted_at, k.avatar_source_url
        from analysis.candidates c join kol.creators k on k.id = c.creator_id
        where c.run_id = ${runId}
        order by c.rank asc nulls last, c.final_score desc nulls last, c.created_at, c.creator_id`;
      return rows.map(candidateFromDb);
    },

    async saveResult(r, ownerId) {
      const topIds = r.recommendations.map((x) => x.creatorId).filter(isUuid);
      await mapPgErrors(`run ${r.runId}`, () => transaction(sql, async (tx) => {
        await tx`
          insert into analysis.results (id, run_id, owner_id, schema_version, version, result, brand_name, top_creator_ids,
                                        weights, is_partial, expires_at)
          values (${r.resultId}, ${r.runId}, ${ownerId}, ${r.schemaVersion}, ${r.version}, ${jsonb(tx, r)},
                  ${r.brand.name}, ${topIds}, ${jsonb(tx, r.methodology.weights)}, ${r.isPartial},
                  (select case when owner_type = 'guest' then now() + interval '7 days' end
                   from analysis.runs where id = ${r.runId}))
          on conflict (id) do update set
            version = excluded.version, result = excluded.result, brand_name = excluded.brand_name,
            top_creator_ids = excluded.top_creator_ids, weights = excluded.weights, is_partial = excluded.is_partial`;
        await tx`
          insert into analysis.result_versions (result_id, version, reason, weights, result)
          values (${r.resultId}, ${r.version}, 'initial', ${jsonb(tx, r.methodology.weights)}, ${jsonb(tx, r)})
          on conflict (result_id, version) do update set weights = excluded.weights, result = excluded.result`;
      }));
    },

    async getResult(resultId) {
      if (!isUuid(resultId)) return null;
      const [row] = await sql<{ result: unknown; owner_id: string }[]>`
        select result, owner_id from analysis.results where id = ${resultId}`;
      return row ? { result: FinalResult.parse(row.result), ownerId: row.owner_id } : null;
    },

    async saveResultVersion(resultId, r, reason = 'rescore') {
      if (!isUuid(resultId)) throw new StoreError('not_found', `result ${resultId} not found`);
      const topIds = r.recommendations.map((x) => x.creatorId).filter(isUuid);
      return transaction(sql, async (tx) => {
        const [row] = await tx<{ version: number; result: unknown }[]>`
          update analysis.results set
            version = version + 1,
            result = jsonb_set(${jsonb(tx, r)}::jsonb, '{version}', to_jsonb(version + 1)),
            brand_name = ${r.brand.name},
            top_creator_ids = ${topIds},
            weights = ${jsonb(tx, r.methodology.weights)},
            is_partial = ${r.isPartial}
          where id = ${resultId}
          returning version, result`;
        if (!row) throw new StoreError('not_found', `result ${resultId} not found`);
        await tx`
          insert into analysis.result_versions (result_id, version, reason, weights, result)
          values (${resultId}, ${row.version}, ${reason}, ${jsonb(tx, r.methodology.weights)}, ${jsonb(tx, row.result)})`;
        return row.version;
      });
    },

    async getChatSession(resultId, ownerId) {
      if (!isUuid(resultId) || !isUuid(ownerId)) return null;
      const [row] = await sql<ChatSessionRow[]>`
        select id, result_id, owner_id, session_no, mastra_thread_id, research_calls, created_at
        from analysis.chat_sessions
        where result_id = ${resultId} and owner_id = ${ownerId} and status = 'active'
        limit 1`;
      return row ? chatSessionFromRow(row) : null;
    },

    async createChatSession(resultId, ownerId) {
      if (!isUuid(resultId)) throw new StoreError('not_found', `result ${resultId} not found`);
      return transaction(sql, async (tx) => {
        // lock the result so concurrent resets cannot both take the same session_no
        const [res] = await tx<{ id: string }[]>`select id from analysis.results where id = ${resultId} for update`;
        if (!res) throw new StoreError('not_found', `result ${resultId} not found`);
        await tx`
          update analysis.chat_sessions set status = 'reset', ended_at = now()
          where result_id = ${resultId} and status = 'active'`;
        const [{ n } = { n: 1 }] = await tx<{ n: number }[]>`
          select coalesce(max(session_no), 0)::int + 1 as n from analysis.chat_sessions where result_id = ${resultId}`;
        const [row] = await tx<ChatSessionRow[]>`
          insert into analysis.chat_sessions (result_id, owner_id, session_no, mastra_thread_id, mastra_resource_id)
          values (${resultId}, ${ownerId}, ${n}, ${chatThreadId(resultId, n)}, ${chatResourceId(resultId)})
          returning id, result_id, owner_id, session_no, mastra_thread_id, research_calls, created_at`;
        if (!row) throw new Error('createChatSession returned no row');
        return chatSessionFromRow(row);
      });
    },

    async incrementResearchCalls(sessionId) {
      if (!isUuid(sessionId)) throw new StoreError('not_found', `chat session ${sessionId} not found`);
      const [row] = await sql<{ research_calls: number }[]>`
        update analysis.chat_sessions set research_calls = research_calls + 1, last_message_at = now()
        where id = ${sessionId}
        returning research_calls`;
      if (!row) throw new StoreError('not_found', `chat session ${sessionId} not found`);
      return row.research_calls;
    },

    async saveFeedback(resultId, ownerId, f) {
      if (!isUuid(resultId)) throw new StoreError('not_found', `result ${resultId} not found`);
      const creatorId = isUuid(f.creatorId) ? f.creatorId : null;
      await mapPgErrors(`result ${resultId}`, () => sql`
        insert into analysis.feedback (result_id, creator_id, user_id, kind, reason)
        values (${resultId}, (select id from kol.creators where id = ${creatorId}::uuid), ${ownerId}, ${f.kind},
                ${f.reason ?? null})`);
    },

    async claimRuns(userId, items) {
      const valid = items.filter((i) => isUuid(i.runId) && i.claimSecretHash.length > 0);
      if (!isUuid(userId) || valid.length === 0) return 0;
      const payload = valid.map((i) => ({ run_id: i.runId, secret_hash: i.claimSecretHash }));
      try {
        const [row] = await sql<{ n: number }[]>`select private.claim_runs(${userId}, ${jsonb(sql, payload)}) as n`;
        return Number(row?.n ?? 0);
      } catch (err) {
        // raised by claim_runs when the target is missing or still anonymous
        if (pgCode(err) === '22023') throw new StoreError('invalid', 'claim target must be a LINE user');
        throw err;
      }
    },

    async purgeUser(userId) {
      if (!isUuid(userId)) return { runs: 0, threadIds: [] };
      return transaction(sql, async (tx) => {
        // lock the user's results first: createChatSession locks the result too, so no session can appear between
        // reading the thread ids and the cascade below
        await tx`
          select 1 from analysis.results res join analysis.runs r on r.id = res.run_id
          where res.owner_id = ${userId} or r.owner_id = ${userId}
          for update of res`;
        const threads = await tx<{ thread_id: string }[]>`
          select distinct cs.mastra_thread_id as thread_id
          from analysis.chat_sessions cs
          join analysis.results res on res.id = cs.result_id
          join analysis.runs r on r.id = res.run_id
          where cs.owner_id = ${userId} or res.owner_id = ${userId} or r.owner_id = ${userId}`;
        // cascades to results, versions, candidates, evidence, chat_sessions, feedback, app.saved_results / result_shares
        const deleted = await tx`delete from analysis.runs where owner_id = ${userId}`;
        return { runs: deleted.count, threadIds: threads.map((t) => t.thread_id) };
      });
    },

    async loadRefData() {
      const [tierBands, categories, rateCards, tierBenchmarks, kpiBenchmarks] = await Promise.all([
        sql<TierBandRow[]>`select tier, min_followers, max_followers from ref.tier_bands order by sort_order`,
        sql<CategoryRow[]>`
          select id, parent_id, label_th, label_en, tiktok_bc_policy, niche_multiplier
          from ref.categories order by coalesce(parent_id, id), parent_id nulls first, id`,
        sql<RateCardRow[]>`
          select tier, category_id, format, fee_min_thb, fee_max_thb, source from ref.rate_cards
          where valid_from <= current_date and (valid_to is null or valid_to >= current_date)
          order by tier, category_id nulls first, format, source`,
        sql<TierBenchmarkRow[]>`
          select tier, category_id, metric, p25, p50, p75, source from ref.tier_benchmarks
          order by tier, category_id nulls first, metric`,
        sql<KpiBenchmarkRow[]>`
          select objective, category_id, tier, metric, p25, p50, p75, source, note_th from ref.kpi_benchmarks
          order by metric, objective nulls first, category_id nulls first, tier nulls first`,
      ]);
      return RefData.parse({
        tierBands: tierBands.map(tierBandFromRow),
        categories: categories.map(categoryFromRow),
        rateCards: rateCards.map(rateCardFromRow),
        tierBenchmarks: tierBenchmarks.map(tierBenchmarkFromRow),
        kpiBenchmarks: kpiBenchmarks.map(kpiBenchmarkFromRow),
      });
    },

    async listPersonas(ids) {
      return listPersonasPg(sql, ids);
    },
  };
}

export async function listPersonasPg(sql: Queryable, ids?: string[]) {
  const rows = await sql<PersonaRow[]>`
    select id, label_th, label_en, description_th, age_dist, gender_dist, region_dist, interests, category_hints
    from ref.audience_personas
    where is_active ${ids ? sql`and id = any(${ids}::text[])` : sql``}
    order by sort_order, id`;
  return rows.map(personaFromRow);
}
