// Every reader is a function so `next build` never needs secrets (env is read per request).

function read(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
}

export const env = {
  supabaseUrl: () => read('SUPABASE_URL') ?? read('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: () => read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  supabaseSecretKey: () => read('SUPABASE_SECRET_KEY'),
  lineLoginChannelId: () => read('LINE_LOGIN_CHANNEL_ID'),
  lineMessagingSecret: () => read('LINE_MESSAGING_CHANNEL_SECRET'),
  lineMessagingToken: () => read('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN'),
  privateBlobToken: () => read('BLOB_PRIVATE_READ_WRITE_TOKEN'),
  noticeVersion: () => read('NEXT_PUBLIC_NOTICE_VERSION') ?? '',
  appUrl: () => (read('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, ''),
  agentOrigin: () => read('AGENT_ORIGIN')?.replace(/\/+$/, '') ?? null,
  demoMode: (): 'auto' | 'on' | 'off' => {
    const v = read('DEMO_MODE');
    return v === 'on' || v === 'off' ? v : 'auto';
  },
  isProduction: () => process.env.NODE_ENV === 'production',
  onVercel: () => read('VERCEL') !== null,
};

export const isGuestAuthConfigured = () => env.supabaseUrl() !== null && env.supabasePublishableKey() !== null;
export const isSupabaseAdminConfigured = () => env.supabaseUrl() !== null && env.supabaseSecretKey() !== null;
export const isLineLoginConfigured = () => env.lineLoginChannelId() !== null;
export const isLineMessagingConfigured = () => env.lineMessagingSecret() !== null && env.lineMessagingToken() !== null;
export const isPrivateBlobConfigured = () => env.privateBlobToken() !== null;
