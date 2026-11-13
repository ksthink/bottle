// 서버 함수(app/api/*)에서만 쓴다. secret 키로 DB 함수를 부르고, 요청한 사용자와 IP를 서버가 직접 확인한다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_SECRET_KEY가 설정되지 않았습니다');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Authorization: Bearer <사용자 토큰> 을 Supabase에 확인받는다
export async function userId(req: Request, sb: SupabaseClient): Promise<string | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  return error || !data.user ? null : data.user.id;
}

// Vercel이 붙여 주는 x-forwarded-for 의 첫 주소가 요청한 사람의 IP다
export function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  return xff?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
}

// DB 함수가 raise 한 코드만 화면으로 넘기고, 나머지는 감춘다
const KNOWN = new Set(['no_island', 'no_bottle', 'bad_length', 'not_here']);
export function fail(e: { message?: string } | null, status = 400) {
  const code = e?.message && KNOWN.has(e.message) ? e.message : 'server';
  if (code === 'server') console.error(e);
  return Response.json({ error: code }, { status: code === 'server' ? 500 : status });
}
