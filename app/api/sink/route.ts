import { admin, clientIp, fail, userId } from '@/lib/server';
import { sendReportMail, type Report } from '@/lib/mail';

// 병째 가라앉히기(신고). 사람 편지면 관리자에게 본문과 IP, 보낸 사람 이메일(회원이면)을 메일로 보낸다
export async function POST(req: Request) {
  const sb = admin();
  const uid = await userId(req, sb);
  if (!uid) return Response.json({ error: 'auth' }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== 'number') return fail({ message: 'not_here' });
  const { data, error } = await sb.rpc('report_bottle', { p_user: uid, p_bottle: id, p_ip: clientIp(req) });
  if (error) return fail(error);
  const { held, report } = data as { held: number; report: Report | null };
  // 메일이 실패해도 신고는 기록되어 있다 (reports.mailed_at 이 비어 있음)
  if (report && (await sendReportMail(report).catch(() => false))) {
    await sb.rpc('mark_report_mailed', { p_report: report.id });
  }
  return Response.json({ held });
}
