'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { getAccount } from '@/lib/account';
import { net, type Letters } from '@/lib/net';

const DATE = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
const SHORT = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });

type Tab = 'received' | 'sent';
type Mode = 'scroll' | 'list';
type Item = { body: string; at: string; rule?: number | null };

// 두루마리 틈으로 보이는 첫 문장(길면 줄임)
function firstLine(body: string) {
  const t = body.replace(/\s+/g, ' ').trim();
  const m = /^.*?[.!?。…~]+(?=\s|$)/.exec(t);
  const s = m ? m[0] : t;
  return s.length > 40 ? s.slice(0, 38).trimEnd() + '…' : s;
}
const label = (l: Item, short = false) =>
  (l.rule ? `규칙 편지 ${l.rule} / 3 · ` : '') + (short ? SHORT : DATE).format(new Date(l.at));

const MODE_KEY = 'bottle-mail-view';
const loadMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'scroll';
  } catch {
    return 'scroll';
  }
};

// 회원만 보는 편지함. 받은 편지(열어 본 것, 가라앉힌 것은 빠짐)와 보낸 편지(본문과 날짜만).
// 편지는 감긴 두루마리로 놓여 첫 문장만 살짝 보인다. 옆으로 넘기며 고르거나 목록으로 보고, 누르면 펼쳐 읽는다
export default function Letterbox() {
  const [member, setMember] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('received');
  const [mode, setMode] = useState<Mode>('scroll');
  const [sel, setSel] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<Letters | null>(null);
  const [err, setErr] = useState('');
  const rail = useRef<HTMLUListElement>(null);
  // 창 바깥(어두운 막)에서 눌렀다 뗐을 때만 닫는다
  const downOut = useRef(false);

  useEffect(() => {
    getAccount().then((a) => setMember(a.kind === 'member'));
    setMode(loadMode());
  }, []);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setErr('');
    setSel(null);
    net.letters().then(setData, (e) => setErr(net.message(e)));
  }, [open]);

  // 탭을 바꾸면 처음 편지부터
  useEffect(() => {
    setSel(null);
    setIdx(0);
    rail.current?.scrollTo({ left: 0 });
  }, [tab]);

  // 펼친 편지를 접으면 보던 두루마리가 가운데 오도록 줄을 되돌린다
  useEffect(() => {
    const r = rail.current;
    if (sel !== null || !r) return;
    const li = r.querySelector('li');
    if (li) r.scrollLeft = idx * (li.getBoundingClientRect().width + 18);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  if (!member) return null;
  const list: Item[] = data?.[tab] ?? [];
  const root = typeof document === 'undefined' ? null : document.getElementById('app');

  const close = () => setOpen(false);
  const pickMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  // 두루마리 줄: 한 칸씩 넘기고, 가운데에 온 두루마리 번호를 센다
  const step = () => {
    const li = rail.current?.querySelector('li');
    return li ? li.getBoundingClientRect().width + 18 : 170;
  };
  const slide = (dir: number) => rail.current?.scrollBy({ left: dir * step(), behavior: 'smooth' });
  const onRail = () => {
    const r = rail.current;
    if (r) setIdx(Math.max(0, Math.min(list.length - 1, Math.round(r.scrollLeft / step()))));
  };

  const empty = tab === 'received' ? '아직 열어 본 편지가 없습니다.' : '아직 보낸 편지가 없습니다.';
  const cur = sel !== null ? list[sel] : null;

  return (
    <>
      <button id="mailbtn" type="button" onClick={() => setOpen(true)}>편지함</button>
      {open &&
        root &&
        createPortal(
          <div
            className="veil"
            onPointerDown={(e) => {
              downOut.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              // 펼친 편지에서는 접어 목록으로 돌아가고, 목록에서는 편지함을 닫는다
              if (downOut.current && e.target === e.currentTarget) {
                if (sel !== null) setSel(null);
                else close();
              }
              downOut.current = false;
            }}
            onKeyDown={(e) => {
              // 창 안의 키 입력은 섬(캐릭터)으로 보내지 않는다. Esc는 펼친 편지에서는 접고, 그 밖에서는 닫는다
              e.stopPropagation();
              if (e.key === 'Escape') {
                if (sel !== null) setSel(null);
                else close();
              }
            }}
            onKeyUp={(e) => e.stopPropagation()}
          >
            <div className={'sheet mailbox' + (cur ? ' bare' : '')} role="dialog" aria-modal="true" aria-labelledby="mail-h" tabIndex={-1}>
              <button type="button" className="x" aria-label={cur ? '편지 접기' : '닫기'} onClick={() => (cur ? setSel(null) : close())}>×</button>

              {cur ? (
                // 펼친 편지: 두루마리(편지 내용)만 보인다. X·바깥·Esc로 접으면 목록으로 돌아간다
                <div className="scroll-open" key={sel}>
                  <h2 id="mail-h" className="sr">{tab === 'received' ? '받은 편지' : '보낸 편지'}</h2>
                  <span className="roll" aria-hidden="true" />
                  <div className="paper" tabIndex={0}>
                    <p className="ptag">{label(cur)}</p>
                    {cur.body.split(/(?:\r?\n){2,}/).map((p, j) => <p key={j}>{p}</p>)}
                  </div>
                  <span className="roll" aria-hidden="true" />
                </div>
              ) : (
                <>
                  <p className="tag">편지함</p>
                  <h2 id="mail-h" className="sr">{tab === 'received' ? '받은 편지' : '보낸 편지'}</h2>
                  <div className="mbar">
                    <div className="tabs" role="tablist" aria-label="편지 종류">
                      {(['received', 'sent'] as Tab[]).map((t) => (
                        <button key={t} type="button" role="tab" aria-selected={tab === t} className="rch" aria-pressed={tab === t} onClick={() => setTab(t)}>
                          {t === 'received' ? '받은 편지' : '보낸 편지'}
                          {data && <span className="cnt">{data[t].length}</span>}
                        </button>
                      ))}
                    </div>
                    <div className="modes" role="group" aria-label="보기">
                      <button type="button" className="rch" aria-pressed={mode === 'scroll'} onClick={() => pickMode('scroll')}>두루마리</button>
                      <button type="button" className="rch" aria-pressed={mode === 'list'} onClick={() => pickMode('list')}>목록</button>
                    </div>
                  </div>

                  {err && <p className="err" role="alert">{err}</p>}
                  {!data && !err && <p className="note">편지를 꺼내는 중…</p>}
                  {data && list.length === 0 && <p className="note">{empty}</p>}

                  {data && list.length > 0 && mode === 'scroll' && (
                    <div className="rail-wrap">
                      <button type="button" className="nav" aria-label="앞 편지" disabled={idx === 0} onClick={() => slide(-1)}>‹</button>
                      <ul
                        className="rail"
                        ref={rail}
                        onScroll={onRail}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowRight') slide(1);
                          if (e.key === 'ArrowLeft') slide(-1);
                        }}
                      >
                        {list.map((l, i) => (
                          <li key={i} style={{ '--tilt': `${((i * 37) % 7) - 3}deg` } as CSSProperties}>
                            <button type="button" className="rolled" onClick={() => { setIdx(i); setSel(i); }} aria-label={`${label(l)} 편지 펼치기: ${firstLine(l.body)}`}>
                              <span className="roll" aria-hidden="true" />
                              <span className="peek" aria-hidden="true">{firstLine(l.body)}</span>
                              <span className="roll" aria-hidden="true" />
                            </button>
                            <span className="when" aria-hidden="true">{label(l, true)}</span>
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="nav" aria-label="다음 편지" disabled={idx >= list.length - 1} onClick={() => slide(1)}>›</button>
                    </div>
                  )}
                  {data && list.length > 1 && mode === 'scroll' && <p className="pos center">{idx + 1} / {list.length} · 옆으로 넘겨 고르세요</p>}

                  {tab === 'sent' && list.length > 0 && <p className="note">어디로 갔는지, 읽혔는지는 알 수 없습니다.</p>}
                  {data && list.length > 0 && mode === 'list' && (
                    <ul className="mlist">
                      {list.map((l, i) => (
                        <li key={i}>
                          <button type="button" onClick={() => { setIdx(i); setSel(i); }}>
                            <span className="mini" aria-hidden="true" />
                            <span className="ln">{firstLine(l.body)}</span>
                            <span className="when">{label(l, true)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>,
          root,
        )}
    </>
  );
}
