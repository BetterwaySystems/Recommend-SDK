# ga-like-recommend-sdk

브라우저/Node 환경에서 추천 시스템 히스토리를 전송하고(및 추천 응답을 받는) SDK입니다.


## 📚 예제 보기

```bash
cd examples
open optimized-batch.html
```

## 🌐 GitHub Pages (Public CDN처럼 쓰기)

이 레포는 GitHub Pages로 **public**하게 JS 파일을 서빙할 수 있습니다.

- **권장(캐시 안전)**: 버전 파일명 사용  
  - `https://betterwaysystems.github.io/Recommend-SDK/recommend-sdk-<version>.min.js`
- **편의(최신, 캐시 영향 가능)**:
  - `https://betterwaysystems.github.io/Recommend-SDK/recommend-sdk.min.js`

### HTML에 붙이는 예시 (권장: 버전 고정)

```html
<!-- 캐시 안전: 버전 파일명 -->
<script src="https://betterwaysystems.github.io/Recommend-SDK/recommend-sdk-1.1.0.min.js"></script>
<script>
  RecommendSDK.init({ env: "production" });
  // RecommendSDK.trackEvent("page_view");
  // RecommendSDK.trackEvent("add_to_cart", { sku: "SKU-001" });
  // RecommendSDK.trackEvent("purchase", { orderId: "ORD-123", paymentMethod: "card" });
</script>
```

### HTML에 붙이는 예시 (최신 파일명: 캐시 영향 가능)

```html
<!-- 최신 파일명: 캐시 때문에 바로 안 바뀔 수 있음 -->
<script src="https://betterwaysystems.github.io/Recommend-SDK/recommend-sdk.min.js"></script>
<script>
  RecommendSDK.init({ env: "production" });
</script>
```

### 캐시/즉시 반영에 대한 결론

- GitHub Pages는 CDN 캐시가 껴서 `recommend-sdk.min.js` 같은 **고정 파일명은 즉시 반영이 보장되지 않습니다.**
- 그래서 배포 시마다 `recommend-sdk-1.1.0.min.js`처럼 **버전 파일명으로 발행**하는 게 정석입니다(캐시 “삭제”가 아니라 “회피”).

### 자동 배포

`main`에 push되면 GitHub Actions가:
- `pnpm install` → `pnpm run build`
- `dist/browser/*`를 Pages로 업로드
- `recommend-sdk-<version>.min.js`도 함께 생성/배포

### 예제에 기본으로 들어있는 것 (공통 5가지)

모든 예제(`vanilla-js.html`, `optimized-batch.html`, `react-example.jsx`, `vue-example.vue`, `php-example.php`)에 아래 흐름이 포함되어 있습니다:

1. **초기화 init**: `RecommendSDK.init({ env })`
2. **로그인/유저 인증**: `RecommendSDK.identify({ userId })`
3. **로그아웃/인증 해제**: `RecommendSDK.logout()`
4. **구매/카드 결제 이벤트**: `RecommendSDK.trackEvent('purchase', { paymentMethod: 'card', ... })`
5. **SKU 옵션 payload 예제**: 옵션 선택마다 `select_option` 이벤트 전송 + 누적 옵션을 `add_to_cart/purchase` payload에 포함

### 예제 파일 목록
- **`vanilla-js.html`** - 순수 JavaScript (CDN/min 파일 사용)
- **`react-example.jsx`** - React 18+ (Hooks, React Router)
- **`vue-example.vue`** - Vue 3 (Composition API, Vue Router)
- **`php-example.php`** - PHP + JavaScript (세션 통합)
- **`optimized-batch.html`** - 배치 최적화 데모 (디버깅용)
- **`browser.html`** - 기본 브라우저 예제
- **`node.cjs`** - Node.js 서버 예제

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

- `trackEvent()`는 기본적으로 **큐에 쌓임** (단, `immediateEventTypes`에 등록된 타입은 즉시 전송)
- flush 트리거:
  - **`batchSize`에 도달하면 즉시 flush**
  - **`enableAutoFlush: true`일 때만 `flushIntervalMs`마다 주기적으로 flush** (기본값: `false`)
  - **SPA 페이지 이동 시 자동 flush** (`flushOnRouteChange: true`, 기본값)
  - **페이지 이탈/unload 시 자동 flush** (sendBeacon 사용)
