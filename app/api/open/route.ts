import { admin, clientIp, fail, userId } from '@/lib/server';

// 해변의 병 열기. 편지 내용은 이때 처음 내려 준다
export async function POST(req: Request) {
  const sb = admin();
  const uid = await userId(req, sb);
  if (!uid) return Response.json({ error: 'auth' }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== 'number') return fail({ message: 'not_here' });
  const { data, error } = await sb.rpc('open_bottle', { p_user: uid, p_bottle: id, p_ip: clientIp(req) });
  if (error) return fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  return Response.json({ kind: row.kind, rule: row.rule_no, body: row.body });
}
