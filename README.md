# 퀘스트로그 (PWA)

습관을 RPG 퀘스트로 관리하는 웹앱이에요. 홈 화면에 추가하면 앱처럼 열리고, 퀘스트 시각과 마감 직전에 푸시 알림이 와요.

- 화면, 저장 서버, 15분마다 도는 알림 발송기가 **Cloudflare Workers 하나**에 다 들어 있어요.
- 개인 사용량이면 **무료 플랜**으로 충분해요. 서버가 잠들지 않아서 알림이 끊기지 않아요.

## 준비물

- PC (맥 또는 윈도우)와 [Node.js](https://nodejs.org) 20 이상
- [Cloudflare](https://dash.cloudflare.com/sign-up) 무료 계정

## 배포 (처음 한 번, 10분 정도)

압축을 푼 폴더에서 터미널을 열고 아래를 순서대로 실행하세요.

**1. 설치하고 로그인**

```bash
npm install
npx wrangler login
```

브라우저가 열리면 Cloudflare 로그인 후 허용을 누르세요.

**2. 저장소(KV) 만들기**

```bash
npx wrangler kv namespace create QUESTLOG
```

출력된 `id = "..."` 값을 `wrangler.toml`의 `REPLACE_WITH_KV_ID` 자리에 붙여넣으세요.

**3. 알림 키 만들기**

```bash
npm run vapid
```

- 출력된 공개키를 `wrangler.toml`의 `REPLACE_WITH_VAPID_PUBLIC_KEY` 자리에 붙여넣으세요.
- `VAPID_SUBJECT`의 메일 주소를 본인 메일로 바꾸세요.
- 출력된 `{"kty":"EC",...}` JSON 한 줄은 4단계에서 써요. 다른 곳에 올리거나 공유하지 마세요.

**4. 배포하고 비밀키 넣기**

```bash
npm run deploy
npx wrangler secret put VAPID_PRIVATE_JWK
```

두 번째 명령이 값을 물어보면 3단계의 JSON 한 줄을 그대로 붙여넣고 엔터를 누르세요.

배포가 끝나면 `https://questlog.<내계정>.workers.dev` 같은 주소가 나와요.

## 아이폰에서 쓰기

1. **Safari**로 위 주소를 열어요. (크롬 앱은 홈 화면 앱 알림이 안 돼요.)
2. 아래 공유 버튼 → **홈 화면에 추가**
3. 홈 화면의 퀘스트로그 아이콘으로 열어요.
4. 위에 뜨는 **알림 켜기**를 누르고 허용해요.
5. **설정 → 테스트 알림**으로 알림이 오는지 확인해요.

iOS 16.4 이상이 필요해요. 안드로이드와 PC 크롬은 홈 화면 추가 없이도 알림을 켤 수 있어요.

## 알림 규칙

| 언제 | 알림 |
|---|---|
| 퀘스트마다 정한 시각 | "영어 공부 할 시간 · +20 XP" |
| 21:00 | 남은 퀘스트가 있으면 "아직 N개 남았어요" |
| 23:00 | "마감 1시간 전 · 자정 지나면 HP −15×N" |
| 23:45 | "15분 남았어요" |

- 그날 퀘스트를 다 깨면 독촉 알림은 오지 않아요.
- 발송기는 15분마다 돌아서 알림이 최대 15분 늦을 수 있어요.
- 설정에서 퀘스트 시각 알림과 마감 독촉을 따로 끌 수 있어요.

## 여러 기기에서 쓰기

설정의 **기기 연결 코드**를 복사해서 다른 기기의 설정에 붙여넣고 저장하면 같은 기록을 써요. 로그인 대신 쓰는 열쇠라서, 코드를 아는 사람은 기록을 볼 수 있어요.

## 수정하고 다시 배포

`public/index.html`(화면)이나 `src/worker.js`(알림 규칙)를 고친 뒤 `npm run deploy`를 실행하면 돼요. 기록은 그대로 남아요.

## 파일 구성

```
public/index.html          화면 (퀘스트, 스탯, 업적)
public/sw.js               오프라인 실행과 알림 표시
public/manifest.webmanifest 홈 화면 앱 정보
src/worker.js              저장 API, 15분 알림 발송기
src/push.js                웹 푸시 암호화 (외부 라이브러리 없음)
scripts/gen-vapid.mjs      알림 키 생성
```
