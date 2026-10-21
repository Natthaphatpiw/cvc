import { PERSONAS_SEED, REF_SEED, RunInput, type CandidateRef, type CreatorProfile, type FinalResult } from '@cvc/schemas';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryAgentStore, createMemoryApiStore, inputHash, resetMemoryDb, StoreError } from './index';
import { getMemoryDb } from './memory-db';

const OWNER = '00000000-0000-4000-8000-000000000001';
const LINE_USER = '00000000-0000-4000-8000-000000000002';

const input = RunInput.parse({ companyName: 'ร้านกาแฟสมมติ', noticeVersion: '2026-10-21' });

/** Puts a minimal result row for runId straight into the memory db (only the fields the stores read). */
function seedResult(runId: string, ownerId: string, brandName: string): string {
  const id = crypto.randomUUID();
  const result = { brand: { name: brandName, logoUrl: null }, recommendations: [], isPartial: false } as unknown as FinalResult;
  getMemoryDb().results.set(id, { id, runId, ownerId, version: 1, result, createdAt: new Date().toISOString(), expiresAt: null });
  return id;
}

const profile: CreatorProfile = {
  platform: 'tiktok',
  platformUserId: 'puid-1',
  handle: '@demo_creator',
  displayName: 'Demo',
  bio: null,
  bioLink: null,
  avatarSourceUrl: null,
  isVerified: false,
  region: 'TH',
  language: 'th',
  isShopSeller: null,
  isCommerceUser: null,
  followerCount: 52_000,
  followingCount: 10,
  likesCount: 900_000,
  videoCount: 120,
};

