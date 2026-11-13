import { admin, clientIp, fail, userId } from '@/lib/server';
import { hasContact } from '@/lib/island/filter';
import { hasBlockedWord } from '@/lib/blocked-words';

// 병 던지기. 연락처나 금칙어(lib/blocked-words.ts)가 들어간 편지는 던질 수는 있지만 아무에게도 가지 않는다(차단됨)
export async function POST(req: Request) {
  const sb = admin();
  const uid = await userId(req, sb);
  if (!uid) return Response.json({ error: 'auth' }, { status: 401 });
  const { body } = (await req.json().catch(() => ({}))) as { body?: unknown };
  if (typeof body !== 'string') return fail({ message: 'bad_length' });
  const { data, error } = await sb.rpc('throw_bottle', {
    p_user: uid,
    p_body: body,
    p_ip: clientIp(req),
    p_blocked: hasContact(body) || hasBlockedWord(body),
  });
  if (error) return fail(error);
  return Response.json({ held: data });
}
