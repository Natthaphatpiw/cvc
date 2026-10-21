import { initBotId } from 'botid/client/core';
import { BOTID_PROTECTED_POSTS } from './lib/botid-paths';

// BotID attaches its challenge headers to these POSTs; the web route handlers under app/api/ verify them and forward.
// It needs Vercel's challenge endpoint, so it only runs in production builds where Supabase guest sessions exist.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  initBotId({ protect: BOTID_PROTECTED_POSTS.map((path) => ({ path, method: 'POST' as const })) });
}
