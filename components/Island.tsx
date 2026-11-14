'use client';

import { useEffect } from 'react';
import AccountPanel from './AccountPanel';
import Letterbox from './Letterbox';
import { getAccount } from '@/lib/account';
import { net } from '@/lib/net';

// 섬 화면의 틀. 내용은 lib/island/game.js 가 id로 찾아 직접 채우고 바꾼다.
// 이 컴포넌트는 상태가 없어 다시 그려지지 않으므로, React와 엔진이 같은 요소를 두고 다투지 않는다.
export default function Island() {
  useEffect(() => {
    // 회원은 저장된 섬, 비회원은 이번 접속의 새 섬을 받아 그린다
    Promise.all([getAccount(), import('@/lib/island/game')]).then(([a, m]) => m.startIsland(a.seed, a.kind === 'offline' ? null : net, a.born));
  }, []);

  return (
    <div id="app">
      <canvas id="scene" tabIndex={0} aria-label="3D 섬. 땅을 누르면 걸어갑니다." />
      <div id="grade" aria-hidden="true" />

      <div className="hud" id="hud">
        <div className="row">
          <div className="panel">
            <div className="title">나홀로섬에</div>
            <div className="clock" id="clock" />
            <div className="status" id="status">1일째</div>
          </div>
          <div className="panel seedbox">
            <div className="compass" aria-hidden="true"><i id="needle" /></div>
            <div>
              <div className="label">섬 시드</div>
              <div className="num" id="seed">00000</div>
            </div>
            <AccountPanel />
            <button id="gear" type="button" aria-label="설정" aria-expanded="false" aria-controls="setpanel">⚙</button>
          </div>
        </div>

        {/* 설정: 소리(배경음·라디오), 날씨(자동 변경), 화면보호기. 내용은 game.js가 채우고 맞춘다 */}
        <div className="panel setpanel" id="setpanel" role="dialog" aria-label="설정" hidden>
          <section>
            <h3>소리</h3>
            <label className="tog"><input type="checkbox" id="setbg" defaultChecked /> 배경음</label>
            <label className="tog"><input type="checkbox" id="setradio" /> 라디오</label>
          </section>
          <section>
            <h3>날씨</h3>
            <label className="tog"><input type="checkbox" id="setwx" defaultChecked /> 자동 변경</label>
            <p className="setnote" id="setwxnote" />
          </section>
          <section>
            <h3>화면보호기</h3>
            <button id="setsaver" type="button">시작</button>
            <p className="setnote">움직이거나 누르면 돌아옵니다.</p>
          </section>
        </div>

        <div className="row bottom">
          <div className="panel shelf">
            <div className="slots" id="slots" aria-label="가진 병">
              <span className="slot" /><span className="slot" /><span className="slot" />
            </div>
            <button id="write" type="button">편지 쓰기</button>
            <button id="sit" type="button">앉기</button>
            <button id="sandw" type="button">모래글쓰기</button>
            <Letterbox />
            <div className="shelfnote" id="shelfnote" />
          </div>
          <div className="center">
            <div id="toast" className="off" role="status" aria-live="polite" />
            <button id="action" type="button" hidden>병을 줍는다</button>
          </div>
          <div className="panel help">
            <b>땅을 누르면 걷고, 끌면 둘러봅니다.</b> 방향키와 휠도 됩니다.<br />
            섬의 시간은 현지 시간에 맞춰 흐릅니다.
          </div>
        </div>
      </div>

      <div className="writebar" id="writebar" hidden>
        <span>손가락이나 마우스로 모래 위에 글씨를 쓰세요.</span>
        <div className="wbtns">
          <button id="wclear" type="button">지우기</button>
          <button id="wcancel" type="button">그만두기</button>
          <button id="wgo" type="button">새기기</button>
        </div>
      </div>
      <div className="veil" id="veil" hidden>
        <div className="sheet" id="sheet" role="dialog" aria-modal="true" tabIndex={-1} />
      </div>
      {/* 화면보호기: 화면을 끌어 시점만 바꿀 수 있고, 아래 버튼으로 끈다 */}
      <div id="lock" hidden>
        <button id="saveroff" type="button">화면보호기 끄기</button>
      </div>
      <div id="fail" hidden>
        이 기기에서는 3D 화면을 열 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.
      </div>
    </div>
  );
}
