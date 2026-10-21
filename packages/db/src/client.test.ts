import { describe, expect, it } from 'vitest';
import { sslOption } from './client';

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
