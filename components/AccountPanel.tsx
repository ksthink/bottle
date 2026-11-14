'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { authMessage, getAccount, pending, type Account } from '@/lib/account';
import { net } from '@/lib/net';
import { supabase } from '@/lib/supabase';

type View = 'closed' | 'guest' | 'signup' | 'code' | 'setpw' | 'login' | 'forgot' | 'member' | 'passwd' | 'withdraw' | 'recovery' | 'welcome';

// 메일 템플릿에 6자리 코드({{ .Token }})를 넣었을 때만 코드 입력칸을 보여준다.
// 기본 메일 서버를 쓰는 동안은 템플릿을 고칠 수 없어 링크만 온다. SMTP 연결 뒤 NEXT_PUBLIC_EMAIL_CODE=1
const EMAIL_CODE = process.env.NEXT_PUBLIC_EMAIL_CODE === '1';

// 비밀번호를 정해야 끝나는 화면은 Esc·바깥 누르기·X로 닫지 않는다
const locked = (v: View) => v === 'recovery' || v === 'setpw';

// 섬 이름: 회원이 계정 창에서 짓는다. 짓기 전에는 '무인도'. 화면 왼쪽 위 상자(#iname)에 보인다
const DEFAULT_NAME = '무인도';
const NAME_MAX = 12;
const showName = (n?: string) => {
  const el = document.getElementById('iname');
  if (el) el.textContent = n || DEFAULT_NAME;
};

