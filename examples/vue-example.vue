<!--
  Vue 3 예제
  
  설치:
  npm install ga-like-recommend-sdk
  
  또는:
  import RecommendSDK from '../dist/browser/recommend-sdk.mjs'
-->

<template>
  <div>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom: 16px;">
      <button @click="login">로그인</button>
      <button @click="logout" :disabled="!userId">로그아웃</button>
      <span>userId: {{ userId || '(guest)' }}</span>
    </div>
    <h1>{{ product.name }}</h1>
    <p>가격: {{ product.price.toLocaleString() }}원</p>
    <div style="display:flex; gap:8px; margin-bottom: 12px;">
      <button @click="selectOption('color', 'black')">색상: black</button>
      <button @click="selectOption('color', 'silver')">색상: silver</button>
      <button @click="selectOption('size', 'M')">사이즈: M</button>
    </div>
    <button @click="handleAddToCart">장바구니 담기</button>
    <button @click="handlePurchase">구매하기</button>
    <button @click="handleCardPurchase">카드 결제</button>

    <div class="recommendations">
      <h2>추천 상품</h2>
      <div v-for="item in recommendations" :key="item.sku">
        {{ item.name }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router'; // Vue Router 사용 시
import RecommendSDK from 'ga-like-recommend-sdk';

const product = ref({
  sku: 'LAPTOP-001',
  name: '노트북',
  price: 1500000
});

const recommendations = ref([]);
const selectedOptions = ref([]);

// 2) 로그인 유저 인증관련
const userId = ref(null);
const login = () => {
  userId.value = 'user_' + Math.random().toString(36).slice(2, 8);
  RecommendSDK.identify({ userId: userId.value });
};

// 3) 로그아웃 로그 인증관련
const logout = () => {
  RecommendSDK.logout();
  userId.value = null;
};

// ============================================
// SDK 초기화 (main.js 또는 App.vue에서 1회)
// ============================================
onMounted(() => {
  // 1) 초기화 init
  RecommendSDK.init({ env: 'production', domainId: 'your-domain-id' });

  // 페이지 뷰 추적 (autoPageView: true 이면 자동)
  RecommendSDK.trackEvent('view_item', {
    sku: product.value.sku,
    category: 'electronics',
  });

  // 추천 받기
  fetchRecommendations();
});

// ============================================
// 이벤트 핸들러
// ============================================
const handleAddToCart = () => {
  RecommendSDK.trackEvent('add_to_cart', {
    sku: product.value.sku,
    name: product.value.name,
    price: product.value.price,
    quantity: 1,
    options: selectedOptions.value.slice(),
  });
  alert('장바구니에 추가되었습니다!');
};

const handlePurchase = () => {
  RecommendSDK.trackEvent('purchase', {
    orderId: `ORD-${Date.now()}`,
    amount: product.value.price,
    paymentMethod: 'unknown',
    items: [{ sku: product.value.sku, quantity: 1, options: selectedOptions.value.slice() }],
  });
  alert('구매가 완료되었습니다!');
};

// 4) 구매시, 카드 구입 이벤트 예제
const handleCardPurchase = () => {
  RecommendSDK.trackEvent('purchase', {
    orderId: `ORD-${Date.now()}`,
    amount: product.value.price,
    paymentMethod: 'card',
    items: [{ sku: product.value.sku, quantity: 1, options: selectedOptions.value.slice() }],
    card: { issuer: 'demo', installmentMonths: 0 },
  });
  alert('카드 결제 완료!');
};

// 5) sku 같은 option payload 추가 예제
const selectOption = (name, value) => {
  selectedOptions.value = [...selectedOptions.value, { name, value }];
  RecommendSDK.trackEvent('select_option', {
    sku: product.value.sku,
    optionName: name,
    optionValue: value,
    selectedOptions: selectedOptions.value.slice(),
  });
};

// ============================================
// 추천 받기
// ============================================
const fetchRecommendations = async () => {
  const result = await RecommendSDK.recommend({
    context: {
      category: 'electronics',
      page: 'product',
      sku: product.value.sku,
    }
  });

  if (result && result.items) {
    recommendations.value = result.items;
  }
};

// ============================================
// Vue Router 통합 (선택사항)
// ============================================
const route = useRoute();

watch(() => route.fullPath, (newPath) => {
  // autoRouteTracking: true 이면 자동으로 감지하지만,
  // Vue Router의 route 변경을 수동으로 추적하고 싶다면:
  RecommendSDK.trackPageView(window.location.href, {
    path: route.path,
    query: route.query,
  }, { immediate: true });
});
</script>

<style scoped>
.recommendations {
  margin-top: 30px;
  padding: 20px;
  border: 1px solid #ddd;
}
</style>
