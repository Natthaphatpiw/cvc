import { beforeEach, describe, expect, it } from 'vitest';
import { cosine, embed } from './index';
import { setStubEnv } from './test/fixtures';

beforeEach(() => setStubEnv());

describe('embed stub (hashed bag-of-words)', () => {
  it('returns normalized vectors with the configured dimensions', async () => {
    const [v] = await embed(['รีวิวครีมกันแดดสำหรับผิวแพ้ง่าย']);
    expect(v).toHaveLength(1536);
    expect(Math.sqrt((v ?? []).reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 6);
    process.env.OPENAI_EMBEDDING_DIMENSIONS = '256';
    const [w] = await embed(['hello']);
    expect(w).toHaveLength(256);
  });

  it('is deterministic and keeps cosine meaningful', async () => {
    const [a, b, c, a2] = await embed([
      'รีวิวครีมกันแดดสำหรับผิวแพ้ง่าย เนื้อบางเบา',
      'กันแดดสำหรับผิวแพ้ง่าย รีวิวจริง',
      'สตรีมเกมมือถือ แข่ง rov ทั้งคืน',
      'รีวิวครีมกันแดดสำหรับผิวแพ้ง่าย เนื้อบางเบา',
    ]);
    if (!a || !b || !c || !a2) throw new Error('missing vectors');
    expect(cosine(a, a2)).toBeCloseTo(1, 10);
    expect(cosine(a, b)).toBeGreaterThan(0.4);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c) + 0.3);
  });

  it('handles empty input and edge cases', async () => {
    expect(await embed([])).toEqual([]);
    const [z] = await embed(['']);
    expect(cosine(z ?? [], z ?? [])).toBe(0);
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });
});
