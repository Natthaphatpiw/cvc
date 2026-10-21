import {
  FinalResult,
  PERSONAS_SEED,
  REF_SEED,
  TERMINAL_STATUSES,
  type CreatorVideo,
  type ProgressEvent,
} from '@cvc/schemas';
import { chatThreadId, clampPct } from './mappers';
import { getMemoryDb, type MemoryDb, type MemRun, type MemVideo } from './memory-db';
import { StoreError, type AgentStore, type ChatSessionRecord, type RunRecord } from './types';
import { canonicalJson, cleanHandle, clone, nowIso } from './util';

const GUEST_TTL_MS = 7 * 24 * 3600 * 1000;
const stepKey = (runId: string, key: string): string => `${runId}\n${key}`;

export function createMemoryAgentStore(db: MemoryDb = getMemoryDb()): AgentStore {
  function toRecord(r: MemRun): RunRecord {
    const { claimSecretHash: _c, expiresAt: _e, startedAt: _s, ...rest } = r;
    const brand = [...db.brandProfiles.values()].find((b) => b.runId === r.id);
    const result = [...db.results.values()].find((x) => x.runId === r.id);
    return clone({ ...rest, brandProfileId: brand?.id ?? null, resultId: result?.id ?? null });
  }

  function requireRun(runId: string): MemRun {
    const run = db.runs.get(runId);
    if (!run) throw new StoreError('not_found', `run ${runId} not found`);
    return run;
  }

  function sessionRecord(s: ChatSessionRecord): ChatSessionRecord {
    return {
      id: s.id,
      resultId: s.resultId,
      ownerId: s.ownerId,
      sessionNo: s.sessionNo,
      threadId: s.threadId,
      researchCallsUsed: s.researchCallsUsed,
      createdAt: s.createdAt,
    };
  }

  return {
    kind: 'memory',

    async createRun(a) {
      const now = nowIso();
      const run: MemRun = {
        id: crypto.randomUUID(),
        ownerId: a.ownerId,
        ownerType: a.ownerType,
        channel: a.channel,
        status: 'queued',
        stage: null,
        progressPct: 0,
        warnings: [],
        input: clone(a.input),
        inputHash: a.inputHash,
        normalizedInput: null,
        errorMessageTh: null,
        isDemo: a.isDemo,
        workflowRunId: null,
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        claimSecretHash: a.claimSecretHash,
        expiresAt: a.ownerType === 'guest' ? new Date(Date.now() + GUEST_TTL_MS).toISOString() : null,
        startedAt: null,
      };
      db.runs.set(run.id, run);
      return toRecord(run);
    },

    async findRecentRunByHash(ownerId, inputHash, withinHours) {
      const since = Date.now() - withinHours * 3600 * 1000;
      const hit = [...db.runs.values()]
        .filter(
          (r) =>
            r.ownerId === ownerId &&
            r.inputHash === inputHash &&
            Date.parse(r.createdAt) > since &&
            r.status !== 'failed' &&
            r.status !== 'cancelled',
        )
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
      return hit ? toRecord(hit) : null;
    },

    async getRun(runId) {
      const run = db.runs.get(runId);
      return run ? toRecord(run) : null;
    },

    async listStaleRuns(olderThanMinutes, limit = 50) {
      const cutoff = Date.now() - olderThanMinutes * 60_000;
      return [...db.runs.values()]
        .filter((r) => !TERMINAL_STATUSES.includes(r.status) && r.status !== 'awaiting_review' && Date.parse(r.updatedAt) < cutoff)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
        .slice(0, Math.min(1000, Math.max(1, Math.floor(limit))))
        .map(toRecord);
    },

    async updateRun(runId, patch) {
      const run = requireRun(runId);
      if (patch.status !== undefined && !TERMINAL_STATUSES.includes(patch.status) && TERMINAL_STATUSES.includes(run.status)) {
        throw new StoreError('conflict', `run ${runId} is already terminal`);
      }
      const now = nowIso();
      if (patch.status !== undefined) {
        run.status = patch.status;
        if (patch.status !== 'queued') run.startedAt ??= now;
        if (TERMINAL_STATUSES.includes(patch.status) && patch.completedAt === undefined) run.completedAt ??= now;
      }
      if (patch.stage !== undefined) run.stage = patch.stage;
      if (patch.progressPct !== undefined) run.progressPct = clampPct(patch.progressPct);
      if (patch.warnings !== undefined) run.warnings = [...patch.warnings];
      if (patch.normalizedInput !== undefined) run.normalizedInput = clone(patch.normalizedInput);
      if (patch.errorMessageTh !== undefined) run.errorMessageTh = patch.errorMessageTh;
      if (patch.workflowRunId !== undefined) run.workflowRunId = patch.workflowRunId;
      if (patch.costUsd !== undefined) run.costUsd = patch.costUsd;
      if (patch.completedAt !== undefined) run.completedAt = patch.completedAt;
      run.updatedAt = now;
    },

    async appendProgress(runId, e) {
      requireRun(runId);
      const list = db.progress.get(runId) ?? [];
      const event: ProgressEvent = { ...clone(e), pct: clampPct(e.pct), seq: list.length + 1, at: nowIso() };
      list.push(event);
      db.progress.set(runId, list);
      return clone(event);
    },

    async listProgress(runId, afterSeq) {
      return clone((db.progress.get(runId) ?? []).filter((e) => e.seq > afterSeq));
    },

    async getStep<T>(runId: string, key: string): Promise<T | null> {
      const step = db.steps.get(stepKey(runId, key));
      return step ? (clone(step.output ?? null) as T | null) : null;
    },

    async putStep(runId, key, output, meta) {
      requireRun(runId);
      db.steps.set(stepKey(runId, key), {
        output: clone(output ?? null),
        costUsd: meta?.costUsd ?? null,
        latencyMs: meta?.latencyMs ?? null,
        model: meta?.model ?? null,
        finishedAt: nowIso(),
      });
    },

    async saveEvidence(runId, cards) {
      if (cards.length === 0) return;
      requireRun(runId);
      const list = db.evidence.get(runId) ?? [];
      const seen = new Set(list.map(canonicalJson));
      for (const card of cards) {
        const key = canonicalJson(card);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(clone(card));
      }
      db.evidence.set(runId, list);
    },

    async listEvidence(runId) {
      return clone(db.evidence.get(runId) ?? []);
    },

    async saveBrandProfile(runId, p) {
      requireRun(runId);
      const existing = [...db.brandProfiles.values()].find((b) => b.runId === runId);
      const id = existing?.id ?? crypto.randomUUID();
      db.brandProfiles.set(id, { id, runId, profile: clone(p) });
      return id;
    },

    async getBrandProfile(id) {
      const hit = db.brandProfiles.get(id);
      return hit ? clone(hit.profile) : null;
    },

    async upsertCreator(p, a) {
      const handle = cleanHandle(p.handle);
      let existing: string | null = null;
      for (const c of db.creators.values()) {
        if (c.platformUserId === p.platformUserId) existing = c.id;
        else if (c.handle === handle) c.handle = `__released_${c.id}`;
      }
      const prev = existing ? db.creators.get(existing) : undefined;
      const id = prev?.id ?? crypto.randomUUID();
      db.creators.set(id, {
        id,
        platformUserId: p.platformUserId,
        handle,
        profile: clone({ ...p, handle }),
        tier: a.tier ?? prev?.tier ?? null,
        avatarUrl: a.avatarUrl ?? prev?.avatarUrl ?? null,
        avatarSourceUrl: p.avatarSourceUrl ?? prev?.avatarSourceUrl ?? null,
        isDemo: a.isDemo,
        updatedAt: nowIso(),
      });
      return id;
    },

    async setCreatorAvatar(creatorId, avatarUrl, sourceUrl) {
      const c = db.creators.get(creatorId);
      if (!c) return;
      c.avatarUrl = avatarUrl;
      c.avatarSourceUrl = sourceUrl;
      c.updatedAt = nowIso();
    },

    async saveVideos(creatorId, videos, coverUrls) {
      if (!db.creators.has(creatorId)) throw new StoreError('not_found', `creator ${creatorId} not found`);
      for (const v of videos) {
        const prev = db.videos.get(v.platformVideoId);
        const row: MemVideo = {
          ...clone<CreatorVideo>(v),
          creatorId,
          coverUrl: coverUrls?.[v.platformVideoId] ?? prev?.coverUrl ?? null,
        };
        db.videos.set(v.platformVideoId, row);
      }
    },

    async saveCandidates(runId, rows) {
      requireRun(runId);
      const byCreator = db.candidates.get(runId) ?? new Map();
      for (const r of rows) {
        if (!db.creators.has(r.creatorId)) throw new StoreError('not_found', `creator ${r.creatorId} not found`);
        byCreator.set(r.creatorId, clone(r));
      }
      db.candidates.set(runId, byCreator);
    },

    async listCandidates(runId) {
      const rows = [...(db.candidates.get(runId)?.values() ?? [])].map((r) => ({
        ...clone(r),
        handle: db.creators.get(r.creatorId)?.handle ?? r.handle,
      }));
      return rows.sort((a, b) => {
        const ra = a.ranked?.rank ?? Number.POSITIVE_INFINITY;
        const rb = b.ranked?.rank ?? Number.POSITIVE_INFINITY;
        if (ra !== rb) return ra - rb;
        return (b.ranked?.total ?? Number.NEGATIVE_INFINITY) - (a.ranked?.total ?? Number.NEGATIVE_INFINITY);
      });
    },

    async saveResult(r, ownerId) {
      const run = requireRun(r.runId);
      const clash = [...db.results.values()].find((x) => x.runId === r.runId && x.id !== r.resultId);
      if (clash) throw new StoreError('conflict', `run ${r.runId} already has result ${clash.id}`);
      const prev = db.results.get(r.resultId);
      db.results.set(r.resultId, {
        id: r.resultId,
        runId: r.runId,
        ownerId,
        version: r.version,
        result: clone(r),
        createdAt: prev?.createdAt ?? nowIso(),
        expiresAt: run.ownerType === 'guest' ? new Date(Date.now() + GUEST_TTL_MS).toISOString() : null,
      });
      db.resultVersions = db.resultVersions.filter((v) => !(v.resultId === r.resultId && v.version === r.version));
      db.resultVersions.push({ resultId: r.resultId, version: r.version, reason: 'initial', result: clone(r), createdAt: nowIso() });
    },

    async getResult(resultId) {
      const hit = db.results.get(resultId);
      return hit ? { result: FinalResult.parse(clone(hit.result)), ownerId: hit.ownerId } : null;
    },

    async saveResultVersion(resultId, r, reason = 'rescore') {
      const hit = db.results.get(resultId);
      if (!hit) throw new StoreError('not_found', `result ${resultId} not found`);
      const version = hit.version + 1;
      const stored = { ...clone(r), version };
      hit.version = version;
      hit.result = stored;
      db.resultVersions.push({ resultId, version, reason, result: clone(stored), createdAt: nowIso() });
      return version;
    },

    async getChatSession(resultId, ownerId) {
      const hit = [...db.chatSessions.values()].find(
        (s) => s.resultId === resultId && s.ownerId === ownerId && s.status === 'active',
      );
      return hit ? sessionRecord(hit) : null;
    },

    async createChatSession(resultId, ownerId) {
      if (!db.results.has(resultId)) throw new StoreError('not_found', `result ${resultId} not found`);
      let max = 0;
      const now = nowIso();
      for (const s of db.chatSessions.values()) {
        if (s.resultId !== resultId) continue;
        max = Math.max(max, s.sessionNo);
        if (s.status === 'active') {
          s.status = 'reset';
          s.endedAt = now;
        }
      }
      const sessionNo = max + 1;
      const session = {
        id: crypto.randomUUID(),
        resultId,
        ownerId,
        sessionNo,
        threadId: chatThreadId(resultId, sessionNo),
        researchCallsUsed: 0,
        createdAt: now,
        status: 'active' as const,
        endedAt: null,
      };
      db.chatSessions.set(session.id, session);
      return sessionRecord(session);
    },

    async incrementResearchCalls(sessionId) {
      const s = db.chatSessions.get(sessionId);
      if (!s) throw new StoreError('not_found', `chat session ${sessionId} not found`);
      s.researchCallsUsed += 1;
      return s.researchCallsUsed;
    },

    async saveFeedback(resultId, ownerId, f) {
      if (!db.results.has(resultId)) throw new StoreError('not_found', `result ${resultId} not found`);
      db.feedback.push({
        id: crypto.randomUUID(),
        resultId,
        creatorId: f.creatorId && db.creators.has(f.creatorId) ? f.creatorId : null,
        userId: ownerId,
        kind: f.kind,
        reason: f.reason ?? null,
        createdAt: nowIso(),
      });
    },

    async claimRuns(userId, items) {
      let claimed = 0;
      for (const item of items) {
        const run = db.runs.get(item.runId);
        if (!run || run.ownerType !== 'guest' || !run.claimSecretHash || run.claimSecretHash !== item.claimSecretHash) continue;
        const previousOwner = run.ownerId;
        run.ownerId = userId;
        run.ownerType = 'line';
        run.expiresAt = null;
        run.claimSecretHash = null;
        run.updatedAt = nowIso();
        for (const res of db.results.values()) {
          if (res.runId !== run.id) continue;
          res.ownerId = userId;
          res.expiresAt = null;
          for (const s of db.chatSessions.values()) if (s.resultId === res.id) s.ownerId = userId;
          for (const fb of db.feedback) if (fb.resultId === res.id && fb.userId === previousOwner) fb.userId = userId;
        }
        claimed += 1;
      }
      return claimed;
    },

    async purgeUser(userId) {
      // mirrors the Postgres cascade from analysis.runs
      const runIds = new Set([...db.runs.values()].filter((r) => r.ownerId === userId).map((r) => r.id));
      const resultIds = new Set(
        [...db.results.values()].filter((x) => runIds.has(x.runId) || x.ownerId === userId).map((x) => x.id),
      );
      const threadIds = new Set<string>();
      for (const s of db.chatSessions.values()) {
        if (s.ownerId === userId || resultIds.has(s.resultId)) threadIds.add(s.threadId);
      }
      const gone = new Set([...db.results.values()].filter((x) => runIds.has(x.runId)).map((x) => x.id));
      for (const runId of runIds) {
        db.runs.delete(runId);
        db.progress.delete(runId);
        db.evidence.delete(runId);
        db.candidates.delete(runId);
      }
      for (const key of [...db.steps.keys()]) if (runIds.has(key.slice(0, key.indexOf('\n')))) db.steps.delete(key);
      for (const [id, b] of db.brandProfiles) if (runIds.has(b.runId)) db.brandProfiles.delete(id);
      for (const id of gone) db.results.delete(id);
      db.resultVersions = db.resultVersions.filter((v) => !gone.has(v.resultId));
      for (const [id, s] of db.chatSessions) if (gone.has(s.resultId)) db.chatSessions.delete(id);
      db.feedback = db.feedback.filter((f) => !gone.has(f.resultId));
      for (const [id, s] of db.saved) if (gone.has(s.resultId)) db.saved.delete(id);
      return { runs: runIds.size, threadIds: [...threadIds] };
    },

    async loadRefData() {
      return clone(REF_SEED);
    },

    async listPersonas(ids) {
      const all = clone(PERSONAS_SEED);
      return ids ? all.filter((p) => ids.includes(p.id)) : all;
    },
  };
}
