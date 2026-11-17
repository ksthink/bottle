// 접속하면 게임보다 먼저 뜨는 로딩 화면. 서버가 그린 HTML에 들어 있어 스크립트를 받기 전부터 보인다.
// 진행률(0~100)은 CSS 변수 --p 하나로 넘기고, 파도·젖은 모래·병의 위치는 CSS가 계산한다.
// 파도가 밀려오며 병을 해변으로 옮기고, 95%에서 파도가 물러나며 병이 모래에 내려앉는다(100%에서 반짝)
export default function Loader() {
  return (
    <div id="loader" role="progressbar" aria-label="섬을 불러오는 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
      <div className="ld">
        <div className="ld-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" aria-hidden="true">
            <path d="M11 21c.5-5 1.2-9 2-12" stroke="#9e7447" strokeWidth="2.6" />
            <path d="M13 9C9.5 7.5 6.5 8.5 5 11m8-2c3-1.5 5.5-.5 7 2" stroke="#5da858" strokeWidth="2.4" />
            <path d="M13 9c-2.5-3-6-3-8.5-1.5M13 9c2.5-3 5-3 7.5-1.5" stroke="#75bd68" strokeWidth="2.4" />
          </svg>
          나홀로섬에
        </div>
        <div className="ld-view">
          <svg viewBox="0 0 240 240" aria-hidden="true">
            <defs>
              <linearGradient id="ld-sea" x2=".1" y2="1">
                <stop offset="0" stopColor="#2f5a78" />
                <stop offset=".52" stopColor="#2f8fa8" />
                <stop offset=".84" stopColor="#3cbcc4" />
                <stop offset="1" stopColor="#7fdcdc" stopOpacity=".75" />
              </linearGradient>
              <linearGradient id="ld-shallow" x2="0" y2="1">
                <stop offset="0" stopColor="#3cbcc4" stopOpacity=".1" />
                <stop offset="1" stopColor="#b4eeee" stopOpacity=".55" />
              </linearGradient>
              <linearGradient id="ld-sand" x2="0" y2="1">
                <stop offset="0" stopColor="#e8d198" />
                <stop offset=".6" stopColor="#f1e0b0" />
                <stop offset="1" stopColor="#e6cf95" />
              </linearGradient>
              <linearGradient id="ld-glass">
                <stop offset="0" stopColor="#fff" stopOpacity=".8" />
                <stop offset=".5" stopColor="#d3efe3" stopOpacity=".45" />
                <stop offset="1" stopColor="#86cdb0" stopOpacity=".75" />
              </linearGradient>
            </defs>
            {/* 모래사장과 조약돌 */}
            <rect width="240" height="240" fill="url(#ld-sand)" />
            <g fill="#a3a59c" opacity=".8">
              <ellipse cx="152" cy="186" rx="6" ry="3.5" />
              <ellipse cx="188" cy="168" rx="4.5" ry="2.5" />
              <ellipse cx="94" cy="206" rx="5.5" ry="3" fill="#d4c2b2" />
              <ellipse cx="64" cy="176" rx="4.5" ry="2.5" fill="#c9b8a6" />
            </g>
            {/* 파도가 지나간 젖은 모래 */}
            <path id="ld-wet" d="M-30-160H270v286c-60 12-115 0-175-10-50-8-90-16-125-20Z" fill="#cfb06e" opacity=".5" />
            {/* 파도: 뒤의 얕은 물, 앞의 바다와 흰 물거품 */}
            <g id="ld-wave">
              <path className="ld-back" d="M-40-180h320v302c-55 14-115 0-175-12-55-10-100-18-145-24Z" fill="url(#ld-shallow)" />
              <g className="ld-front">
                <path d="M-40-180h320v294c-60 14-120 0-180-12-55-10-95-17-140-22Z" fill="url(#ld-sea)" />
                <g fill="none" strokeLinecap="round">
                  <path d="M20 66q70 10 140 22t95 10" stroke="#fff" strokeWidth="1.5" opacity=".28" />
                  <path d="M-40 80c45 5 85 12 140 22 60 12 120 26 180 12" stroke="#fff" strokeWidth="3.2" opacity=".88" />
                  <path d="M-30 84c45 5 85 12 140 22 55 12 110 24 160 12" stroke="#e6fbfc" strokeWidth="1.6" opacity=".55" />
                </g>
              </g>
            </g>
            {/* 편지가 든 유리병 */}
            <g id="ld-bottle">
              <g className="ld-float">
                <ellipse cx="1" cy="14" rx="13" ry="4.5" fill="#b39656" opacity=".45" />
                <path d="M-6-18h3v9c-4 2-5 6-5 11v9c0 2.5 2 4 8 4s8-1.5 8-4V2c0-5-1-9-5-11v-9h3" fill="url(#ld-glass)" stroke="#6fae98" strokeWidth="1.2" strokeLinejoin="round" />
                <rect x="-3.2" y="-1" width="6.4" height="11" rx="1.5" fill="#f1e6cc" stroke="#cdb789" strokeWidth=".8" transform="rotate(8 0 4)" />
                <rect x="-2.4" y="-21.5" width="4.8" height="4" rx="1" fill="#a8774a" />
                <path d="M-5-4V9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
              </g>
              <g className="ld-spark">
                <path d="m15-14 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" fill="#fff6c2" />
                <path d="m-16 6 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#fff" />
              </g>
            </g>
          </svg>
        </div>
        <div className="ld-bar" aria-hidden="true"><i /></div>
      </div>
    </div>
  );
}

