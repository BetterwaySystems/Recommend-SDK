# ga-like-recommend-sdk

브라우저/Node 환경에서 추천 시스템 히스토리를 전송하고(및 추천 응답을 받는) SDK입니다.

## 엔드포인트 계약

- 이벤트 수집(단건): `POST {apiUrl}/api/v1/events`
- 이벤트 수집(배치): `POST {apiUrl}/api/v1/events/batch`
- 추천 요청: `POST {apiUrl}/api/v1/recommend`

## 폴더 구조

- **`src/`**: 단일 소스(권장) 원본 코드 
- **`dist/`**: 빌드 산출물(권장 배포물)
- **`recommend-sdk.js`**: 브라우저 배포 파일(스크립트 태그로 로드하는 IIFE, `dist/browser/recommend-sdk.js`의 복사본)
- **`recommend-sdk.min.js`**: 브라우저 배포 파일(min)
- **`recommend-sdk-node.js`**: Node 배포 엔트리(하위 `dist/node/`로 위임하는 호환 래퍼)
- **`examples/`**: 사용 예시

## 빌드 (webpack 없이)

이 SDK는 **webpack 없이 `esbuild`로 빌드**합니다.

```bash
npm run build
```

`pnpm`을 쓰는 경우, 환경 설정에 따라 `esbuild`의 postinstall 스크립트가 차단될 수 있습니다.
그때는 아래를 실행한 뒤 다시 빌드하세요.

```bash
버전체크 package.json

pnpm approve-builds
pnpm rebuild esbuild
pnpm clean
pnpm build
```

산출물:
- `dist/browser/recommend-sdk.js` (CDN/IIFE)
- `dist/browser/recommend-sdk.min.js`
- `dist/browser/recommend-sdk.mjs` (bundler용 ESM)
- `dist/browser/recommend-sdk.cjs` (bundler용 CJS)
- `dist/node/recommend-sdk-node.js` (Node CJS)

## 유저 정보가 바뀌면(로그인/로그아웃/계정 전환)

- 로그인/유저 확정 시: `RecommendSDK.identify({ userId, anonymousId? })` 또는 `RecommendSDK.setUserId(userId)`
- 로그아웃/계정 전환 시: `RecommendSDK.logout()` (기본: `userId` 제거 + `sessionId` 새로 발급)

브라우저에서는 `userId`를 localStorage에 저장하므로, **로그아웃 시 저장값도 제거**해야 다음 이벤트가 이전 유저에 붙지 않습니다.

--- 

## 핵심 연동 가이드

### 어디서 어떤 함수를 호출해야 하나?

- **앱 시작/부트스트랩(1회)**: `RecommendSDK.init(...)`
- **로그인 성공 시**: `RecommendSDK.identify({ userId })` (또는 `setUserId`)
- **로그아웃/계정 전환 시**: `RecommendSDK.logout()`
- **사용자 행동/도메인 이벤트 발생 시**:
  - 중요한 액션(결제/구독/확정 버튼 등): `RecommendSDK.trackAction(name, payload, options?)` (**즉시 전송**)
  - 일반 이벤트(클릭/노출/스크롤 등): `RecommendSDK.trackEvent(type, payload, options?)` (**기본 배치 큐에 추가**)

### 비회원 → 회원으로 “엮이는 키”는?

일반적으로 서버는 **`anonymousId`(게스트)**로 쌓인 행동을, 로그인 시점 이후 **`userId`(회원)**에 연결(stitching)합니다.
`sessionId`는 “이번 방문/탭 흐름”을 묶기 위한 보조키입니다.

### ID들은 각각 뭘 의미하나? (브라우저 기준)

- **`userId`**: 로그인 회원 식별자(가장 강함). 앱에서 로그인 시점에 `identify/setUserId`로 설정
- **`anonymousId`**: 비회원/익명 식별자. **localStorage**에 저장(브라우저 재방문에도 유지)
- **`sessionId`**: 세션/탭 단위 식별자. **sessionStorage**에 저장(탭 닫히면 새로 발급)
- **`clientId`**: GA 쿠키(`_ga`)에서 파싱되는 값(있으면 채움)
- **`deviceId`**: 기기/브라우저 단위 식별자. localStorage에 저장(없으면 생성)
- **`appInstanceId`**: 앱(웹뷰/모바일/데스크탑 앱)처럼 쿠키가 불안정한 환경에서 “설치 인스턴스”를 나타내는 선택값

SDK는 이벤트에 위 식별자들을 함께 보내고, **최종 판단/조인은 서버가** 수행하는 구조입니다(보통 `userId` 우선).

### 배치/flush는 언제 일어나나?

- `trackEvent()`는 기본적으로 **큐에 쌓임**
- flush 트리거:
  - **`batchSize`에 도달하면 즉시 flush**
  - **`flushIntervalMs`마다 주기적으로 flush**
- `trackAction()` 또는 `trackEvent(..., { immediate: true })`는 **즉시 전송**

### 창/탭을 닫으면 큐에 있던 이벤트는?

브라우저 SDK는 `pagehide/beforeunload/visibilitychange(hidden)` 시점에
`flush({ useBeacon: true })`를 호출해서 **가능한 한 `sendBeacon`으로 전송**합니다.
전송이 실패하면 큐에 되돌려 넣는 방식(최선 노력)입니다.

### 로그인/로그아웃 이벤트는 자동으로 보내나?

기본값으로 SDK는 `identify()` / `logout()` 호출 시 **즉시(identity) 이벤트를 1회 전송**합니다:
- `eventType: "identify"`
- `eventType: "logout"`

원치 않으면 `init`에서 끌 수 있습니다:
`RecommendSDK.init({ emitIdentityEvents: false })`

## 브라우저 사용법

```html
<script src="./recommend-sdk.js"></script>
<script>
  // env만 넣으면 기본 서빙 API로 자동 연결됩니다.
  // - development: https://dev-ba.betterwaysys.com
  // - production:  https://ba.betterwaysys.com
  RecommendSDK.init({ env: "development", enableLogging: false });

  // 액션은 즉시 전송
  RecommendSDK.trackAction("click_banner", { bannerId: "A1" });

  // 추천 요청
  RecommendSDK.recommend({ context: { category_key: "foo" } }).then(console.log);
</script>
```

## Node 사용법

```js
const RecommendSDK = require("./recommend-sdk-node");

// env만 넣으면 기본 서빙 API로 자동 연결됩니다.
RecommendSDK.init({ env: "production" });
RecommendSDK.identify({ userId: "u123", anonymousId: "a123" });

// 이벤트(기본: 배치 큐)
RecommendSDK.trackEvent("page_view", { any: "payload" }, { url: "https://example.com/p/1" });

// 액션(즉시)
await RecommendSDK.trackAction("purchase", { amount: 10000 }, { url: "https://example.com/checkout" });

// 추천
const rec = await RecommendSDK.recommend({ context: { external_id: "family/code" } });
console.log(rec);
```

