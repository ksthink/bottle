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
| `SUPABASE_SECRET_KEY` | Supabase secret 키. 서버 함수(던지기·열기·신고·탈퇴)가 쓴다. Sensitive로 넣는다 |
| `RESEND_API_KEY` | Resend API 키. 신고 메일을 보낸다. 없으면 신고는 기록만 되고 메일은 가지 않는다 |
| `REPORT_TO`, `MAIL_FROM` | 신고 메일 받는 주소(기본 `bottle@metaphr.dev`)와 보내는 주소(기본 `유리병 편지 섬 <noreply@metaphr.dev>`) |
| `NEXT_PUBLIC_EMAIL_CODE` | `1`이면 가입 화면에 메일 6자리 코드 입력칸을 보여준다. 자체 SMTP를 연결하고 템플릿에 `{{ .Token }}`을 넣은 뒤 켠다 |
| `NEXT_PUBLIC_RADIO_URL` | 라디오 방송 주소(HLS `.m3u8`). 비어 있으면 방송이 잡히지 않는다 |

## Supabase 설정

- Authentication → Sign In / Providers: 익명 로그인(Anonymous sign-ins) 켜기, 이메일 인증(Confirm email) 켜기
- Authentication → URL Configuration: Site URL을 서비스 주소로, 개발용 `http://localhost:3000` 추가
- Authentication → Emails → Change email address 템플릿에 6자리 코드 `{{ .Token }}` 넣기 (비회원이 가입할 때 이 코드를 화면에 입력한다)
- Authentication → Emails → SMTP: 기본 메일 서버는 시간당 몇 통만 보내므로 Resend 등 자체 SMTP 연결

## 운영

- 금칙어: `lib/blocked-words.ts`를 고쳐 main에 올린다. 걸린 편지는 조용히 '차단됨'이 된다
- IP 차단: Supabase Table Editor의 `blocked_ips` 표에 IP를 넣는다. 그 IP에서 던진 병은 조용히 '차단됨'이 된다
- 신고: `reports` 표에 쌓인다. `mailed_at`이 비어 있으면 메일을 보내지 못한 것이다

## 배포

Vercel에 배포합니다.
