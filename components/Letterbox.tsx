'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { getAccount } from '@/lib/account';
import { net, type Letters } from '@/lib/net';

const DATE = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
const SHORT = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });

type Tab = 'received' | 'sent';
type Mode = 'scroll' | 'list';
type Item = { body: string; at: string; rule?: number | null; key?: string };
// game.js가 편지를 열거나(가라앉힐 때) 알리는 내용
type Note = { key: string; body: string | null; rule: number | null; at: string; remove: boolean };

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
// 펼친 편지의 글자 크기(보통·크게)를 기억한다
const SIZE_KEY = 'bottle-letter-size';
// 두루마리 한 장의 폭과 사이 간격(CSS .track li와 같아야 한다)
const CARD = 150;
const STEP = CARD + 18;
const loadMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'scroll';
  } catch {
    return 'scroll';
  }
};

// 편지함. 회원은 받은 편지(열어 본 것, 가라앉힌 것은 빠짐)와 보낸 편지(본문과 날짜만)를 서버에서 꺼낸다.
// 원칙: 편지는 회원만 보낸다. 비회원(손님·오프라인)은 받기만 하므로 보낸 편지 칸이 없고, 이번 접속에서 연 편지만 화면에 모아 둔다(접속마다 새 계정이라 남지 않는다).
// 편지는 감긴 두루마리로 놓여 첫 문장만 살짝 보인다. 옆으로 넘기며 고르거나 목록으로 보고, 누르면 펼쳐 읽는다
export default function Letterbox() {
  const [kind, setKind] = useState<'member' | 'guest' | 'offline' | null>(null);
  const member = kind === 'member';
  const memberRef = useRef(false);
  // 비회원: 이번 접속에서 연 편지(새것이 앞)
  const [local, setLocal] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('received');
  const [mode, setMode] = useState<Mode>('scroll');
  const [big, setBig] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<Letters | null>(null);
  const [err, setErr] = useState('');
  // 오른쪽 아래 두루마리 옆에 보이는 받은 편지 수
  const [count, setCount] = useState<number | null>(null);
  // 두루마리 줄: 브라우저 스크롤 대신 직접 움직인다. pos는 가운데에 온 두루마리 번호(소수 = 넘기는 중)
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const pos = useRef(0);
  const anim = useRef(0);
  const lastIdx = useRef(-1);
  const drag = useRef<{ x: number; start: number; moved: boolean; lx: number; lt: number; v: number } | null>(null);
  const noClick = useRef(false);
  const wheel = useRef({ acc: 0, lock: 0 });
  // 창 바깥(어두운 막)에서 눌렀다 뗐을 때만 닫는다
  const downOut = useRef(false);

  // 그리기: 줄을 옮기고, 가운데에서 멀어질수록 두루마리가 작아지고 내려가고 흐려지며 넘기는 쪽으로 기운다(--ad 거리, --sd 방향).
  // 가운데 두루마리가 바뀌면(톱니 하나를 넘으면) 짧게 진동한다(지원하는 기기만)
  const paint = (p: number, tick = true) => {
    const v = view.current;
    const t = track.current;
    if (!v || !t) return;
    pos.current = p;
    t.style.transform = `translateX(${v.clientWidth / 2 - CARD / 2 - p * STEP}px)`;
    for (let i = 0; i < t.children.length; i++) {
      const d = i - p;
      const li = t.children[i] as HTMLElement;
      li.style.setProperty('--ad', Math.min(Math.abs(d), 1.5).toFixed(3));
      li.style.setProperty('--sd', Math.max(-1.5, Math.min(1.5, d)).toFixed(3));
    }
    const n = Math.max(0, Math.min(t.children.length - 1, Math.round(p)));
    if (n !== lastIdx.current) {
      if (tick && lastIdx.current >= 0) navigator.vibrate?.(6);
      lastIdx.current = n;
      setIdx(n);
    }
  };

  // 한 칸으로 맞물리기: 목표를 살짝 지나쳤다가 돌아오는 짧은 움직임(톱니가 딸깍 걸리는 느낌)
  const glide = (to: number) => {
    cancelAnimationFrame(anim.current);
    const from = pos.current;
    const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 360;
    const t0 = performance.now();
    const c1 = 1.25;
    const ease = (x: number) => 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    const run = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      paint(from + (to - from) * ease(k));
      if (k < 1) anim.current = requestAnimationFrame(run);
    };
    anim.current = requestAnimationFrame(run);
  };

  useEffect(() => {
    // 받은 편지 수: 회원은 처음 한 번, 그리고 해변에서 편지를 열 때마다(game.js가 'bottle-letters'를 알린다) 서버에서 다시 센다.
    // 비회원은 알려 온 편지를 화면에 모으고(같은 편지는 한 번만), 가라앉힌 편지는 뺀다
    const recount = () => net.letters().then((d) => setCount(d.received.length), () => {});
    const onNote = (e: Event) => {
      if (memberRef.current) return void recount();
      const n = (e as CustomEvent<Note>).detail;
      if (!n) return;
      setLocal((l) =>
        n.remove ? l.filter((x) => x.key !== n.key) : l.some((x) => x.key === n.key) ? l : [{ key: n.key, body: n.body ?? '', rule: n.rule, at: n.at }, ...l],
      );
    };
    getAccount().then((a) => {
      memberRef.current = a.kind === 'member';
      setKind(a.kind);
      if (memberRef.current) recount();
    });
    setMode(loadMode());
    try {
      setBig(localStorage.getItem(SIZE_KEY) === 'big');
    } catch {}
    window.addEventListener('bottle-letters', onNote);
    return () => window.removeEventListener('bottle-letters', onNote);
  }, []);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setErr('');
    setSel(null);
    if (!member) return;
    net.letters().then(
      (d) => {
        setData(d);
        setCount(d.received.length);
      },
      (e) => setErr(net.message(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 탭을 바꾸면 처음 편지부터
  useEffect(() => {
    setSel(null);
    setIdx(0);
    pos.current = 0;
  }, [tab]);

  // 줄이 새로 그려지면(편지를 받아 옴, 보기·탭을 바꿈, 펼친 편지를 접음) 보던 자리에 맞춘다. 이때는 진동하지 않는다
  useEffect(() => {
    lastIdx.current = -1;
    paint(Math.round(pos.current), false);
    const onResize = () => paint(pos.current, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, local, mode, tab, sel]);

  if (!kind) return null;
  // 비회원은 받은 편지(이번 접속분)만
  const box: { received: Item[]; sent: Item[] } | null = member ? data : { received: local, sent: [] };
  const shownCount = member ? count : local.length;
  const list: Item[] = box?.[tab] ?? [];
  const root = typeof document === 'undefined' ? null : document.getElementById('app');

  const close = () => setOpen(false);
  const pickSize = (b: boolean) => {
    setBig(b);
    try {
      localStorage.setItem(SIZE_KEY, b ? 'big' : 'normal');
    } catch {}
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  // 한 칸씩 넘기기(버튼·방향키·트랙패드)
  const go = (n: number) => glide(Math.max(0, Math.min(list.length - 1, n)));

  // 끌기: 손가락을 따라 움직이되 한 칸을 넘으면 점점 뻑뻑해지고(톱니), 양 끝에서는 고무줄처럼 버틴다.
  // 놓으면 끈 거리나 빠르기로 앞뒤 한 칸(또는 제자리)에 맞물린다
  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(anim.current);
    noClick.current = false;
    drag.current = { x: e.clientX, start: Math.round(pos.current), moved: false, lx: e.clientX, lt: e.timeStamp, v: 0 };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      view.current?.setPointerCapture(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.lt);
    d.v = d.v * 0.6 + ((e.clientX - d.lx) / dt) * 0.4;
    d.lx = e.clientX;
    d.lt = e.timeStamp;
    const raw = -dx / STEP;
    const a = Math.abs(raw);
    let p = d.start + (a <= 1 ? raw : Math.sign(raw) * (1 + (a - 1) * 0.25));
    const last = list.length - 1;
    if (p < 0) p *= 0.35;
    if (p > last) p = last + (p - last) * 0.35;
    paint(p);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    noClick.current = true;
    const moved = pos.current - d.start;
    const dir = moved > 0.22 || d.v < -0.35 ? 1 : moved < -0.22 || d.v > 0.35 ? -1 : 0;
    go(d.start + dir);
  };

  const empty = tab === 'received' ? '아직 열어 본 편지가 없습니다.' : '아직 보낸 편지가 없습니다.';
  const cur = sel !== null ? list[sel] : null;

  return (
    <>
      <button id="mailbtn" type="button" className="cnt" title="편지함" aria-label={`편지함 열기${shownCount !== null ? ` (받은 편지 ${shownCount}통)` : ''}`} onClick={() => setOpen(true)}>
        <i className="ico-scroll" aria-hidden="true" />
        <b aria-hidden="true">{shownCount ?? '·'}</b>
      </button>
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
                <>
                {/* 맨 윗줄: 글자 크기 보통·크게(누를 때마다 바뀌고 기억한다). 오른쪽 위 X로 접는다 */}
                <button type="button" className="seg tsize" aria-label={`글자 크기 ${big ? '크게' : '보통'} · 누르면 ${big ? '보통' : '크게'}으로`} onClick={() => pickSize(!big)}>
                  <span className={big ? undefined : 'on'}>보통</span>
                  <span className={big ? 'on' : undefined}>크게</span>
                </button>
                <div className={'scroll-open' + (cur.rule ? ' rule' : '') + (big ? ' big' : '')} key={sel}>
                  <h2 id="mail-h" className="sr">{tab === 'received' ? '받은 편지' : '보낸 편지'}</h2>
                  <span className="roll" aria-hidden="true" />
                  <div className="paper" tabIndex={0}>
                    <p className="ptag">{label(cur)}</p>
                    {cur.body.split(/(?:\r?\n){2,}/).map((p, j) => <p key={j}>{p}</p>)}
                  </div>
                  <span className="roll" aria-hidden="true" />
                </div>
                </>
              ) : (
                <>
                  <p className="tag">편지함</p>
                  <h2 id="mail-h" className="sr">{tab === 'received' ? '받은 편지' : '보낸 편지'}</h2>
                  {/* 한 줄: 받은/보낸 토글(회원만, 누를 때마다 바뀜)과 눈 버튼(누를 때마다 두루마리·목록 보기가 바뀜) */}
                  <div className="mbar">
                    {member ? (
                      <button type="button" className="seg" aria-label={`${tab === 'received' ? '받은 편지' : '보낸 편지'} · 누르면 ${tab === 'received' ? '보낸 편지' : '받은 편지'}로`} onClick={() => setTab(tab === 'received' ? 'sent' : 'received')}>
                        <span className={tab === 'received' ? 'on' : undefined}>받은{box ? ` ${box.received.length}` : ''}</span>
                        <span className={tab === 'sent' ? 'on' : undefined}>보낸{box ? ` ${box.sent.length}` : ''}</span>
                      </button>
                    ) : (
                      <span className="mlabel">받은 편지{box ? ` ${box.received.length}` : ''}</span>
                    )}
                    <button type="button" className="eye" title={mode === 'scroll' ? '두루마리로 보는 중 · 누르면 목록' : '목록으로 보는 중 · 누르면 두루마리'} aria-label={`보기 바꾸기, 지금 ${mode === 'scroll' ? '두루마리' : '목록'}`} onClick={() => pickMode(mode === 'scroll' ? 'list' : 'scroll')}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
                        <circle cx="12" cy="12" r="3.4" />
                      </svg>
                    </button>
                  </div>

                  {err && <p className="err" role="alert">{err}</p>}
                  {!box && !err && <p className="note">편지를 꺼내는 중…</p>}
                  {box && list.length === 0 && <p className="note">{empty}</p>}

                  {box && list.length > 0 && mode === 'scroll' && (
                    <div className="rail-wrap">
                      <button type="button" className="nav" aria-label="앞 편지" disabled={idx === 0} onClick={() => go(idx - 1)}>‹</button>
                      <div
                        className="rail"
                        ref={view}
                        tabIndex={0}
                        aria-label="두루마리. 옆으로 넘겨 고르세요"
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        onClickCapture={(e) => {
                          // 끈 뒤에 손을 떼며 생기는 누름은 두루마리를 펼치지 않는다
                          if (noClick.current) {
                            e.stopPropagation();
                            e.preventDefault();
                            noClick.current = false;
                          }
                        }}
                        onWheel={(e) => {
                          // 트랙패드 가로 밀기: 일정만큼 밀릴 때마다 한 칸씩, 맞물리는 동안은 잠깐 쉰다
                          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
                          const w = wheel.current;
                          if (e.timeStamp < w.lock) return;
                          w.acc += e.deltaX;
                          if (Math.abs(w.acc) > 40) {
                            go(idx + Math.sign(w.acc));
                            w.acc = 0;
                            w.lock = e.timeStamp + 380;
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowRight') go(idx + 1);
                          if (e.key === 'ArrowLeft') go(idx - 1);
                        }}
                      >
                        <ul className="track" ref={track}>
                        {list.map((l, i) => (
                          <li key={i} className={l.rule ? 'rule' : undefined} style={{ '--tilt': `${((i * 37) % 7) - 3}deg` } as CSSProperties}>
                            <button type="button" className="rolled" onClick={() => { setIdx(i); setSel(i); }} aria-label={`${label(l)} 편지 펼치기: ${firstLine(l.body)}`}>
                              <span className="roll" aria-hidden="true" />
                              <span className="peek" aria-hidden="true">{firstLine(l.body)}</span>
                              <span className="roll" aria-hidden="true" />
                            </button>
                            <span className="when" aria-hidden="true">{label(l, true)}</span>
                          </li>
                        ))}
                        </ul>
                      </div>
                      <button type="button" className="nav" aria-label="다음 편지" disabled={idx >= list.length - 1} onClick={() => go(idx + 1)}>›</button>
                    </div>
                  )}
                  {box && list.length > 1 && mode === 'scroll' && <p className="pos center">{idx + 1} / {list.length} · 옆으로 넘겨 고르세요</p>}

                  {tab === 'sent' && list.length > 0 && <p className="note">어디로 갔는지, 읽혔는지는 알 수 없습니다.</p>}
                  {!member && <p className="note">비회원은 편지를 받을 수만 있습니다. 가입하면 편지를 보낼 수 있고, 받은 편지도 계속 남습니다.</p>}
                  {box && list.length > 0 && mode === 'list' && (
                    <ul className="mlist">
                      {list.map((l, i) => (
                        <li key={i}>
                          <button type="button" onClick={() => { setIdx(i); setSel(i); }}>
                            <span className={'mini' + (l.rule ? ' rule' : '')} aria-hidden="true" />
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
