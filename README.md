# 나홀로섬에

혼자 사는 작은 섬에 유리병 편지가 밀려옵니다. 해변을 걸어 병을 찾아 읽고, 회원이라면 편지를 써서 바다에 띄웁니다. 편지는 이름 모를 누군가에게 반드시 닿지만, 어디로 갔는지도, 읽혔는지도 알 수 없고 답장도 없습니다.

섬은 계정마다 하나이고 시드값 하나로 지형이 정해집니다. 낮과 밤은 기기의 현지 시각을, 물때·날씨·바람은 섬 시드와 실제 시각을 따릅니다. 실시간으로 다른 사람과 만나는 일은 없습니다. 다른 사람은 병으로만 존재합니다.

- 서비스 규칙과 결정 사항: [PLAN.md](PLAN.md)
- 바다·하늘·날씨·동물 같은 자연 요소의 구현 기법: [EFFECT.md](EFFECT.md)
- 소리 파일 넣는 법: [public/sounds/README.md](public/sounds/README.md)

## 원칙 (고정)

- **편지는 가입한 회원만 보낸다.** 비회원(익명 손님 계정)과 오프라인은 받은 편지를 읽기만 한다. 세 곳에서 막는다.
  - 화면: `lib/island/game.js`의 `CAN_WRITE`. 비회원에게는 '편지를 쓴다' 버튼과 '보낸 편지' 칸이 없다
  - 서버: `/api/throw`가 익명 계정을 `members_only`(403)로 거절한다
  - DB: `throw_bottle`이 비회원이면 거절한다(`supabase/migrations/20261114000000_members_only.sql`)
- 그래서 신고된 편지에는 늘 보낸 사람의 이메일이 있고, 신고 메일에 함께 간다(`lib/mail.ts`).
- 비회원은 병을 보내 비울 수 없으므로, 챙긴 병은 해변이 받을 수 있는 상한(3)에 넣지 않는다(DB `_total`, 오프라인 `total()`).

## 기술 구성

| 영역 | 사용 |
| --- | --- |
| 웹 | Next.js 16 (App Router), React 19, TypeScript |
| 3D | three.js r128 (`three@0.128.0`). 대부분의 자연 요소는 직접 쓴 GLSL 셰이더 |
| 계정·DB | Supabase: 익명 로그인, 이메일 인증, Postgres 함수(RLS·`security definer`), `pg_cron` 주기 작업 |
| 메일 | Resend (신고 메일) |
| 라디오 | 서버가 `.pls` 재생 목록을 읽어 HLS 주소를 넘기고, 화면은 hls.js(cdnjs)로 재생한 뒤 Web Audio로 공간음향을 건다 |
| 배포 | Vercel |

## 폴더

```
app/
  page.tsx, layout.tsx      첫 화면(섬)과 공통 틀
  globals.css               HUD·창·편지함 두루마리 등 화면 스타일 전부
  privacy/                  개인정보처리방침
  api/
    throw/   병 던지기(회원만, 금칙어·연락처는 조용히 '차단됨')
    open/    해변의 병 열기(편지 본문은 이때 처음 내려 준다)
    sink/    병째 가라앉히기(신고). 관리자에게 신고 메일
    withdraw/ 탈퇴
    radio/   라디오 재생 목록(.pls) → 방송 주소(HLS)
components/
  Island.tsx                화면 틀. 엔진이 id로 찾아 채운다(React는 다시 그리지 않는다)
  AccountPanel.tsx          가입·로그인·계정 창(섬 이름, 비밀번호 수정, 로그아웃, 탈퇴)
  Letterbox.tsx             편지함. 말린 종이 두루마리를 톱니처럼 넘기고, 눌러 펼쳐 읽는다
lib/
  island/
    game.js                 섬 3D 엔진 본체(지형·바다·하늘·날씨·동물·캐릭터·소리·조작)
    toon.js                 카툰 셰이딩
    env.js                  시드와 시각으로 물때·날씨·바람 계산
    letters.js              규칙 편지 세 통과 시연용 편지(오프라인)
    math.js, filter.js      난수·보간, 연락처 필터
  account.ts                계정 열기(회원·손님·오프라인), 오류 문장
  net.ts                    엔진과 화면이 서버와 주고받는 길
  server.ts                 서버 함수 공통(secret 키, 사용자·IP 확인, 오류 코드)
  mail.ts                   신고 메일(Resend)
  blocked-words.ts          금칙어 목록
  supabase.ts               브라우저용 Supabase 클라이언트
supabase/migrations/        DB 스키마와 함수(순서대로 적용)
public/sounds/              배경음·효과음 mp3와 manifest.json
public/textures/            불꽃 텍스처
public/fonts/               웹폰트(WOFF2). 넥슨 Lv1 고딕, 심경하체, SF함박눈
scripts/sound-manifest.mjs  public/sounds의 mp3 목록을 manifest.json으로 적는다
prototype/index.html        처음 만든 단일 파일 시제품(참고용)
```

