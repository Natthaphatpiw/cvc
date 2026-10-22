import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sslOption, transaction, type Sql } from './client';

describe('sslOption', () => {
  it('requires TLS for remote hosts', () => {
    expect(sslOption('postgres://svc_api.ref:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres')).toBe('require');
    expect(sslOption('not a url')).toBe('require');
  });

  it('leaves local servers in plaintext', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect(sslOption(`postgres://u:p@${host}:5432/db`)).toBeUndefined();
  });

  it('defers to a mode set in the URL', () => {
    expect(sslOption('postgres://u:p@db.example.com:5432/db?sslmode=disable')).toBeUndefined();
    expect(sslOption('postgres://u:p@db.example.com:5432/db?sslmode=verify-full')).toBeUndefined();
    expect(sslOption('postgres://u:p@db.example.com:5432/db?sslrootcert=system')).toBeUndefined();
  });
});

/** A reserved connection that records each statement; statements in `fail` reject with the given error. */
function fakeSql(fail: Record<string, unknown> = {}) {
  const calls: string[] = [];
  let released = 0;
  const tx = Object.assign(
    (strings: TemplateStringsArray) => {
      const text = strings.join('?').trim();
      calls.push(text);
      return text in fail ? Promise.reject(fail[text]) : Promise.resolve([]);
    },
    { release: () => void (released += 1) },
  );
  const sql = { reserve: async () => tx } as unknown as Sql;
  return { sql, calls, released: () => released };
}

const closedError = () => Object.assign(new Error('write CONNECTION_CLOSED'), { code: 'CONNECTION_CLOSED' });

describe('transaction', () => {
  it('commits and releases the connection when fn resolves', async () => {
    const db = fakeSql();
    await expect(transaction(db.sql, async (tx) => (await tx`select 1`, 7))).resolves.toBe(7);
    expect(db.calls).toEqual(['begin', 'select 1', 'commit']);
    expect(db.released()).toBe(1);
  });

  it('rolls back, rethrows and releases when fn throws', async () => {
    const db = fakeSql();
    await expect(transaction(db.sql, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(db.calls).toEqual(['begin', 'rollback']);
    expect(db.released()).toBe(1);
  });

  it('does not reuse a connection that closed mid-transaction', async () => {
    const db = fakeSql({ 'select 1': closedError() });
    await expect(transaction(db.sql, async (tx) => tx`select 1`)).rejects.toThrow('CONNECTION_CLOSED');
    expect(db.calls).toEqual(['begin', 'select 1']);
    expect(db.released()).toBe(0);
  });

  it('does not release when the connection closes during rollback', async () => {
    const db = fakeSql({ rollback: closedError() });
    await expect(transaction(db.sql, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(db.released()).toBe(0);
  });

  it('stores never call sql.begin, which breaks with max_pipeline 0', () => {
    for (const file of ['agent-store.pg.ts', 'api-store.pg.ts']) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/\.begin\(/);
    }
  });
});
