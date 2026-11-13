'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { authMessage, getAccount, type Account } from '@/lib/account';
import { supabase } from '@/lib/supabase';

type View = 'closed' | 'guest' | 'signup' | 'code' | 'login' | 'forgot' | 'member' | 'recovery' | 'welcome';

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

  useEffect(() => {
    setRoot(document.getElementById('app'));
    getAccount().then((a) => {
      setAcct(a);
      if (a.recovery) setView('recovery');
    });
  }, []);

  if (!acct || acct.kind === 'offline' || !supabase) return null;
  const sb = supabase;

  const go = (v: View) => {
    setErr('');
    setNote('');
    setView(v);
  };

  // 오류는 문장으로 바꿔 보여주고, 버튼을 다시 살린다
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
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

  // 가입: 지금의 익명 계정에 이메일을 붙인다. 이메일 인증이 끝나야 비밀번호를 정할 수 있어서
  // 메일로 받은 코드를 이 화면에서 바로 넣게 하고, 코드가 맞으면 이어서 비밀번호를 정한다.
  const signup = run(async () => {
    if (password.length < 8) throw { code: 'weak_password' };
    const { error } = await sb.auth.updateUser({ email });
    if (error) throw error;
    go('code');
  });

  const confirm = run(async () => {
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email_change' });
    if (error) throw error;
    const { error: pwErr } = await sb.auth.updateUser({ password });
    if (pwErr) throw pwErr;
    setAcct({ ...acct, kind: 'member', email });
    setPassword('');
    setCode('');
    go('welcome');
  });

  const resend = async () => {
    setErr('');
    const { error } = await sb.auth.updateUser({ email });
    if (error) setErr(authMessage(error));
    else setNote('코드를 다시 보냈습니다.');
  };

  // 로그인하면 손님 섬을 떠나 내 섬으로 간다. 섬을 처음부터 다시 그리도록 새로 고친다.
  const login = run(async () => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
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

  const logout = async () => {
    await sb.auth.signOut();
    location.reload();
  };

  const member = acct.kind === 'member';

  return (
    <>
      <button id="acctbtn" type="button" onClick={() => go(member ? 'member' : 'guest')}>
        {member ? '내 계정' : '가입 · 로그인'}
      </button>
      {view !== 'closed' &&
        root &&
        createPortal(
          <div
            className="veil"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' && view !== 'recovery') go('closed');
            }}
            onKeyUp={(e) => e.stopPropagation()}
          >
            <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="acct-h">
              {view === 'guest' && (
                <>
                  <p className="tag">손님</p>
                  <h2 id="acct-h">지금은 손님으로 머무는 중입니다</h2>
                  <p>이 섬을 떠나면 섬도, 가진 병도 함께 사라집니다. 가입하면 지금 이 섬과 병이 그대로 남고, 받은 편지와 보낸 편지를 모아 둘 수 있습니다.</p>
                  <div className="btns">
                    <button type="button" className="primary" onClick={() => go('signup')}>이 섬에 남기 (가입)</button>
                    <button type="button" onClick={() => go('login')}>내 섬으로 돌아가기 (로그인)</button>
                    <button type="button" onClick={() => go('closed')}>닫기</button>
                  </div>
                </>
              )}

              {view === 'signup' && (
                <Form onSubmit={signup} title="이 섬에 남기" tag="가입" err={err} note={note}>
                  <Field id="su-email" label="이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
                  <Field id="su-pw" label="비밀번호 (8자 이상)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
                  <p className="note">이메일로 6자리 코드를 보냅니다. 이메일은 신고된 편지를 처리할 때만 씁니다.</p>
                  <div className="btns">
                    <button type="submit" className="primary" disabled={busy}>코드 받기</button>
                    <button type="button" onClick={() => go('guest')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'code' && (
                <Form onSubmit={confirm} title="메일로 받은 코드" tag="가입" err={err} note={note}>
                  <p>{email}로 보낸 6자리 숫자를 넣어 주세요.</p>
                  <Field id="su-code" label="코드" value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" />
                  <div className="btns">
                    <button type="submit" className="primary" disabled={busy}>가입 마치기</button>
                    <button type="button" onClick={resend} disabled={busy}>코드 다시 받기</button>
                    <button type="button" onClick={() => go('signup')}>이메일 고치기</button>
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
                  <Field id="li-email" label="이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
                  <Field id="li-pw" label="비밀번호" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
                  <p className="note">로그인하면 지금 머무는 손님 섬은 사라집니다.</p>
                  <div className="btns">
                    <button type="submit" className="primary" disabled={busy}>로그인</button>
                    <button type="button" onClick={() => go('forgot')}>비밀번호를 잊었어요</button>
                    <button type="button" onClick={() => go('guest')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'forgot' && (
                <Form onSubmit={forgot} title="비밀번호 다시 정하기" tag="로그인" err={err} note={note}>
                  <Field id="fg-email" label="가입한 이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
                  <div className="btns">
                    <button type="submit" className="primary" disabled={busy}>링크 받기</button>
                    <button type="button" onClick={() => go('login')}>뒤로</button>
                  </div>
                </Form>
              )}

              {view === 'recovery' && (
                <Form onSubmit={recover} title="새 비밀번호" tag="로그인" err={err} note={note}>
                  <Field id="rc-pw" label="새 비밀번호 (8자 이상)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
                  <div className="btns">
                    <button type="submit" className="primary" disabled={busy}>정하기</button>
                  </div>
                </Form>
              )}

              {view === 'member' && (
                <>
                  <p className="tag">내 계정</p>
                  <h2 id="acct-h">{acct.email}</h2>
                  <p>이 계정의 섬에 머무는 중입니다.</p>
                  <div className="btns">
                    <button type="button" onClick={logout}>로그아웃</button>
                    <button type="button" className="primary" onClick={() => go('closed')}>닫기</button>
                  </div>
                </>
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
        required
      />
    </>
  );
}
