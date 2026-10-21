// Small numeric helpers shared by the scoring modules. All pure.

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number): number => clamp(x, 0, 1);

export function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export const isNum = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: readonly number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** Linear-interpolated quantile (type 7, same as numpy default). */
export function quantile(xs: readonly number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * clamp01(q);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] as number;
  const b = s[hi] as number;
  return a + (b - a) * (pos - lo);
}

export const median = (xs: readonly number[]): number | null => quantile(xs, 0.5);

/** Mid-rank (Hazen) percentile of x within ref: (count below + half the ties) / n. 0.5 for an empty reference. */
export function pctRank(x: number, ref: readonly number[]): number {
  if (ref.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const r of ref) {
    if (r < x) below += 1;
    else if (r === x) equal += 1;
  }
  return (below + 0.5 * equal) / ref.length;
}

/**
 * Percentile of x against a benchmark described only by p25/p50/p75: piecewise linear through
 * (0,0) (p25,.25) (p50,.5) (p75,.75), then linear up to 1 at p75 + (p75 - p25). With `log`, interpolates in log10 space.
 */
export function pctFromQuartiles(x: number, b: { p25: number; p50: number; p75: number }, log = false): number {
  const t = (v: number) => (log ? Math.log10(Math.max(v, 1)) : v);
  const v = t(x);
  const q1 = t(b.p25);
  const q2 = t(b.p50);
  const q3 = t(b.p75);
  if (v <= q1) return q1 <= 0 ? 0 : clamp01((0.25 * v) / q1);
  if (v <= q2) return q2 === q1 ? 0.5 : 0.25 + (0.25 * (v - q1)) / (q2 - q1);
  if (v <= q3) return q3 === q2 ? 0.75 : 0.5 + (0.25 * (v - q2)) / (q3 - q2);
  const span = q3 - q1;
  return span <= 0 ? 1 : clamp01(0.75 + (0.25 * (v - q3)) / span);
}

/** 32-bit FNV-1a hash of a string, e.g. a run id, as a PRNG seed (scoreCandidates and rescore must share it). */
export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  // Box-Muller; 1 - rand() avoids log(0).
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) via Marsaglia-Tsang, with the shape+1 boost for shape < 1. */
export function sampleGamma(shape: number, rand: () => number): number {
  if (shape <= 0) return 0;
  if (shape < 1) return sampleGamma(shape + 1, rand) * Math.pow(1 - rand(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - rand();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** One Dirichlet draw; zero concentrations stay exactly zero. */
export function sampleDirichlet(alpha: readonly number[], rand: () => number): number[] {
  const g = alpha.map((a) => (a > 0 ? sampleGamma(a, rand) : 0));
  const s = g.reduce((acc, x) => acc + x, 0);
  return s > 0 ? g.map((x) => x / s) : alpha.map(() => 0);
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
/** '22,500' — used inside Thai template strings. */
export const fmtInt = (n: number): string => nf.format(Math.round(n));
/** '฿15,000–30,000' */
export const fmtTHBRange = (r: { min: number; max: number }): string =>
  Math.round(r.min) === Math.round(r.max) ? `฿${fmtInt(r.min)}` : `฿${fmtInt(r.min)}–${fmtInt(r.max)}`;
/** 0.006 → '0.6%', 0.02 → '2%', 0.0375 → '3.75%' (at most `maxDigits` decimals, trailing zeros dropped). */
export function fmtPct(x: number, maxDigits = 2): string {
  const p = round(x * 100, maxDigits);
  return `${String(p)}%`;
}
