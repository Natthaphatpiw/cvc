import { initBotId } from 'botid/client/core';

// BotID guards the guest-only entry points (the API checks it for anonymous sessions). It needs Vercel's challenge
// endpoint, so it only runs in production builds where Supabase guest sessions exist.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  initBotId({
    protect: [
      { path: '/api/auth/guest', method: 'POST' },
      { path: '/api/agent/runs', method: 'POST' },
      { path: '/api/agent/transcribe', method: 'POST' },
      { path: '/api/uploads/token', method: 'POST' },
    ],
  });
}
