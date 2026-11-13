'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccount } from '@/lib/account';
import { net, type Letters } from '@/lib/net';

const DATE = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

// 회원만 보는 편지함. 받은 편지(열어 본 것, 가라앉힌 것은 빠짐)와 보낸 편지(본문과 날짜만)
export default function Letterbox() {
  const [member, setMember] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [data, setData] = useState<Letters | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getAccount().then((a) => setMember(a.kind === 'member'));
  }, []);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setErr('');
    net.letters().then(setData, (e) => setErr(net.message(e)));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!member) return null;
  const list = data?.[tab] ?? [];
  const root = typeof document === 'undefined' ? null : document.getElementById('app');

  return (
    <>
      <button id="mailbtn" type="button" onClick={() => setOpen(true)}>편지함</button>
      {open &&
        root &&
        createPortal(
          <div
            className="veil"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setOpen(false);
            }}
            onKeyUp={(e) => e.stopPropagation()}
          >
            <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="mail-h" tabIndex={-1}>
              <p className="tag">편지함</p>
              <h2 id="mail-h">{tab === 'received' ? '받은 편지' : '보낸 편지'}</h2>
              <div className="btns" role="tablist">
                <button type="button" className="rch" aria-pressed={tab === 'received'} onClick={() => setTab('received')}>받은 편지</button>
                <button type="button" className="rch" aria-pressed={tab === 'sent'} onClick={() => setTab('sent')}>보낸 편지</button>
                <button type="button" onClick={() => setOpen(false)} autoFocus>닫기</button>
              </div>
              {err && <p className="err" role="alert">{err}</p>}
              {!data && !err && <p className="note">편지를 꺼내는 중…</p>}
              {data && list.length === 0 && (
                <p className="note">{tab === 'received' ? '아직 열어 본 편지가 없습니다.' : '아직 보낸 편지가 없습니다.'}</p>
              )}
              {list.map((l, i) => (
                <article className="mail" key={i}>
                  <p className="tag">
                    {'rule' in l && l.rule ? `규칙 편지 ${l.rule} / 3 · ` : ''}
                    {DATE.format(new Date(l.at))}
                  </p>
                  {l.body.split(/\n{2,}/).map((p, j) => <p key={j}>{p}</p>)}
                </article>
              ))}
              {tab === 'sent' && list.length > 0 && <p className="note">어디로 갔는지, 읽혔는지는 알 수 없습니다.</p>}
            </div>
          </div>,
          root,
        )}
    </>
  );
}
