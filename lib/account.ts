import { supabase } from './supabase';

export type Account = {
  // member: 이메일 인증을 마친 회원, guest: 이번 접속만 사는 익명 계정, offline: 서버에 닿지 못함
  kind: 'member' | 'guest' | 'offline';
  email?: string;
  seed: number;
  // 비밀번호 재설정 메일의 링크를 타고 들어왔는지
  recovery: boolean;
};

const randomSeed = () => 10000 + Math.floor(Math.random() * 90000);

async function open(): Promise<Account> {
  const recovery = typeof location !== 'undefined' && /type=recovery/.test(location.hash);
  if (!supabase) return { kind: 'offline', seed: randomSeed(), recovery: false };
  try {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    // 비회원은 접속할 때마다 새 익명 계정과 새 섬으로 시작한다
    if (!session || session.user.is_anonymous) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    const { data: island, error } = await supabase.rpc('my_island');
    if (error) throw error;
    const user = session!.user;
    return {
      kind: user.is_anonymous ? 'guest' : 'member',
      email: user.email ?? undefined,
      seed: island.seed,
      recovery,
    };
  } catch (e) {
    console.error('계정을 열지 못했습니다', e);
    return { kind: 'offline', seed: randomSeed(), recovery: false };
  }
}

// 한 번 열고 같은 결과를 함께 쓴다 (섬 엔진과 계정 패널)
let opening: Promise<Account> | null = null;
export function getAccount() {
  return (opening ??= open());
}

// Supabase 오류를 사용자에게 보여줄 문장으로
export function authMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  switch (err?.code) {
    case 'email_exists':
    case 'user_already_exists':
      return '이미 가입된 이메일입니다. 로그인해 주세요.';
    case 'invalid_credentials':
      return '이메일이나 비밀번호가 맞지 않습니다.';
    case 'email_not_confirmed':
      return '아직 이메일 인증을 마치지 않은 계정입니다.';
    case 'weak_password':
      return '비밀번호가 너무 약합니다. 8자 이상으로 정해 주세요.';
    case 'otp_expired':
      return '코드가 맞지 않거나 시간이 지났습니다.';
    case 'email_address_invalid':
      return '쓸 수 없는 이메일 주소입니다.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return '요청이 너무 잦습니다. 잠시 뒤에 다시 해 주세요.';
    case 'same_password':
      return '지금 쓰는 비밀번호와 다르게 정해 주세요.';
    default:
      return err?.message || '알 수 없는 문제가 생겼습니다.';
  }
}
