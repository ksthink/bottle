// 관리자 메일 (Resend). RESEND_API_KEY 가 없으면 보내지 않고 false 를 돌려준다.
const TO = process.env.REPORT_TO || 'bottle@metaphr.dev';
const FROM = process.env.MAIL_FROM || '유리병 편지 섬 <noreply@metaphr.dev>';

export type Report = {
  id: number;
  letter_id: number;
  body: string;
  sent_at: string;
  sent_ip: string | null;
  author_email: string | null;
  author_member: boolean | null;
  received_at: string | null;
  received_ip: string | null;
  reported_at: string;
  reporter_ip: string | null;
};

const KST = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Seoul' });
const when = (s: string | null) => (s ? KST.format(new Date(s)) + ' (KST)' : '-');

export async function sendReportMail(r: Report): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY가 없어 신고 메일을 보내지 못했습니다', r.id);
    return false;
  }
  const author =
    r.author_email ?? (r.author_member === false ? '비회원' : r.author_member === null ? '알 수 없음(탈퇴했거나 정리된 계정)' : '-');
  const text = [
    `신고 #${r.id} · 편지 #${r.letter_id}`,
    '',
    '[편지 본문]',
    r.body,
    '',
    '[보낸 사람]',
    `계정: ${author}`,
    `보낸 시각: ${when(r.sent_at)}`,
    `보낸 IP: ${r.sent_ip ?? '-'}`,
    '',
    '[받은(신고한) 사람]',
    `받은 시각: ${when(r.received_at)}`,
    `받을 때 IP: ${r.received_ip ?? '-'}`,
    `신고 시각: ${when(r.reported_at)}`,
    `신고할 때 IP: ${r.reporter_ip ?? '-'}`,
    '',
    '이 편지는 신고됨 상태가 되어 다시 떠돌지 않습니다.',
    'IP를 막으려면 Supabase의 blocked_ips 표에 넣으세요.',
  ].join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject: `[유리병 편지 섬] 신고 #${r.id}`, text }),
  });
  if (!res.ok) console.error('신고 메일 실패', res.status, await res.text().catch(() => ''));
  return res.ok;
}
