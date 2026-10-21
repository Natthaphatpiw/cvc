import { REF_SEED } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { computeExpectedKpis, roundCount } from './kpis';
import { computeMetrics } from './metrics';
import { NOW, daysAgo, metrics, video } from './test-fixtures';

const fee = { min: 15_000, max: 30_000 };

describe('computeExpectedKpis', () => {
  it("uses the creator's own sponsored/organic ratio when there are ≥ 3 sponsored posts", () => {
    const m = metrics({
      videosAnalyzed: 18,
      medianViews: 48_000,
      p25Views: 30_000,
      p75Views: 90_000,
      medianViewsOrganic: 50_000,
      medianViewsSponsored: 40_000,
      sponsoredCount: 4,
      erViewsMedian: 0.07,
    });
    const k = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'awareness', categoryId: 'beauty.skincare', ref: REF_SEED });
    expect(k.basis.method).toBe('creator_history');
    expect(k.basis.sponsoredFactorSource).toBe('creator_history');
    expect(k.basis.sponsoredFactor).toBe(0.8);
    expect(k.basis.sponsoredVideosAnalyzed).toBe(4);
    // organic p50 = 50,000 → × 0.8
    expect(k.perPost.views.p50).toBe(40_000);
    expect(k.perPost.views.p25).toBe(roundCount(30_000 * (50_000 / 48_000) * 0.8));
    expect(k.perPost.views.p75).toBe(roundCount(90_000 * (50_000 / 48_000) * 0.8));
    // ER shrunk toward the micro benchmark (0.039) with k = 8
    expect(k.perPost.erViews).toBeCloseTo((18 * 0.07 + 8 * 0.039) / 26, 4);
    expect(k.perPost.engagements.p50).toBe(roundCount(40_000 * (k.perPost.erViews ?? 0)));
    expect(k.cost.cpv).toEqual({
      p25: Math.round((15_000 / k.perPost.views.p75) * 100) / 100,
      p50: Math.round((22_500 / k.perPost.views.p50) * 100) / 100,
      p75: Math.round((30_000 / k.perPost.views.p25) * 100) / 100,
    });
    expect(k.conversion).toBeNull();
    expect(k.confidence).toBe('high');
    // 17 gaps at 3 posts/week ≈ 40 days
    expect(k.basis.windowDays).toBe(40);
    expect(k.basis.notesTh[0]).toBe('คำนวณยอดวิวจาก 18 คลิปล่าสุด ซึ่งโพสต์ในช่วงราว 40 วัน (ไม่นับคลิปที่โพสต์ไม่ถึง 48 ชั่วโมง)');
  });

  it('states the real span of the analyzed clips instead of a fixed 90-day window', () => {
    // 20 clips at about 1.2 posts/week span about 111 days
    const slow = computeExpectedKpis({ metrics: metrics({ postsPerWeek: 1.2 }), tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(slow.basis.windowDays).toBe(111);
    expect(slow.basis.notesTh[0]).toContain('ในช่วงราว 111 วัน');
    // end to end: 20 clips posted every 6 days really span 114 days
    const real = computeMetrics(
      Array.from({ length: 20 }, (_, i) => video({ platformVideoId: `v${i}`, postedAt: daysAgo(3 + i * 6) })),
      { now: NOW },
    );
    expect(computeExpectedKpis({ metrics: real, tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED }).basis.windowDays).toBe(114);
    const unknown = computeExpectedKpis({ metrics: metrics({ postsPerWeek: null }), tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(unknown.basis.windowDays).toBe(0);
    expect(unknown.basis.notesTh[0]).toBe('คำนวณยอดวิวจาก 20 คลิปล่าสุด (ไม่นับคลิปที่โพสต์ไม่ถึง 48 ชั่วโมง)');
  });

  it('clamps the creator factor to [0.3, 1.5]', () => {
    const m = metrics({ sponsoredCount: 3, medianViewsSponsored: 200_000, medianViewsOrganic: 50_000 });
    const k = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(k.basis.sponsoredFactor).toBe(1.5);
  });

  it('falls back to the sponsored_view_factor benchmark with < 3 sponsored posts', () => {
    const m = metrics({ videosAnalyzed: 10, sponsoredCount: 1, medianViews: 50_000, medianViewsOrganic: 50_000 });
    const k = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(k.basis.sponsoredFactorSource).toBe('benchmark');
    expect(k.basis.sponsoredFactor).toBe(0.8);
    expect(k.perPost.views.p50).toBe(40_000);
    expect(k.basis.benchmarkSources).toContain('assumption_to_calibrate');
    expect(k.confidence).toBe('medium');
    expect(k.basis.notesTh.some((n) => n.includes('สมมติฐาน รอปรับเทียบกับข้อมูลแคมเปญจริง'))).toBe(true);
  });

  it('adds conversion estimates only for conversion objectives', () => {
    const m = metrics({ sponsoredCount: 0, medianViews: 50_000, medianViewsOrganic: 50_000 });
    const conv = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'conversion', categoryId: null, ref: REF_SEED });
    expect(conv.conversion).not.toBeNull();
    expect(conv.conversion?.assumptions).toEqual({ ctr: 0.006, cvr: 0.02, source: 'assumption_to_calibrate' });
    expect(conv.conversion?.clicks.p25).toBe(Math.round(conv.perPost.views.p25 * 0.003));
    expect(conv.conversion?.clicks.p50).toBe(Math.round(conv.perPost.views.p50 * 0.006));
    expect(conv.conversion?.orders.p75).toBe(Math.round(conv.perPost.views.p75 * 0.01 * 0.04));
    expect(conv.basis.notesTh).toContain('ใช้ค่ามาตรฐานอัตราคลิก 0.6% (ช่วง 0.3%–1%) (สมมติฐาน รอปรับเทียบกับข้อมูลแคมเปญจริง)');

    const shop = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'tiktok_shop', categoryId: null, ref: REF_SEED });
    expect(shop.conversion?.assumptions.ctr).toBe(0.01);

    for (const objective of ['awareness', 'launch', 'brand_building', 'ugc'] as const) {
      expect(computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective, categoryId: null, ref: REF_SEED }).conversion).toBeNull();
    }
  });

  it('uses the tier median_views benchmark without usable history', () => {
    const m = metrics({ videosAnalyzed: 0, medianViews: null, p25Views: null, p75Views: null, erViewsMedian: null, sponsoredCount: 0, medianViewsOrganic: null, medianViewsSponsored: null });
    const k = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(k.basis.method).toBe('tier_benchmark');
    expect(k.perPost.views).toEqual({ p25: 4_000, p50: 12_000, p75: 32_000 });
    expect(k.perPost.erViews).toBe(0.039);
    expect(k.confidence).toBe('low');
    expect(k.basis.benchmarkSources).toEqual(expect.arrayContaining(['assumption_to_calibrate', 'socialinsider_2025']));
  });

  it('blends creator history with the benchmark when there are 1–4 videos', () => {
    const m = metrics({ videosAnalyzed: 3, medianViews: 15_000, p25Views: 5_000, p75Views: 40_000, medianViewsOrganic: 15_000, sponsoredCount: 0 });
    const k = computeExpectedKpis({ metrics: m, tier: 'micro', fee, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(k.basis.method).toBe('mixed');
    // creator and benchmark coincide here, so the blend returns the same distribution
    expect(k.perPost.views).toEqual({ p25: 4_000, p50: 12_000, p75: 32_000 });
    expect(k.confidence).toBe('low');
  });

  it('returns null cost ratios without a fee', () => {
    const k = computeExpectedKpis({ metrics: metrics(), tier: null, fee: { min: 0, max: 0 }, objective: 'awareness', categoryId: null, ref: REF_SEED });
    expect(k.cost.cpv).toBeNull();
    expect(k.cost.cpe).toBeNull();
  });
});

describe('roundCount', () => {
  it('rounds estimates to sensible integers', () => {
    expect(roundCount(987.4)).toBe(987);
    expect(roundCount(12_345)).toBe(12_350);
    expect(roundCount(123_456)).toBe(123_500);
    expect(roundCount(1_234_567)).toBe(1_235_000);
    expect(roundCount(-5)).toBe(0);
  });
});
