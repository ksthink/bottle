import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 환경 변수가 없으면 null. 그때 화면은 서버 없이 비회원처럼 돈다.
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
