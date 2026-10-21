import { PERSONAS_SEED, REF_SEED, type HistoryItem, type SavedResult } from '@cvc/schemas';
import { currentNoticeVersion, decodeCursor, encodeCursor, isLineUserId, NOTICE_CONSENT, top3FromJson } from './mappers';
import { getMemoryDb, type MemoryDb, type MemSaved } from './memory-db';
import { StoreError, type ApiStore } from './types';
import { clone, nowIso } from './util';

function savedDto(s: MemSaved): SavedResult {
  const { userId: _u, ...dto } = s;
  return clone(dto);
}

export function createMemoryApiStore(db: MemoryDb = getMemoryDb()): ApiStore {
  return {
    kind: 'memory',

    async upsertLineUser(a) {
      const lineUserId = isLineUserId(a.lineSub) ? a.lineSub : null;
      const now = nowIso();
      if (lineUserId) {
        for (const u of db.users.values()) if (u.lineUserId === lineUserId && u.id !== a.userId) u.lineUserId = null;
      }
      const prev = db.users.get(a.userId);
      db.users.set(a.userId, {
        id: a.userId,
        lineUserId: lineUserId ?? prev?.lineUserId ?? null,
        displayName: a.displayName ?? prev?.displayName ?? null,
        pictureUrl: a.pictureUrl ?? prev?.pictureUrl ?? null,
        role: prev?.role ?? 'member',
        isOaFriend: prev?.isOaFriend ?? false,
        pushOptIn: prev?.pushOptIn ?? false,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      });
    },

    async getUser(userId) {
      const u = db.users.get(userId);
      if (!u || u.deletedAt) return null;
      const version = currentNoticeVersion();
      const acked = db.consents.some(
        (c) =>
          c.userId === userId &&
          c.consentType === NOTICE_CONSENT &&
          c.granted &&
          c.revokedAt === null &&
          (version === null || c.version === version),
      );
      return {
        userId: u.id,
        isAnonymous: false,
        displayName: u.displayName,
        pictureUrl: u.pictureUrl,
        role: u.role,
        isOaFriend: u.isOaFriend,
        pushOptIn: u.pushOptIn,
        needsNoticeAck: !acked,
      };
    },

    async recordConsent(userId, c) {
      const user = db.users.get(userId);
      if (!user) return;
      const now = nowIso();
      const prev = db.consents.find((x) => x.userId === userId && x.consentType === c.consentType && x.version === c.version);
      if (prev) {
        prev.granted = c.granted;
        prev.grantedAt = now;
        prev.revokedAt = c.granted ? null : now;
      } else {
        db.consents.push({ userId, consentType: c.consentType, version: c.version, granted: c.granted, grantedAt: now, revokedAt: c.granted ? null : now });
      }
      if (c.consentType === 'push_notification') user.pushOptIn = c.granted;
    },

    async listHistory(userId, cursor, limit) {
      const size = Math.min(100, Math.max(1, Math.floor(limit)));
      const after = decodeCursor(cursor);
      const all = [...db.runs.values()]
        .filter((r) => r.ownerId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .filter((r) => !after || r.createdAt < after.createdAt || (r.createdAt === after.createdAt && r.id < after.runId));
      const page = all.slice(0, size);
      const items: HistoryItem[] = page.map((r) => {
        const res = [...db.results.values()].find((x) => x.runId === r.id);
        const top3 = res
          ? top3FromJson(
              res.result.recommendations
                .slice(0, 3)
                .map((x) => ({ handle: x.handle, avatarUrl: x.avatarUrl, score: x.scores.total })),
            )
          : null;
        return {
          runId: r.id,
          status: r.status,
          channel: r.channel,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
          resultId: res?.id ?? null,
          brandName: res?.result.brand.name ?? r.input.companyName,
          isPartial: res?.result.isPartial ?? null,
          expiresAt: res?.expiresAt ?? null,
          version: res?.version ?? null,
          brandLogoUrl: res?.result.brand.logoUrl ?? null,
          top3,
        };
      });
      const last = page[page.length - 1];
      return { items, nextCursor: all.length > size && last ? encodeCursor(last.createdAt, last.id) : null };
    },

    async listSaved(userId) {
      return [...db.saved.values()]
        .filter((s) => s.userId === userId)
        .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.createdAt.localeCompare(a.createdAt))
        .map(savedDto);
    },

    async saveResult(userId, r) {
      if (!db.users.has(userId)) throw new StoreError('not_found', `user ${userId} not found`);
      const res = db.results.get(r.resultId);
      // The agent owns results; in a separate api process its memory store has none, so only enforce ownership
      // when the result is visible here.
      if (res && res.ownerId !== userId) throw new StoreError('not_found', `result ${r.resultId} not found`);
      const now = nowIso();
      const prev = [...db.saved.values()].find((s) => s.userId === userId && s.resultId === r.resultId);
      const row: MemSaved = {
        id: prev?.id ?? crypto.randomUUID(),
        userId,
        resultId: r.resultId,
        title: r.title,
        note: r.note,
        tags: [...r.tags],
        isPinned: prev?.isPinned ?? false,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      db.saved.set(row.id, row);
      return savedDto(row);
    },

    async updateSaved(userId, id, patch) {
      const s = db.saved.get(id);
      if (!s || s.userId !== userId) return null;
      if (patch.title !== undefined) s.title = patch.title;
      if (patch.note !== undefined) s.note = patch.note;
      if (patch.tags !== undefined) s.tags = [...patch.tags];
      if (patch.isPinned !== undefined) s.isPinned = patch.isPinned;
      s.updatedAt = nowIso();
      return savedDto(s);
    },

    async deleteSaved(userId, id) {
      const s = db.saved.get(id);
      if (!s || s.userId !== userId) return false;
      db.saved.delete(id);
      return true;
    },

    async listPersonas() {
      return clone(PERSONAS_SEED);
    },

    async listCategories() {
      return clone(REF_SEED.categories);
    },

    async setOaFriend(lineSub, isFriend) {
      for (const u of db.users.values()) if (u.lineUserId === lineSub) u.isOaFriend = isFriend;
    },
  };
}
