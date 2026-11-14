// 섬의 바다와 하늘. 섬 시드와 실제 시각(ms)만으로 정해지므로 저장하지 않는다.
// 화면 연출에만 쓴다. 병이 닿는 시각과 위치는 서버가 무작위로 정한다.
import { hash2, sm } from './math.js';

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);

// ── 조수: 반일주조. 섬마다 물때(위상)가 다르다 ──
export const TIDE_PERIOD = 44712; // 초 (12시간 25분 12초)
const tidePhase = (seed) => frac(seed * 0.6180339887);
// 각도. sin 이 1이면 만조, -1이면 간조, cos 가 양수면 밀물
export function tideAngle(seed, ms) {
  return (ms / 1000 / TIDE_PERIOD + tidePhase(seed)) * TAU;
}

// ── 바람: 6시간마다 새 방향과 세기를 정하고 그 사이를 부드럽게 잇는다 ──
const WIND_BLOCK = 6 * 3600 * 1000;
function blend(seed, ms, salt, angle) {
  const x = ms / WIND_BLOCK, b = Math.floor(x), f = sm(x - b);
  const v0 = hash2(b, salt, seed), v1 = hash2(b + 1, salt, seed);
  if (!angle) return v0 + (v1 - v0) * f;
  const a0 = v0 * TAU, a1 = v1 * TAU, d = ((a1 - a0 + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a0 + d * f;
}
// 바람이 부는 쪽(라디안)
export const windAngle = (seed, ms) => blend(seed, ms, 13, true);
// 0~1. 0.55가 넘으면 큰 파도가 친다
export const windStrength = (seed, ms) => blend(seed, ms, 21, false);

// ── 날씨: 3시간마다 바뀐다. 비 안 오는 날(맑음·흐림)과 비 오는 날이 8:2쯤. 소나기·폭풍우 뒤에는 바로 맑아지지 않는다 ──
const WX_BLOCK = 3 * 3600 * 1000;
function pick(r) {
  // 맑음 .62, 흐림 .18, 이슬비 .09, 비 .05, 소나기 .04, 폭풍우 .02 (game.js의 WX_W와 같다)
  return r < 0.62 ? 'clear' : r < 0.80 ? 'cloudy' : r < 0.89 ? 'drizzle' : r < 0.94 ? 'rain' : r < 0.98 ? 'shower' : 'storm';
}
export function weatherKind(seed, ms) {
  const b = Math.floor(ms / WX_BLOCK);
  const k = pick(hash2(b, 7, seed)), prev = pick(hash2(b - 1, 7, seed));
  if (k === 'clear' && (prev === 'storm' || prev === 'shower')) return 'cloudy';
  return k;
}
