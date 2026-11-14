// 라디오 방송 주소: 재생 목록(.pls)을 서버에서 읽어, 지금 들을 수 있는 방송 주소(HLS)를 돌려준다.
// 재생 목록 서버는 http이고 다른 사이트에서 읽는 걸 허용하지 않아 브라우저가 직접 읽지 못한다.
// 방송 주소에는 하루쯤 지나면 만료되는 서명이 붙어 있어, 라디오를 켤 때마다 새로 읽는다
const PLS = process.env.RADIO_PLS_URL || 'http://serpent0.duckdns.org:8088/kbsfm.pls';

export async function GET() {
  try {
    const r = await fetch(PLS, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) return Response.json({ error: 'pls' }, { status: 502 });
    const text = await r.text();
    const url = text.match(/^File1=(.+)$/m)?.[1]?.trim();
    const title = text.match(/^Title1=(.+)$/m)?.[1]?.trim() || '';
    // https 주소만 넘긴다: http 방송은 https 페이지에서 재생이 막힌다
    if (!url || !url.startsWith('https://')) return Response.json({ error: 'pls' }, { status: 502 });
    return Response.json({ url, title }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'pls' }, { status: 502 });
  }
}