describe('memory AgentStore', () => {
  beforeEach(() => resetMemoryDb());

  it('creates a run, appends progress and lists it after a seq', async () => {
    const store = createMemoryAgentStore();
    const hash = await inputHash(input);
    const run = await store.createRun({
      ownerId: OWNER,
      ownerType: 'guest',
      channel: 'web',
      input,
      inputHash: hash,
      claimSecretHash: 'secret-hash',
      isDemo: true,
    });
    expect(run).toMatchObject({ status: 'queued', progressPct: 0, isDemo: true, resultId: null, brandProfileId: null });

    const e1 = await store.appendProgress(run.id, { stage: 'normalize', status: 'started', pct: 5, messageTh: 'เริ่ม' });
    const e2 = await store.appendProgress(run.id, { stage: 'normalize', status: 'completed', pct: 10.4, messageTh: 'เสร็จ' });
    expect([e1.seq, e2.seq]).toEqual([1, 2]);
    expect(e2.pct).toBe(10);
    expect(typeof e1.at).toBe('string');

    expect((await store.listProgress(run.id, 0)).map((e) => e.seq)).toEqual([1, 2]);
    expect((await store.listProgress(run.id, 1)).map((e) => e.seq)).toEqual([2]);

    await store.updateRun(run.id, { status: 'normalizing', stage: 'normalize', progressPct: 10 });
    expect(await store.getRun(run.id)).toMatchObject({ status: 'normalizing', stage: 'normalize', progressPct: 10 });
    expect(await store.findRecentRunByHash(OWNER, hash, 24)).toMatchObject({ id: run.id });

    await store.updateRun(run.id, { status: 'failed' });
    expect(await store.findRecentRunByHash(OWNER, hash, 24)).toBeNull();
  });

  it('checkpoints steps, candidates, results and claims guest runs', async () => {
    const store = createMemoryAgentStore();
    const run = await store.createRun({
      ownerId: OWNER,
      ownerType: 'guest',
      channel: 'web',
      input,
      inputHash: await inputHash(input),
      claimSecretHash: 'h1',
      isDemo: true,
    });

    expect(await store.getStep(run.id, 'llm0.normalize')).toBeNull();
    await store.putStep(run.id, 'llm0.normalize', { ok: 1 }, { costUsd: 0.01 });
    expect(await store.getStep<{ ok: number }>(run.id, 'llm0.normalize')).toEqual({ ok: 1 });

    const creatorId = await store.upsertCreator(profile, { tier: 'micro', avatarUrl: null, isDemo: true });
    expect(await store.upsertCreator({ ...profile, followerCount: 53_000 }, { tier: 'micro', avatarUrl: null, isDemo: true })).toBe(creatorId);

    const ref: CandidateRef = {
      platformUserId: 'puid-1',
      handle: 'demo_creator',
      followers: 52_000,
      region: 'TH',
      videoCount: 120,
      lastPostedAt: null,
      matchedQuery: 'กาแฟ',
      avatarSourceUrl: null,
    };
    await store.saveCandidates(run.id, [
      { creatorId, handle: 'demo_creator', status: 'discovered', candidateRef: ref, dossier: null, evaluation: null, ranked: null, gateFailures: [], suspectedInjection: false, estFeeTHB: null, semantic: null },
    ]);
    const [cand] = await store.listCandidates(run.id);
    expect(cand).toMatchObject({ creatorId, handle: 'demo_creator', status: 'discovered' });

    expect(await store.claimRuns(LINE_USER, [{ runId: run.id, claimSecretHash: 'wrong' }])).toBe(0);
    expect(await store.claimRuns(LINE_USER, [{ runId: run.id, claimSecretHash: 'h1' }])).toBe(1);
    expect(await store.getRun(run.id)).toMatchObject({ ownerId: LINE_USER, ownerType: 'line' });
  });

  it('lists stale in-flight runs oldest first, skipping terminal and awaiting_review', async () => {
    const store = createMemoryAgentStore();
    const make = async (status: 'queued' | 'discovering' | 'awaiting_review' | 'completed', minutesAgo: number) => {
      const run = await store.createRun({ ownerId: OWNER, ownerType: 'guest', channel: 'web', input, inputHash: 'h', claimSecretHash: null, isDemo: true });
      if (status !== 'queued') await store.updateRun(run.id, { status });
      const mem = getMemoryDb().runs.get(run.id);
      if (mem) mem.updatedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
      return run.id;
    };
    const older = await make('discovering', 60);
    const old = await make('queued', 20);
    await make('awaiting_review', 90);
    await make('completed', 90);
    await make('discovering', 5);

    expect((await store.listStaleRuns(15)).map((r) => r.id)).toEqual([older, old]);
    expect((await store.listStaleRuns(15, 1)).map((r) => r.id)).toEqual([older]);
    expect(await store.listStaleRuns(120)).toEqual([]);
  });

  it('never lets a non-terminal status replace a terminal one', async () => {
    const store = createMemoryAgentStore();
    const run = await store.createRun({ ownerId: OWNER, ownerType: 'guest', channel: 'web', input, inputHash: 'h', claimSecretHash: null, isDemo: true });
    await store.updateRun(run.id, { status: 'evaluating', stage: 'evaluate', progressPct: 60 });
    await store.updateRun(run.id, { status: 'cancelled' });

    const err = await store.updateRun(run.id, { status: 'ranking', stage: 'rank', progressPct: 80 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as StoreError).code).toBe('conflict');
    expect(await store.getRun(run.id)).toMatchObject({ status: 'cancelled', stage: 'evaluate', progressPct: 60 });

    // patches without a status, and terminal statuses, still apply
    await store.updateRun(run.id, { warnings: ['w'] });
    await store.updateRun(run.id, { status: 'failed' });
    expect(await store.getRun(run.id)).toMatchObject({ status: 'failed', warnings: ['w'] });
  });

  it('purges a user\'s runs with their dependants and returns the chat thread ids', async () => {
    const store = createMemoryAgentStore();
    const api = createMemoryApiStore();
    await api.upsertLineUser({ userId: LINE_USER, lineSub: `U${'b'.repeat(32)}`, displayName: null, pictureUrl: null });
    const mine = await store.createRun({ ownerId: LINE_USER, ownerType: 'line', channel: 'web', input, inputHash: 'h1', claimSecretHash: null, isDemo: true });
    const pending = await store.createRun({ ownerId: LINE_USER, ownerType: 'line', channel: 'web', input, inputHash: 'h2', claimSecretHash: null, isDemo: true });
    const other = await store.createRun({ ownerId: OWNER, ownerType: 'guest', channel: 'web', input, inputHash: 'h3', claimSecretHash: null, isDemo: true });
    await store.appendProgress(mine.id, { stage: 'normalize', status: 'started', pct: 5, messageTh: 'เริ่ม' });
    await store.putStep(mine.id, 'llm0.normalize', { ok: 1 });
    await store.putStep(other.id, 'llm0.normalize', { ok: 2 });
    const myResult = seedResult(mine.id, LINE_USER, 'แบรนด์เอ');
    const otherResult = seedResult(other.id, OWNER, 'แบรนด์บี');
    const session = await store.createChatSession(myResult, LINE_USER);
    await store.createChatSession(otherResult, OWNER);
    await store.saveFeedback(myResult, LINE_USER, { kind: 'thumbs_up', creatorId: null, reason: null });
    await api.saveResult(LINE_USER, { resultId: myResult, title: 'บันทึก', note: null, tags: [] });

    expect(await store.purgeUser(LINE_USER)).toEqual({ runs: 2, threadIds: [session.threadId] });
    expect(await store.getRun(mine.id)).toBeNull();
    expect(await store.getRun(pending.id)).toBeNull();
    expect(await store.listProgress(mine.id, 0)).toEqual([]);
    expect(await store.getStep(mine.id, 'llm0.normalize')).toBeNull();
    expect(await store.getResult(myResult)).toBeNull();
    expect(await store.getChatSession(myResult, LINE_USER)).toBeNull();
    expect(getMemoryDb().feedback).toEqual([]);
    expect(await api.listSaved(LINE_USER)).toEqual([]);
    // other owners are untouched
    expect(await store.getRun(other.id)).not.toBeNull();
    expect(await store.getStep(other.id, 'llm0.normalize')).toEqual({ ok: 2 });
    expect(await store.getChatSession(otherResult, OWNER)).not.toBeNull();
    expect(await store.purgeUser(LINE_USER)).toEqual({ runs: 0, threadIds: [] });
  });

  it('serves the static seeds', async () => {
    const store = createMemoryAgentStore();
    expect(await store.loadRefData()).toEqual(REF_SEED);
    expect(await store.listPersonas()).toHaveLength(PERSONAS_SEED.length);
    expect((await store.listPersonas(['new_mom'])).map((p) => p.id)).toEqual(['new_mom']);
  });
});

