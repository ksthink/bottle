// 섬 엔진이 서버와 주고받는 길. 엔진(lib/island/game.js)은 이 객체만 안다.
import { supabase } from './supabase';

export type Beach = { held: number; beach: { id: number; angle: number; rule: number | null }[] };
export type Opened = { kind: 'user' | 'rule'; rule: number | null; body: string };
export type Letters = {
  received: { body: string; rule: number | null; at: string }[];
  sent: { body: string; at: string }[];
};

async function rpc<T>(name: string, args?: object): Promise<T> {
  const { data, error } = await supabase!.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function api<T>(path: string, payload: object): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({ error: 'network' }));
  if (!r.ok) throw new Error(j.error || 'network');
  return j as T;
}

export const net = {
  beach: () => rpc<Beach>('my_beach'),
  open: (id: number) => api<Opened>('/api/open', { id }),
  keep: (id: number) => rpc<number>('keep_bottle', { p_bottle: id }),
  sink: (id: number) => api<{ held: number }>('/api/sink', { id }).then((r) => r.held),
  throw: (body: string) => api<{ held: number }>('/api/throw', { body }),
  letters: () => rpc<Letters>('my_letters'),
  withdraw: () => api<{ ok: boolean }>('/api/withdraw', {}),
  message(e: unknown): string {
    switch ((e as Error)?.message) {
      case 'no_bottle':
        return '손에 든 병이 없습니다.';
      case 'not_here':
        return '그 병은 이미 바다로 돌아갔습니다.';
      case 'bad_length':
        return '편지는 다섯 글자 이상, 300자 이하로 적어 주세요.';
      case 'auth':
        return '섬과의 연결이 끊어졌습니다. 새로 고쳐 주세요.';
      default:
        return '바다가 거칠어 병이 닿지 않았습니다. 잠시 뒤에 다시 해 주세요.';
    }
  },
};
export type Net = typeof net;
