import { admin, fail, userId } from '@/lib/server';

// 탈퇴: 보낸 편지를 거둬들이고 계정을 지운다. 섬과 받은 병도 함께 지워진다
export async function POST(req: Request) {
  const sb = admin();
  const uid = await userId(req, sb);
  if (!uid) return Response.json({ error: 'auth' }, { status: 401 });
  const { error } = await sb.rpc('withdraw', { p_user: uid });
  if (error) return fail(error);
  const { error: delErr } = await sb.auth.admin.deleteUser(uid);
  if (delErr) return fail(delErr);
  return Response.json({ ok: true });
}