// 오른쪽 위의 계정 버튼과, 누르면 열리는 가입·로그인 종이.
// 섬 엔진과 따로 돈다. 키 입력은 여기서 막아 캐릭터가 움직이지 않게 한다.
export default function AccountPanel() {
  const [acct, setAcct] = useState<Account | null>(null);
  const [view, setView] = useState<View>('closed');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [newPw, setNewPw] = useState('');
  const [name, setName] = useState('');
  // 창 바깥(어두운 막)에서 눌렀다 뗐을 때만 닫는다. 창 안에서 끌다가 바깥에서 놓은 것은 닫지 않는다
  const downOut = useRef(false);
  // 모바일 설정 안의 계정 버튼(#setacct)이 누르면 부를 함수. 계정이 열린 뒤 그릴 때마다 맞춘다
  const openRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setRoot(document.getElementById('app'));
    getAccount().then((a) => {
      setAcct(a);
      showName(a.islandName);
      if (a.recovery) setView('recovery');
      else if (a.needPassword) setView('setpw');
      else if (a.linkError) {
        setErr('메일의 링크가 만료되었거나 이미 쓰였습니다. 다시 가입해 주세요.');
        setView('guest');
      }
    });
  }, []);

  // 모바일 설정 안의 계정 버튼: 회원이면 '계정 · 이메일', 손님이면 '가입 · 로그인'. 서버가 없으면(오프라인) 칸을 숨긴다
  useEffect(() => {
    const btn = document.getElementById('setacct');
    const sec = document.getElementById('setacctsec');
    if (!btn || !sec || !acct) return;
    const online = acct.kind !== 'offline' && !!supabase;
    sec.hidden = !online;
    btn.textContent = acct.kind === 'member' ? `계정 · ${acct.email ?? ''}` : '가입 · 로그인';
    const onClick = () => openRef.current?.();
    btn.addEventListener('click', onClick);
    return () => btn.removeEventListener('click', onClick);
  }, [acct]);

  // 포커스가 창 밖(문서 본문)에 있을 때의 Esc
  useEffect(() => {
    if (view === 'closed' || locked(view)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('closed');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view]);

  if (!acct || acct.kind === 'offline' || !supabase) return null;
  const sb = supabase;

  const go = (v: View) => {
    setErr('');
    setNote('');
    setPassword('');
    setNewPw('');
    if (v === 'member') setName(acct.islandName ?? '');
    setView(v);
  };

  // 오류는 문장으로 바꿔 보여주고, 버튼을 다시 살린다
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setNote('');
    setBusy(true);
    try {
      await fn();
    } catch (x) {
      setErr(authMessage(x));
    } finally {
      setBusy(false);
    }
  };

  // 가입: 지금의 익명 계정에 이메일을 붙인다. Supabase는 이메일 인증이 끝나야 비밀번호를 정하게 하므로
  // 1) 이메일을 보내고 2) 메일의 링크를 누르거나 6자리 코드를 넣어 인증한 뒤 3) 비밀번호를 정한다.
  // 링크는 다른 탭이나 기기에서 열릴 수 있어, 이 브라우저에 '비밀번호를 아직 안 정함' 표시를 남긴다.
  const sendMail = () => sb.auth.updateUser({ email }, { emailRedirectTo: location.origin });

  const signup = run(async () => {
    const { error } = await sendMail();
    if (error) throw error;
    pending.set();
    go('code');
  });

  const confirm = run(async () => {
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email_change' });
    if (error) throw error;
    setAcct({ ...acct, kind: 'member', email });
    setCode('');
    go('setpw');
  });

  const resend = async () => {
    setErr('');
    const { error } = await sendMail();
    if (error) setErr(authMessage(error));
    else setNote('메일을 다시 보냈습니다.');
  };

  const setpw = run(async () => {
    if (password.length < 8) throw { code: 'weak_password' };
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    pending.clear();
    history.replaceState(null, '', location.pathname);
    setPassword('');
    go('welcome');
  });

  // 로그인하면 손님 섬을 떠나 내 섬으로 간다. 섬을 처음부터 다시 그리도록 새로 고친다.
  const login = run(async () => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    pending.clear();
    location.reload();
  });

  const forgot = run(async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) throw error;
    setNote('비밀번호를 다시 정하는 링크를 메일로 보냈습니다.');
  });

  const recover = run(async () => {
    if (password.length < 8) throw { code: 'weak_password' };
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    history.replaceState(null, '', location.pathname);
    setPassword('');
    go('closed');
  });

  // 비밀번호를 한 번 더 확인한다(비밀번호 수정·탈퇴 전에)
  const verify = async (pw: string) => {
    const { error } = await sb.auth.signInWithPassword({ email: acct.email ?? '', password: pw });
    if (error) throw error.code === 'invalid_credentials' ? { message: '비밀번호가 맞지 않습니다.' } : error;
  };

  // 섬 이름은 계정 정보(user_metadata)에 둔다. 비우면 '무인도'로 돌아간다
  const saveName = run(async () => {
    const n = name.trim().slice(0, NAME_MAX);
    const { error } = await sb.auth.updateUser({ data: { island_name: n } });
    if (error) throw error;
    setAcct({ ...acct, islandName: n || undefined });
    setName(n);
    showName(n);
    setNote(n ? `섬 이름을 ‘${n}’(으)로 지었습니다.` : `섬 이름을 ‘${DEFAULT_NAME}’(으)로 되돌렸습니다.`);
  });

  const changePw = run(async () => {
    if (newPw.length < 8) throw { code: 'weak_password' };
    await verify(password);
    const { error } = await sb.auth.updateUser({ password: newPw });
    if (error) throw error;
    go('member');
    setNote('비밀번호를 바꿨습니다.');
  });

  // 탈퇴: 비밀번호를 확인한 뒤, 보낸 편지를 거둬들이고 계정·섬·받은 편지를 지운다. 되돌릴 수 없다
  const withdraw = run(async () => {
    await verify(password);
    try {
      await net.withdraw();
    } catch (e) {
      throw { message: net.message(e) };
    }
    pending.clear();
    await sb.auth.signOut();
    location.reload();
  });

  const logout = async () => {
    await sb.auth.signOut();
    location.reload();
  };

  const member = acct.kind === 'member';
  openRef.current = () => go(member ? 'member' : 'guest');

  return (
    <>
      <button id="acctbtn" type="button" onClick={() => go(member ? 'member' : 'guest')}>
        {member ? '계정' : '가입 · 로그인'}
      </button>
      {view !== 'closed' &&
        root &&
        createPortal(
          <div
            className="veil"
            onPointerDown={(e) => {
              downOut.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              if (downOut.current && e.target === e.currentTarget && !locked(view)) go('closed');
              downOut.current = false;
            }}
            onKeyDown={(e) => {
              // 창 안의 키 입력은 섬(캐릭터)으로 보내지 않는다. 그래서 Esc도 여기서 직접 받는다
              e.stopPropagation();
              if (e.key === 'Escape' && !locked(view)) go('closed');
            }}
            onKeyUp={(e) => e.stopPropagation()}
          >
            <div className="sheet acct" role="dialog" aria-modal="true" aria-labelledby="acct-h">
              {!locked(view) && (
                <button type="button" className="x" aria-label="닫기" onClick={() => go('closed')}>
                  ×
                </button>
              )}
              {view === 'guest' && (
                <>
                  <p className="tag">손님</p>
                  <h2 id="acct-h">지금은 손님으로 머무는 중입니다</h2>
                  <p>손님은 편지를 받아 읽을 수만 있습니다. 가입하면 편지를 써서 바다에 띄울 수 있고, 지금 이 섬과 병이 그대로 남아 받은 편지와 보낸 편지를 모아 둘 수 있습니다.</p>
                  <p className="note">이 섬을 떠나면 섬도, 가진 병도 함께 사라집니다.</p>
                  <div className="btns">
                    <button type="button" className="primary" onClick={() => go('signup')}>이 섬에 남기 (가입)</button>
                    <button type="button" onClick={() => go('login')}>내 섬으로 돌아가기 (로그인)</button>
                  </div>
                </>
              )}

              {view === 'signup' && (
                <Form onSubmit={signup} title="이 섬에 남기" tag="가입" err={err} note={note}>
                  <Field id="su-email" autoFocus label="이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
                  <p className="note">이 주소로 확인 메일을 보냅니다. 비밀번호는 확인을 마친 뒤 정합니다. 이메일은 신고된 편지를 처리할 때만 씁니다. <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a></p>
                  <div className="btns">
                    <button type="submit" className="primary" aria-busy={busy}>확인 메일 받기</button>
                    <button type="button" onClick={() => go('guest')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'code' && (
                <Form onSubmit={confirm} title="메일을 확인해 주세요" tag="가입" err={err} note={note}>
                  <p>{email}로 확인 메일을 보냈습니다. 메일의 링크를 누르면 이 섬으로 돌아와 비밀번호를 정합니다.</p>
                  {EMAIL_CODE && (
                    <>
                      <p className="note">메일에 적힌 6자리 코드를 여기에 넣어도 됩니다.</p>
                      <Field id="su-code" label="코드" value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" />
                    </>
                  )}
                  <div className="btns">
                    {EMAIL_CODE && <button type="submit" className="primary" aria-busy={busy}>코드로 확인</button>}
                    <button type="button" className={EMAIL_CODE ? undefined : 'primary'} onClick={resend} aria-busy={busy}>메일 다시 받기</button>
                    <button type="button" onClick={() => go('signup')}>이메일 고치기</button>
                  </div>
                </Form>
              )}

              {view === 'setpw' && (
                <Form onSubmit={setpw} title="비밀번호를 정해 주세요" tag="가입" err={err} note={note}>
                  <p>{acct.email} 확인을 마쳤습니다. 다음에 로그인할 때 쓸 비밀번호를 정하면 가입이 끝납니다.</p>
                  <Field id="sp-pw" autoFocus label="비밀번호 (8자 이상)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
                  <div className="btns">
                    <button type="submit" className="primary" aria-busy={busy}>가입 마치기</button>
                  </div>
                </Form>
              )}

              {view === 'welcome' && (
                <>
                  <p className="tag">가입</p>
                  <h2 id="acct-h">이제 이 섬은 당신의 섬입니다</h2>
                  <p>다음에 들어올 때 {acct.email}로 로그인하면 이 섬으로 돌아옵니다.</p>
                  <div className="btns">
                    <button type="button" className="primary" onClick={() => go('closed')}>섬으로</button>
                  </div>
                </>
              )}

              {view === 'login' && (
                <Form onSubmit={login} title="내 섬으로 돌아가기" tag="로그인" err={err} note={note}>
                  <Field id="li-email" autoFocus label="이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
                  <Field id="li-pw" label="비밀번호" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
                  <p className="note">로그인하면 지금 머무는 손님 섬은 사라집니다.</p>
                  <div className="btns">
                    <button type="submit" className="primary" aria-busy={busy}>로그인</button>
                    <button type="button" onClick={() => go('forgot')}>비밀번호를 잊었어요</button>
                    <button type="button" onClick={() => go('guest')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'forgot' && (
                <Form onSubmit={forgot} title="비밀번호 다시 정하기" tag="로그인" err={err} note={note}>
                  <Field id="fg-email" autoFocus label="가입한 이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
                  <div className="btns">
                    <button type="submit" className="primary" aria-busy={busy}>링크 받기</button>
                    <button type="button" onClick={() => go('login')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'recovery' && (
                <Form onSubmit={recover} title="새 비밀번호" tag="로그인" err={err} note={note}>
                  <Field id="rc-pw" autoFocus label="새 비밀번호 (8자 이상)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
                  <div className="btns">
                    <button type="submit" className="primary" aria-busy={busy}>정하기</button>
                  </div>
                </Form>
              )}

              {view === 'member' && (
                <>
                  <p className="tag">계정</p>
                  <h2 id="acct-h">{acct.email}</h2>
                  <form onSubmit={saveName}>
                    <label htmlFor="ac-name">섬 이름</label>
                    <div className="inrow">
                      <input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder={DEFAULT_NAME} autoComplete="off" />
                      <button type="submit" aria-busy={busy}>저장</button>
                    </div>
                  </form>
                  <p className="err" role="alert">{err}</p>
                  {note && <p className="note" role="status">{note}</p>}
                  <div className="btns">
                    <button type="button" onClick={() => go('passwd')}>비밀번호 수정</button>
                    <button type="button" onClick={logout}>로그아웃</button>
                    <button type="button" onClick={() => go('withdraw')}>탈퇴</button>
                  </div>
                  <p className="note"><a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a></p>
                </>
              )}

              {view === 'passwd' && (
                <Form onSubmit={changePw} title="비밀번호 수정" tag="계정" err={err} note={note}>
                  <Field id="pw-cur" autoFocus label="지금 비밀번호" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
                  <Field id="pw-new" label="새 비밀번호 (8자 이상)" type="password" value={newPw} onChange={setNewPw} autoComplete="new-password" />
                  <div className="btns">
                    <button type="submit" className="primary" aria-busy={busy}>바꾸기</button>
                    <button type="button" onClick={() => go('member')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'withdraw' && (
                <Form onSubmit={withdraw} title="섬을 떠납니다" tag="탈퇴" err={err} note={note}>
                  <p>탈퇴하면 계정과 섬, 가진 병, 받은 편지와 보낸 편지 기록이 모두 지워지고 되돌릴 수 없습니다.</p>
                  <p>아직 바다를 떠돌거나 해변에서 열리지 않은 내 편지는 거둬들입니다. 이미 누군가 읽은 편지는 그 사람의 편지함에 남습니다.</p>
                  <Field id="wd-pw" autoFocus label="비밀번호를 한 번 더 넣어 주세요" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
                  <div className="btns">
                    <button type="submit" aria-busy={busy}>탈퇴하기</button>
                    <button type="button" className="primary" onClick={() => go('member')}>그만두기</button>
                  </div>
                </Form>
              )}
            </div>
          </div>,
          root,
        )}
    </>
  );
}

function Form(props: { onSubmit: (e: FormEvent) => void; title: string; tag: string; err: string; note: string; children: ReactNode }) {
  return (
    <form onSubmit={props.onSubmit}>
      <p className="tag">{props.tag}</p>
      <h2 id="acct-h">{props.title}</h2>
      {props.children}
      <p className="err" role="alert">{props.err}</p>
      {props.note && <p className="note" role="status">{props.note}</p>}
    </form>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: 'numeric';
  autoFocus?: boolean;
}) {
  return (
    <>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        autoFocus={props.autoFocus}
        required
      />
    </>
  );
}
