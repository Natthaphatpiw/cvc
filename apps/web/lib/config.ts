/** Public, build-time configuration. NEXT_PUBLIC_* values are inlined by Next, so read them with static property access. */

export const APP_NAME = 'Convert Cake · Influencer';

/** Privacy notice version the user acknowledges (bump in .env when the notice text changes). */
export const NOTICE_VERSION: string = process.env.NEXT_PUBLIC_NOTICE_VERSION || '2026-10-21';

export function liffId(): string | null {
  const id = process.env.NEXT_PUBLIC_LIFF_ID;
  return id && id.trim() ? id.trim() : null;
}

export function isLiffConfigured(): boolean {
  return liffId() !== null;
}

export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfig() !== null;
}

/** LINE login needs both a LIFF app and Supabase (the exchanged session is a Supabase session). */
export function isLineLoginConfigured(): boolean {
  return isLiffConfigured() && isSupabaseConfigured();
}

/** Short privacy notice (DESIGN §7.2), shown before uploads and on LIFF onboarding. */
export const NOTICE_TEXT_TH =
  'ข้อมูลที่คุณกรอกหรืออัปโหลด (รวมเสียงและรูป) ประมวลผลโดยผู้ให้บริการต่างประเทศ ได้แก่ OpenAI (สหรัฐฯ), Supabase, Vercel และ Upstash (สิงคโปร์) โปรดอย่าอัปโหลดข้อมูลส่วนบุคคลของผู้อื่น';
