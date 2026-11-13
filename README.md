# 유리병 편지 섬

혼자 사는 작은 섬에 유리병 편지가 밀려옵니다. 읽고, 쓰고, 바다에 던지면 이름 모를 누군가에게 닿습니다. 답장도, 읽음 표시도 없습니다.

- `app/`, `components/` — Next.js 화면
- `lib/island/` — 섬 3D 엔진 (three.js r128)
  - `game.js` 엔진 본체, `toon.js` 카툰 셰이더, `letters.js` 규칙 편지, `math.js` 난수·보간, `filter.js` 연락처 필터
- `public/sounds/` — 배경음과 효과음 (지금은 비어 있음)
- `supabase/migrations/` — DB 스키마
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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 공개 키(`sb_publishable_...`). 둘 중 하나라도 없으면 서버 없이 비회원처럼 돈다 |
| `NEXT_PUBLIC_EMAIL_CODE` | `1`이면 가입 화면에 메일 6자리 코드 입력칸을 보여준다. 자체 SMTP를 연결하고 템플릿에 `{{ .Token }}`을 넣은 뒤 켠다 |
| `NEXT_PUBLIC_RADIO_URL` | 라디오 방송 주소(HLS `.m3u8`). 비어 있으면 방송이 잡히지 않는다 |

## Supabase 설정

- Authentication → Sign In / Providers: 익명 로그인(Anonymous sign-ins) 켜기, 이메일 인증(Confirm email) 켜기
- Authentication → URL Configuration: Site URL을 서비스 주소로, 개발용 `http://localhost:3000` 추가
- Authentication → Emails → Change email address 템플릿에 6자리 코드 `{{ .Token }}` 넣기 (비회원이 가입할 때 이 코드를 화면에 입력한다)
- Authentication → Emails → SMTP: 기본 메일 서버는 시간당 몇 통만 보내므로 Resend 등 자체 SMTP 연결

## 배포

Vercel에 배포합니다.