## 로컬 실행

```sh
npm install
npm run dev     # http://localhost:3000
```

- `npm run dev`와 `npm run build`는 시작할 때 `public/sounds/manifest.json`을 다시 만든다(`npm run sounds`).
- Supabase 환경 변수가 없거나 서버에 닿지 않으면 **오프라인**으로 돈다. 섬과 규칙 편지·시연용 편지는 보이지만 편지를 보낼 수 없고 남는 것도 없다.
- Node.js 20.9 이상.

## 환경 변수

| 이름 | 내용 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 공개 키(`sb_publishable_...`). 둘 중 하나라도 없으면 오프라인으로 돈다 |
| `SUPABASE_SECRET_KEY` | Supabase secret 키. 서버 함수(던지기·열기·신고·탈퇴)가 쓴다. Vercel에는 Sensitive로 넣는다 |
| `RESEND_API_KEY` | Resend API 키. 없으면 신고는 기록만 되고 메일은 가지 않는다 |
| `REPORT_TO`, `MAIL_FROM` | 신고 메일 받는 주소(기본 `bottle@metaphr.dev`)와 보내는 주소(기본 `나홀로섬에 <noreply@metaphr.dev>`) |
| `NEXT_PUBLIC_EMAIL_CODE` | `1`이면 가입 화면에 메일 6자리 코드 입력칸을 보여준다. 자체 SMTP를 연결하고 템플릿에 `{{ .Token }}`을 넣은 뒤 켠다 |
| `NEXT_PUBLIC_RADIO_URL` | 라디오 방송 주소(HLS `.m3u8`). 있으면 이것을 바로 튼다 |
| `RADIO_PLS_URL` | `NEXT_PUBLIC_RADIO_URL`이 없을 때 쓰는 재생 목록(`.pls`). 서버(`/api/radio`)가 켤 때마다 읽어 그 안의 https 방송 주소를 넘긴다. 기본값 `http://serpent0.duckdns.org:8088/kbsfm.pls` |

## Supabase 설정

**인증**

- Authentication → Sign In / Providers: 익명 로그인(Anonymous sign-ins) 켜기, 이메일 인증(Confirm email) 켜기
- Authentication → URL Configuration: Site URL을 서비스 주소로, 개발용 `http://localhost:3000` 추가
- Authentication → Emails → Change email address 템플릿에 6자리 코드 `{{ .Token }}` 넣기(비회원이 가입할 때 이 코드를 화면에 입력한다)
- Authentication → Emails → SMTP: 기본 메일 서버는 시간당 몇 통만 보내므로 Resend 등 자체 SMTP 연결

**DB**

`supabase/migrations/`의 파일을 이름 순서대로 SQL Editor에서 실행한다(이 저장소는 Supabase CLI에 연결되어 있지 않다).

| 파일 | 내용 |
| --- | --- |
| `20261113000000_islands.sql` | 계정마다 섬 하나(시드만 저장), 익명 계정 이틀 뒤 정리 |
| `20261113010000_bottles.sql` | 편지·병, 규칙 편지 세 통, 던지기·열기·챙기기·가라앉히기, 편지함, 5분마다 배정 |
| `20261113020000_tides.sql` | 도착 시각(1시간~7일), 7일 보장, 못 찾은 병을 밀물이 가져가 다른 섬으로 |
| `20261113030000_safety.sql` | 신고(`reports`), 차단 IP, 탈퇴, IP 1개월 뒤 삭제 |
| `20261114000000_members_only.sql` | 회원만 보내기, 비회원의 챙긴 병은 상한에 넣지 않기 |

화면에서 부르는 함수는 로그인한 본인 것만 다루고, IP를 남기는 일(던지기·열기·신고·탈퇴)은 secret 키를 쓰는 서버 함수만 부를 수 있다.

## 화면과 조작

