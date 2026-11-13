import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 메일 링크를 타고 들어오면 주소 뒤(#)에 type=recovery 같은 표시가 붙는다.
// Supabase가 시작하면서 이 부분을 지우므로, 클라이언트를 만들기 전에 먼저 적어 둔다.
export const initialHash = typeof window === 'undefined' ? '' : window.location.hash;

// 환경 변수가 없으면 null. 그때 화면은 서버 없이 비회원처럼 돈다.
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
