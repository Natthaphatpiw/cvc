import { listPersonasPg } from './agent-store.pg';
import { pgCode, type Sql } from './client';
import {
  categoryFromRow,
  currentNoticeVersion,
  decodeCursor,
  encodeCursor,
  historyFromRow,
  isLineUserId,
  meFromRow,
  NOTICE_CONSENT,
  savedFromRow,
  savedPatchColumns,
  type CategoryRow,
  type HistoryRow,
  type SavedRow,
  type UserRow,
} from './mappers';
import { StoreError, type ApiStore } from './types';
import { isUuid } from './util';

export function createPgApiStore(sql: Sql): ApiStore {
  return {
    kind: 'postgres',

    async upsertLineUser(a) {
      const lineUserId = isLineUserId(a.lineSub) ? a.lineSub : null;
      await sql.begin(async (tx) => {
        if (lineUserId) {
          // a LINE account re-linked to a new auth user: free the unique line_user_id on the stale row first
          await tx`update app.users set line_user_id = null where line_user_id = ${lineUserId} and id <> ${a.userId}`;
        }
        await tx`
          insert into app.users (id, line_user_id, display_name, picture_url, last_seen_at)
          values (${a.userId}, ${lineUserId}, ${a.displayName}, ${a.pictureUrl}, now())
          on conflict (id) do update set
            line_user_id = coalesce(excluded.line_user_id, app.users.line_user_id),
            display_name = coalesce(excluded.display_name, app.users.display_name),
            picture_url = coalesce(excluded.picture_url, app.users.picture_url),
            last_seen_at = now(),
            deleted_at = null`;
      });
    },

    async getUser(userId) {
      if (!isUuid(userId)) return null;
      const version = currentNoticeVersion();
      const [row] = await sql<UserRow[]>`
        select u.id, u.display_name, u.picture_url, u.role, u.is_oa_friend, u.push_opt_in,
               not exists (
                 select 1 from app.user_consents c
                 where c.user_id = u.id and c.consent_type = ${NOTICE_CONSENT} and c.granted and c.revoked_at is null
                   and (${version}::text is null or c.version = ${version}::text)
               ) as needs_notice_ack
        from app.users u
        where u.id = ${userId} and u.deleted_at is null`;
      return row ? meFromRow(row) : null;
    },

    async recordConsent(userId, c) {
      if (!isUuid(userId)) return;
      await sql.begin(async (tx) => {
        const rows = await tx`
          insert into app.user_consents (user_id, consent_type, version, granted)
          select ${userId}::uuid, ${c.consentType}, ${c.version}, ${c.granted}
          where exists (select 1 from app.users where id = ${userId}::uuid)
          on conflict (user_id, consent_type, version) do update set
            granted = excluded.granted,
            granted_at = now(),
            revoked_at = case when excluded.granted then null else now() end
          returning 1`;
        if (rows.length > 0 && c.consentType === 'push_notification') {
          await tx`update app.users set push_opt_in = ${c.granted} where id = ${userId}`;
        }
      });
    },

    async listHistory(userId, cursor, limit) {
      if (!isUuid(userId)) return { items: [], nextCursor: null };
      const size = Math.min(100, Math.max(1, Math.floor(limit)));
      const after = decodeCursor(cursor);
      const keyset = after && isUuid(after.runId);
      const rows = await sql<(HistoryRow & { cursor_ts: string })[]>`
        select run_id, status, channel, created_at, completed_at, result_id, brand_name, is_partial, expires_at, version,
               brand_logo_url, top3,
               to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_ts
        from app.v_user_history
        where owner_id = ${userId}
          ${keyset ? sql`and (created_at, run_id) < (${after.createdAt}::timestamptz, ${after.runId}::uuid)` : sql``}
        order by created_at desc, run_id desc
        limit ${size + 1}`;
      const page = rows.slice(0, size);
      const last = page[page.length - 1];
      return {
        items: page.map(historyFromRow),
        nextCursor: rows.length > size && last ? encodeCursor(last.cursor_ts, last.run_id) : null,
      };
    },

    async listSaved(userId) {
      if (!isUuid(userId)) return [];
      const rows = await sql<SavedRow[]>`
        select id, result_id, title, note, tags, is_pinned, created_at, updated_at from app.saved_results
        where user_id = ${userId}
        order by is_pinned desc, created_at desc`;
      return rows.map(savedFromRow);
    },

    async saveResult(userId, r) {
      if (!isUuid(userId) || !isUuid(r.resultId)) throw new StoreError('not_found', `result ${r.resultId} not found`);
      try {
        const [row] = await sql<SavedRow[]>`
          insert into app.saved_results (user_id, result_id, title, note, tags)
          values (${userId}, ${r.resultId}, ${r.title}, ${r.note}, ${r.tags})
          on conflict (user_id, result_id) do update set title = excluded.title, note = excluded.note, tags = excluded.tags
          returning id, result_id, title, note, tags, is_pinned, created_at, updated_at`;
        if (!row) throw new Error('saveResult returned no row');
        return savedFromRow(row);
      } catch (err) {
        // composite FK (result_id, user_id) → analysis.results(id, owner_id): missing or not owned by this user
        if (pgCode(err) === '23503') throw new StoreError('not_found', `result ${r.resultId} not found`);
        throw err;
      }
    },

    async updateSaved(userId, id, patch) {
      if (!isUuid(userId) || !isUuid(id)) return null;
      const columns = savedPatchColumns(patch);
      const names = Object.keys(columns);
      const [row] =
        names.length > 0
          ? await sql<SavedRow[]>`
              update app.saved_results set ${sql(columns, names)}
              where id = ${id} and user_id = ${userId}
              returning id, result_id, title, note, tags, is_pinned, created_at, updated_at`
          : await sql<SavedRow[]>`
              select id, result_id, title, note, tags, is_pinned, created_at, updated_at
              from app.saved_results where id = ${id} and user_id = ${userId}`;
      return row ? savedFromRow(row) : null;
    },

    async deleteSaved(userId, id) {
      if (!isUuid(userId) || !isUuid(id)) return false;
      const rows = await sql`delete from app.saved_results where id = ${id} and user_id = ${userId} returning id`;
      return rows.length > 0;
    },

    async listPersonas() {
      return listPersonasPg(sql);
    },

    async listCategories() {
      const rows = await sql<CategoryRow[]>`
        select id, parent_id, label_th, label_en, tiktok_bc_policy, niche_multiplier
        from ref.categories order by coalesce(parent_id, id), parent_id nulls first, id`;
      return rows.map(categoryFromRow);
    },

    async setOaFriend(lineSub, isFriend) {
      if (!isLineUserId(lineSub)) return;
      await sql`update app.users set is_oa_friend = ${isFriend} where line_user_id = ${lineSub}`;
    },
  };
}
