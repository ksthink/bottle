import { admin, authUser, clientIp, fail } from '@/lib/server';
import { hasContact } from '@/lib/island/filter';
import { hasBlockedWord } from '@/lib/blocked-words';

// 병 던지기. 연락처나 금칙어(lib/blocked-words.ts)가 들어간 편지는 던질 수는 있지만 아무에게도 가지 않는다(차단됨)
// 원칙: 편지는 가입한 회원만 보낸다. 비회원(익명 계정)은 받기만 한다. 그래서 신고된 편지에는 늘 보낸 사람의 이메일이 있다
export async function POST(req: Request) {
  const sb = admin();
  const me = await authUser(req, sb);
  if (!me) return Response.json({ error: 'auth' }, { status: 401 });
  if (!me.member) return fail({ message: 'members_only' }, 403);
  const uid = me.id;
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