describe('memory ApiStore', () => {
  beforeEach(() => resetMemoryDb());

  it('upserts a LINE user, tracks the notice ack and paginates history', async () => {
    const agent = createMemoryAgentStore();
    const api = createMemoryApiStore();
    await api.upsertLineUser({ userId: LINE_USER, lineSub: `U${'a'.repeat(32)}`, displayName: 'คุณเอ', pictureUrl: null });
    const saved = process.env.NOTICE_VERSION;
    process.env.NOTICE_VERSION = 'notice-v2';
    try {
      expect(await api.getUser(LINE_USER)).toMatchObject({ isAnonymous: false, needsNoticeAck: true, role: 'member' });
      await api.recordConsent(LINE_USER, { consentType: 'privacy_notice_ack', version: 'notice-v1', granted: true });
      expect(await api.getUser(LINE_USER)).toMatchObject({ needsNoticeAck: true });
      await api.recordConsent(LINE_USER, { consentType: 'privacy_notice_ack', version: 'notice-v2', granted: true });
      expect(await api.getUser(LINE_USER)).toMatchObject({ needsNoticeAck: false });
    } finally {
      if (saved === undefined) delete process.env.NOTICE_VERSION;
      else process.env.NOTICE_VERSION = saved;
    }

    for (let i = 0; i < 3; i++) {
      await agent.createRun({ ownerId: LINE_USER, ownerType: 'line', channel: 'liff', input, inputHash: `h${i}`, claimSecretHash: null, isDemo: true });
    }
    const first = await api.listHistory(LINE_USER, null, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await api.listHistory(LINE_USER, first.nextCursor, 2);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('shows the submitted company name in history until a result exists', async () => {
    const agent = createMemoryAgentStore();
    const api = createMemoryApiStore();
    const run = await agent.createRun({ ownerId: LINE_USER, ownerType: 'line', channel: 'web', input, inputHash: 'h', claimSecretHash: null, isDemo: true });
    expect((await api.listHistory(LINE_USER, null, 10)).items[0]).toMatchObject({ resultId: null, brandName: 'ร้านกาแฟสมมติ' });
    const resultId = seedResult(run.id, LINE_USER, 'แบรนด์จริง');
    expect((await api.listHistory(LINE_USER, null, 10)).items[0]).toMatchObject({ resultId, brandName: 'แบรนด์จริง' });
  });
});

describe('inputHash', () => {
  it('ignores options, channel and notice version but not the company', async () => {
    const a = await inputHash(input);
    const b = await inputHash(RunInput.parse({ companyName: '  ร้านกาแฟสมมติ ', noticeVersion: 'x', channel: 'liff', options: { force: true } }));
    const c = await inputHash(RunInput.parse({ companyName: 'อีกร้าน', noticeVersion: '2026-10-21' }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });
});