- **이동**: 땅을 누르면 걸어간다. 방향키·WASD도 된다. 끌면 둘러보고, 휠이나 두 손가락으로 거리를 바꾼다. 아래로 끌어 카메라를 낮추면 하늘을 올려다본다.
- **병 줍기**: 가까이 가면 해변의 병이 반짝인다. 병을 누르면 걸어가 주워서 편지를 연다. 병 곁에서 Enter로도 줍는다.
- **행동 버튼**(화면 아래 가운데): 라디오 곁에서는 '라디오를 켠다/끈다', 회원이 병을 가지고 해변에 있으면 '편지를 쓴다'.
- **왼쪽 아래**: 가진 병 수, 받은 편지 수(누르면 편지함), 모래글(위에서 내려다보며 모래에 글씨를 새긴다), 앉기(가만히 3분이면 저절로 앉고, 앉은 지 5분이면 가방을 베고 눕는다).
- **오른쪽 위**: 섬 이름(회원이 계정 창에서 짓는다. 처음엔 '무인도')과 `#고유번호`, 계정, 설정(배경음·라디오 크기 3단계, 공간음향, 날씨 자동 변경, 화면보호기).

## 글꼴

| 쓰는 곳 | 글꼴 | 파일 |
| --- | --- | --- |
| 화면 전체(HUD, 창, 버튼, 기념사진 글자) | 넥슨 Lv1 고딕 | `public/fonts/nexon-lv1-gothic.woff2` |
| 편지 본문(읽는 창, 쓰는 칸, 편지함 두루마리) | 심경하체 | `public/fonts/sim-kyungha.woff2` |
| 화면보호기 시계 | SF함박눈 | `public/fonts/sf-hambaksnow.woff2` |

- `app/globals.css`의 `@font-face`와 `--font-ui`, `--font-letter`, `--font-clock`으로 쓴다. 넥슨 Lv1 고딕은 `app/layout.tsx`에서 미리 받는다.
- 원본 TTF에서 필요한 글자만 남겨 WOFF2로 바꿨다. 넥슨과 심경하체는 영문, 문장부호, 한글 음절 11,172자 전부, 자모를 남기고(한자는 뺐다), 시계 글꼴은 영문과 숫자만 남겼다. 다시 만들려면 원본 TTF를 `FONT/`에 두고:

```sh
U='U+0020-007E,U+00A0-00FF,U+1100-11FF,U+2010-2027,U+2030-203A,U+20A9,U+2116,U+2122,U+2190-21FF,U+2460-2473,U+25A0-25FF,U+2600-26FF,U+3000-303F,U+3131-318E,U+AC00-D7A3,U+FF01-FF5E'
pyftsubset FONT/NEXON.ttf  --unicodes="$U" --flavor=woff2 --layout-features='*' --no-hinting --output-file=public/fonts/nexon-lv1-gothic.woff2
pyftsubset FONT/SIM.ttf    --unicodes="$U" --flavor=woff2 --layout-features='*' --no-hinting --output-file=public/fonts/sim-kyungha.woff2
pyftsubset FONT/SF_TTF.ttf --unicodes='U+0020-007E' --flavor=woff2 --layout-features='*' --no-hinting --output-file=public/fonts/sf-hambaksnow.woff2
```

(`pyftsubset`은 `pip install fonttools brotli`로 설치한다.)

## 소리

`public/sounds/`에 정해진 이름의 mp3를 넣으면 자동으로 쓴다(목록은 [public/sounds/README.md](public/sounds/README.md)). 파일이 없으면 환경음(파도·바람·비·먼바다)은 브라우저에서 합성하고, 효과음은 나지 않는다. 소리는 캐릭터 머리에 귀를 두고 HRTF로 공간에 놓는다.

## 성능

- 픽셀 비율은 1.5배까지만 쓴다. 레티나에서 2배로 그리면 물·하늘 셰이더가 픽셀 수만큼 무거워져 30fps 아래로 떨어진다.
- 모닥불이 꺼져 있으면 점광원 그림자 지도(6방향)를 다시 그리지 않는다(`shadow.autoUpdate`). `castShadow`를 바꾸면 모든 재질이 다시 컴파일되므로 그대로 둔다.
- 휴대폰(`pointer: coarse`)에서는 그림자 해상도, 구름 옥타브, 빗줄기 수, 불꽃 광선 걸음을 줄인다.

## 운영

- 금칙어: `lib/blocked-words.ts`를 고쳐 main에 올린다. 걸린 편지는 조용히 '차단됨'이 된다.
- IP 차단: Supabase Table Editor의 `blocked_ips` 표에 IP를 넣는다. 그 IP에서 던진 병은 조용히 '차단됨'이 된다.
- 신고: `reports` 표에 쌓이고 관리자에게 메일이 간다. `mailed_at`이 비어 있으면 메일을 보내지 못한 것이다.

## 배포

`main`에 올리면 Vercel이 배포한다. DB 마이그레이션은 자동으로 적용되지 않으므로, 새 파일이 생기면 SQL Editor에서 따로 실행한다.
