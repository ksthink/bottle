# 유리병 편지 섬

혼자 사는 작은 섬에 유리병 편지가 밀려옵니다. 읽고, 쓰고, 바다에 던지면 이름 모를 누군가에게 닿습니다. 답장도, 읽음 표시도 없습니다.

- `app/`, `components/` — Next.js 화면
- `lib/island/` — 섬 3D 엔진 (three.js r128)
  - `game.js` 엔진 본체, `toon.js` 카툰 셰이더, `letters.js` 규칙 편지, `math.js` 난수·보간, `filter.js` 연락처 필터
- `public/sounds/` — 배경음과 효과음 (지금은 비어 있음)
- `prototype/index.html` — 처음 만든 단일 파일 시제품 (참고용)
- `PLAN.md` — 서비스 계획서

## 로컬 실행

```sh
npm install
npm run dev
```

## 환경 변수

| 이름 | 내용 |
| --- | --- |
| `NEXT_PUBLIC_RADIO_URL` | 라디오 방송 주소(HLS `.m3u8`). 비어 있으면 방송이 잡히지 않는다 |

## 배포

Vercel에 배포합니다.
