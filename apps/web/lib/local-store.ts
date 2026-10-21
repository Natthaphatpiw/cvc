import { createStore, del, entries, get, set, clear, type UseStore } from 'idb-keyval';
import type { FinalResult, RunInputDraft, RunStatus } from '@cvc/schemas';

/** A guest run remembered in this browser (IndexedDB). claimSecret moves it to the LINE account after login. */
export type LocalRun = {
  runId: string;
  companyName: string;
  createdAt: string;
  claimSecret: string | null;
  resultId: string | null;
  status: RunStatus;
  /** The submitted brief, so a failed run can be re-submitted. Missing on runs stored before it was kept. */
  input?: RunInputDraft;
};

export type LocalSavedSummary = { resultId: string; title: string; savedAt: string; brandName: string };

type LocalSavedRecord = LocalSavedSummary & { result: FinalResult };

const SAVE_FAILED_TH = 'บันทึกในเบราว์เซอร์นี้ไม่ได้ (เบราว์เซอร์อาจปิดการเก็บข้อมูลไว้)';
const REMOVE_FAILED_TH = 'ลบข้อมูลในเบราว์เซอร์นี้ไม่ได้ กรุณาลองอีกครั้ง';

// One database per store: idb-keyval creates a single object store per database.
let runsStore: UseStore | null = null;
let savedStore: UseStore | null = null;

function stores(): { runs: UseStore; saved: UseStore } | null {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  try {
    runsStore ??= createStore('cvc-kol-runs', 'kv');
    savedStore ??= createStore('cvc-kol-saved', 'kv');
    return { runs: runsStore, saved: savedStore };
  } catch {
    return null;
  }
}

function isLocalRun(v: unknown): v is LocalRun {
  return !!v && typeof v === 'object' && typeof (v as LocalRun).runId === 'string' && typeof (v as LocalRun).createdAt === 'string';
}

function isSavedRecord(v: unknown): v is LocalSavedRecord {
  return !!v && typeof v === 'object' && typeof (v as LocalSavedRecord).resultId === 'string' && !!(v as LocalSavedRecord).result;
}

const byNewest = (a: { createdAt?: string; savedAt?: string }, b: { createdAt?: string; savedAt?: string }) =>
  (b.createdAt ?? b.savedAt ?? '').localeCompare(a.createdAt ?? a.savedAt ?? '');

async function getRun(runId: string): Promise<LocalRun | null> {
  const s = stores();
  if (!s) return null;
  try {
    const v = await get<unknown>(runId, s.runs);
    return isLocalRun(v) ? v : null;
  } catch {
    return null;
  }
}

async function putRun(r: LocalRun): Promise<void> {
  const s = stores();
  if (!s) return;
  try {
    await set(r.runId, r, s.runs);
  } catch {
    // Best effort: the run still exists on the server.
  }
}

async function getSavedResult(resultId: string): Promise<FinalResult | null> {
  const s = stores();
  if (!s) return null;
  try {
    const v = await get<unknown>(resultId, s.saved);
    return isSavedRecord(v) ? v.result : null;
  } catch {
    return null;
  }
}

/**
 * Reads never throw (IndexedDB can vanish in private mode); they resolve to empty values.
 * putRun / updateRun never throw either. saveResult and removeSavedResult reject with a Thai Error message so the
 * caller can tell the user that the browser refused the write.
 */
export const localStore = {
  async listRuns(): Promise<LocalRun[]> {
    const s = stores();
    if (!s) return [];
    try {
      const rows = await entries<string, unknown>(s.runs);
      return rows.map(([, v]) => v).filter(isLocalRun).sort(byNewest);
    } catch {
      return [];
    }
  },

  getRun,
  putRun,

  /** Merges a patch into an existing run; no-op when the run is not stored here. */
  async updateRun(runId: string, patch: Partial<Omit<LocalRun, 'runId'>>): Promise<void> {
    const current = await getRun(runId);
    if (!current) return;
    await putRun({ ...current, ...patch });
  },

  async removeRun(runId: string): Promise<void> {
    const s = stores();
    if (!s) return;
    try {
      await del(runId, s.runs);
    } catch {
      // ignore
    }
  },

  async saveResult(r: FinalResult, title: string): Promise<void> {
    const s = stores();
    if (!s) throw new Error(SAVE_FAILED_TH);
    const record: LocalSavedRecord = {
      resultId: r.resultId,
      title: title.trim() || r.brand.name,
      savedAt: new Date().toISOString(),
      brandName: r.brand.name,
      result: r,
    };
    try {
      await set(r.resultId, record, s.saved);
    } catch {
      throw new Error(SAVE_FAILED_TH);
    }
  },

  async listSavedResults(): Promise<LocalSavedSummary[]> {
    const s = stores();
    if (!s) return [];
    try {
      const rows = await entries<string, unknown>(s.saved);
      return rows
        .map(([, v]) => v)
        .filter(isSavedRecord)
        .map(({ resultId, title, savedAt, brandName }) => ({ resultId, title, savedAt, brandName }))
        .sort(byNewest);
    } catch {
      return [];
    }
  },

  getSavedResult,

  async isSaved(resultId: string): Promise<boolean> {
    return (await getSavedResult(resultId)) !== null;
  },

  async removeSavedResult(resultId: string): Promise<void> {
    const s = stores();
    if (!s) throw new Error(REMOVE_FAILED_TH);
    try {
      await del(resultId, s.saved);
    } catch {
      throw new Error(REMOVE_FAILED_TH);
    }
  },

  /** Deletes every run and saved result kept in this browser (account page). */
  async clearAll(): Promise<void> {
    const s = stores();
    if (!s) return;
    try {
      await Promise.all([clear(s.runs), clear(s.saved)]);
    } catch {
      throw new Error(REMOVE_FAILED_TH);
    }
  },

  /** Everything stored for this browser, for the "download my data" action. */
  async exportAll(): Promise<{ runs: LocalRun[]; savedResults: LocalSavedRecord[] }> {
    const s = stores();
    if (!s) return { runs: [], savedResults: [] };
    try {
      const [runs, saved] = await Promise.all([entries<string, unknown>(s.runs), entries<string, unknown>(s.saved)]);
      return {
        runs: runs.map(([, v]) => v).filter(isLocalRun),
        savedResults: saved.map(([, v]) => v).filter(isSavedRecord),
      };
    } catch {
      return { runs: [], savedResults: [] };
    }
  },
};