// 진행률: 할 일마다 몫(합 100)을 정해, 끝난 일은 몫 전부, 아직인 일은 기다린 시간만큼 몫의 85%까지 천천히 차오른다.
// 화면의 숫자는 목표치를 매 프레임 쫓아가되 초당 60% 이상으로 움직여, 캐시가 있어 금방 끝나도 파도가 한 번은 흘러간다.
type Loader = {
  track: <T>(share: number, p: Promise<T>) => Promise<T>;
  settle: () => Promise<void>;
  done: () => void;
};
let current: Loader | null = null;

export function startLoader(): Loader {
  if (current) return current; // 개발 모드에서 effect가 두 번 돌아도 하나만
  const root = document.getElementById('loader');
  const jobs: { share: number; at: number; ok: boolean }[] = [];
  let shown = 0, last = performance.now(), finished = false, closing = false;
  // 스크립트가 오기 전 CSS가 채워 둔 만큼에서 이어받는다
  const put = () => {
    if (!root) return;
    root.style.setProperty('--p', shown.toFixed(2));
    root.setAttribute('aria-valuenow', String(Math.floor(shown)));
  };
  if (root) {
    shown = parseFloat(getComputedStyle(root).getPropertyValue('--p')) || 0;
    put();
    root.classList.add('js');
  }

  const target = () => {
    if (finished) return 100;
    const now = performance.now();
    let s = 0;
    for (const j of jobs) s += j.ok ? j.share : j.share * 0.85 * (1 - Math.exp(-(now - j.at) / 1800));
    return Math.min(99, s);
  };
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000), t = target();
    last = now;
    if (t > shown) shown = Math.min(t, shown + Math.max(60, (t - shown) * 5) * dt);
    put();
    if (shown >= 100) return land();
    requestAnimationFrame(tick);
  };
  // 100%: 병이 모래에 내려앉아 반짝인 뒤 로딩 화면이 걷힌다
  const land = () => {
    if (closing || !root) return;
    closing = true;
    root.classList.add('landed');
    setTimeout(() => {
      root.classList.add('out');
      setTimeout(() => { root.hidden = true; }, 450);
    }, 500);
  };
  requestAnimationFrame(tick);

  current = {
    track(share, p) {
      const j = { share, at: performance.now(), ok: false };
      jobs.push(j);
      const fin = () => { j.ok = true; };
      p.then(fin, fin);
      return p;
    },
    // 화면을 멈추게 하는 일(섬 만들기)을 하기 전에, 숫자가 목표치를 따라잡을 때까지 잠깐 기다린다(길어야 0.6초)
    settle() {
      return new Promise((res) => {
        const t0 = performance.now();
        const wait = () => (shown >= target() - 1 || performance.now() - t0 > 600 ? res() : requestAnimationFrame(wait));
        wait();
      });
    },
    done() { finished = true; },
  };
  return current;
}
