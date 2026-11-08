# 퀘스트로그 (PWA)

습관을 RPG 퀘스트로 관리하는 웹앱이에요. 홈 화면에 추가하면 앱처럼 열리고, 퀘스트 시각과 마감 직전에 푸시 알림이 와요.

- 화면, 저장 서버, 15분마다 도는 알림 발송기가 **Cloudflare Workers 하나**에 다 들어 있어요.
- 개인 사용량이면 **무료 플랜**으로 충분해요. 서버가 잠들지 않아서 알림이 끊기지 않아요.

## 배포 (처음 한 번, 브라우저만 있으면 돼요)

**1. KV 저장소 만들기**

[Cloudflare 대시보드](https://dash.cloudflare.com) → **Storage & databases → Workers KV → Create instance** → 이름 `questlog` → 만들어진 항목의 **ID**를 복사해서 `wrangler.toml`의 `REPLACE_WITH_KV_ID` 자리에 넣어요.

**2. 저장소 연결해서 배포**

대시보드 → **Workers & Pages → Create → Import a repository** → GitHub 연결 → `montajuu/questlog` 선택 → 설정은 그대로 두고 **Deploy**.

배포가 끝나면 `https://questlog.<내계정>.workers.dev` 주소가 나와요. 이후로는 이 저장소에 코드가 올라올 때마다 자동으로 다시 배포돼요.

알림 키는 서버가 처음 실행될 때 스스로 만들어 KV에 보관해요. 따로 설정할 비밀값은 없어요.

<details><summary>PC 터미널로 배포하려면</summary>

```bash
npm install
npx wrangler login
npx wrangler kv namespace create QUESTLOG   # 출력된 id를 wrangler.toml에
npm run deploy
```
</details>

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

`public/index.html`(화면)이나 `src/worker.js`(알림 규칙)를 고쳐서 저장소에 올리면 자동으로 다시 배포돼요. 기록은 그대로 남아요.

## 파일 구성

```
public/index.html          화면 (퀘스트, 스탯, 업적)
public/sw.js               오프라인 실행과 알림 표시
public/manifest.webmanifest 홈 화면 앱 정보
src/worker.js              저장 API, 15분 알림 발송기
src/push.js                웹 푸시 암호화 (외부 라이브러리 없음)
```
