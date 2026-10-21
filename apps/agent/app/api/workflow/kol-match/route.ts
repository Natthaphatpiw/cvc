import { handleKolMatchWorkflow } from '../../../../src/pipeline/workflows/kol-match';

// Upstash Workflow endpoint: QStash calls it once per pipeline step (outside /api/agent, so the web proxy never
// forwards to it). Each call runs a single step, which must finish within maxDuration.
export const runtime = 'nodejs';
export const maxDuration = 800;

export const POST = handleKolMatchWorkflow;
