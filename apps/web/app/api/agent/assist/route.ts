// POST /api/agent/assist — BotID check on this project's route, then forwarded (see lib/botid-paths.ts).
import type { NextRequest } from 'next/server';
import { forwardWithBotId } from '@/lib/botid-forward';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function POST(req: NextRequest): Promise<Response> {
  return forwardWithBotId(req);
}