- `trackAction()` 또는 `trackEvent(..., { immediate: true })`는 **즉시 전송**
- **자동 페이지 뷰** (`autoPageView: true` + 페이지 이동 감지)는 **즉시 전송** ⭐

### 즉시 전송되는 이벤트 타입 (기본값)

다음 이벤트들은 자동으로 즉시 전송됩니다:
- `page_view` - **페이지 뷰 (자동 페이지 이동 감지 시)** ⭐
- `action` - 일반 액션
- `add_to_cart` - 장바구니 추가
- `remove_from_cart` - 장바구니 제거
- `purchase` - 구매 완료
- `begin_checkout` - 체크아웃 시작
- `add_payment_info` - 결제 정보 추가
- `add_shipping_info` - 배송 정보 추가

**주의:** `trackPageView()`를 수동으로 호출하면 큐에 추가됩니다. 즉시 전송하려면:
```javascript
RecommendSDK.trackPageView(null, null, { immediate: true });
```

커스텀 타입 추가:
```javascript
RecommendSDK.init({
  immediateEventTypes: {
    subscribe: true,
    cancel_subscription: true,
    // 기존 기본값은 자동으로 포함됨
  }
});
```

### 창/탭을 닫으면 큐에 있던 이벤트는?

브라우저 SDK는 다음 시점에 **자동으로 `flush({ useBeacon: true })`** 호출:

1. **`pagehide`** - 페이지가 숨겨질 때 (가장 신뢰성 높음)
2. **`beforeunload`** - 페이지 언로드 직전
3. **`visibilitychange` (hidden)** - 탭 전환/백그라운드 이동

**`navigator.sendBeacon`**으로 전송하므로 페이지가 닫혀도 전송이 보장됩니다.
(sendBeacon 실패 시 fetch로 fallback, 그것도 실패하면 큐에 되돌림)

### SPA 페이지 이동 시 자동 flush

`flushOnRouteChange: true` (기본값)일 때:
- `history.pushState` 감지
- `history.replaceState` 감지  
- `popstate` 이벤트 감지

→ 페이지 이동 직전에 **큐에 있는 이벤트를 자동 전송**합니다.

끄고 싶으면:
```javascript
RecommendSDK.init({
  flushOnRouteChange: false, // 페이지 이동 시 자동 flush 비활성화
});
```

### 로그인/로그아웃 이벤트는 자동으로 보내나?

기본값으로 SDK는 `identify()` / `logout()` 호출 시 **즉시(identity) 이벤트를 1회 전송**합니다:
- `eventType: "identify"`
- `eventType: "logout"`

원치 않으면 `init`에서 끌 수 있습니다:
`RecommendSDK.init({ emitIdentityEvents: false })`

## 📌 기본 사용법 (최소 설정)

```javascript
// env만 있으면 바로 동작! (기본값 최적화 완료)
RecommendSDK.init({
  env: 'production', // development | staging | production
});
```

**기본 동작 (자동):**
- ✅ **중요 이벤트** (add_to_cart, purchase 등) → 즉시 전송
- ✅ **일반 이벤트** (옵션 선택, 스크롤 등) → 큐에 누적 (20개 or 페이지 이동 시 전송)
- ✅ **SPA 페이지 이동** → 자동 flush + page_view 전송
- ✅ **페이지 종료/이탈** → sendBeacon으로 자동 전송
- ✅ **10초마다 빈 전송 ❌** (enableAutoFlush: false 기본값)

### 커스터마이징이 필요할 때만

```javascript
RecommendSDK.init({
  env: 'production',
  
  // 선택: 커스텀 설정
  batchSize: 50, // 큐 크기 변경 (기본: 20)
  enableAutoFlush: true, // 10초마다 자동 전송 켜기 (기본: false)
  
  // 즉시 전송 이벤트 추가
  immediateEventTypes: {
    subscribe: true, // 기존 기본값에 추가
    custom_event: true,
  }
});
```

수동 flush:
```javascript
RecommendSDK.flush(); // 큐에 있는 이벤트를 즉시 전송
```

## 🚀 배포 방법

### 1. CDN 방식 (권장)
```html
<!-- 프로덕션: min 파일 사용 -->
<script src="https://cdn.example.com/recommend-sdk.min.js"></script>
<script>
  RecommendSDK.init({ env: 'production' });
</script>
```

### 2. NPM 패키지 (번들러 사용 시)
```bash
npm install ga-like-recommend-sdk
```

**React/Vue/번들러:**
```javascript
import RecommendSDK from 'ga-like-recommend-sdk';
// 또는
import RecommendSDK from 'ga-like-recommend-sdk/browser';

RecommendSDK.init({ env: 'production' });
```

### 3. 직접 호스팅
```
프로젝트에 복사:
/public/js/recommend-sdk.min.js

HTML에서 참조:
<script src="/js/recommend-sdk.min.js"></script>
```

### 배포 시 파일 선택
- ✅ **`recommend-sdk.min.js`** - 프로덕션용 (압축됨, 권장)
- ⚠️ **`recommend-sdk.js`** - 개발용 (디버깅 가능, 크기 큼)
- 📦 **`recommend-sdk.mjs`** - ESM 번들러용 (import)
- 📦 **`recommend-sdk.cjs`** - CommonJS 번들러용 (require)

---

## 브라우저 사용법

```html
<script src="./recommend-sdk.min.js"></script>
<script>
  // env만 있으면 바로 동작!
  RecommendSDK.init({ env: "production" });

  // 장바구니 추가 (즉시 전송)
  RecommendSDK.trackEvent("add_to_cart", { 
    sku: "SKU-001", 
    quantity: 1 
  });

  // 옵션 선택 (큐에 누적, 페이지 이동 시 전송)
  RecommendSDK.trackEvent("select_option", { 
    optionType: "color", 
    optionValue: "red" 
  });

  // 추천 요청
  RecommendSDK.recommend({ 
    context: { category_key: "foo" } 
  }).then(console.log);
</script>
```

**환경별 API URL (자동 연결):**
- `development` → `https://dev-ba.redprinting.net`
- `staging` → `https://stg-ba.redprinting.net`
- `production` → `https://ba.redprinting.net`

## 프레임워크별 사용법

### React
```jsx
import RecommendSDK from 'ga-like-recommend-sdk';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    RecommendSDK.init({ env: 'production' });
  }, []);

  return <button onClick={() => 
    RecommendSDK.trackEvent('purchase', { orderId: 'ORD-123' })
  }>구매하기</button>;
}
```

### Vue 3
```vue
<script setup>
import RecommendSDK from 'ga-like-recommend-sdk';
import { onMounted } from 'vue';

onMounted(() => {
  RecommendSDK.init({ env: 'production' });
});

const handlePurchase = () => {
  RecommendSDK.trackEvent('purchase', { orderId: 'ORD-123' });
};
</script>
```

### PHP
```php
<script src="/js/recommend-sdk.min.js"></script>
<script>
  RecommendSDK.init({
    env: 'production',
    userId: <?php echo json_encode($_SESSION['user_id'] ?? null); ?>,
  });
</script>
```

### 바닐라 JS
```html
<script src="/recommend-sdk.min.js"></script>
<script>
  RecommendSDK.init({ env: 'production' });
  
  document.getElementById('btn').onclick = () => {
    RecommendSDK.trackEvent('add_to_cart', { sku: 'PROD-001' });
  };
</script>
```

---

## Node.js 사용법

```js
const RecommendSDK = require("ga-like-recommend-sdk/node");

// 초기화
RecommendSDK.init({ env: "production" });

// 사용자 인증
RecommendSDK.identify({ userId: "u123" });

// 이벤트 전송
RecommendSDK.trackEvent("view_item", { sku: "PROD-001" });

// 구매 이벤트 (즉시 전송)
await RecommendSDK.trackEvent("purchase", { amount: 10000 });

// 추천 받기
const result = await RecommendSDK.recommend({ 
  context: { category: "electronics" } 
});
console.log(result);
```

