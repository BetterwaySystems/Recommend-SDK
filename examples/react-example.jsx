/**
 * React 예제 (React 18+)
 * 
 * 설치:
 * npm install ga-like-recommend-sdk
 * 
 * 또는 프로젝트에 직접 복사 후:
 * import RecommendSDK from '../dist/browser/recommend-sdk.mjs'
 */

import React, { useEffect, useState } from 'react';
import RecommendSDK from 'ga-like-recommend-sdk';

// SDK 초기화 (앱 최상단에서 1회만)
// App.js 또는 _app.js 에서 실행
function initSDK() {
  RecommendSDK.init({
    env: 'production', // 필수
    domainId: 'your-domain-id', // 선택
    // 나머지는 기본값 사용 (autoRouteTracking: true 등)
  });
}

// 상품 페이지 컴포넌트
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState([]);

  useEffect(() => {
    // 페이지 뷰는 autoPageView: true 이면 자동으로 전송됨
    // 추가 데이터를 보내고 싶다면:
    RecommendSDK.trackEvent('view_item', {
      sku: productId,
      category: 'electronics',
    });
  }, [productId]);

  useEffect(() => {
    // demo product
    setProduct({
      sku: productId,
      name: '노트북',
      price: 1500000,
    });
  }, [productId]);

  const onSelectOption = (name, value) => {
    const next = [...selectedOptions, { name, value }];
    setSelectedOptions(next);

    // 5) sku 같은 option payload 추가 예제 (선택할 때마다 이벤트 + 누적 옵션)
    RecommendSDK.trackEvent('select_option', {
      sku: productId,
      optionName: name,
      optionValue: value,
      selectedOptions: next,
    });
  };

  const handleAddToCart = () => {
    // 즉시 전송 (immediateEventTypes에 등록됨)
    RecommendSDK.trackEvent('add_to_cart', {
      sku: product.sku,
      name: product.name,
      price: product.price,
      quantity: 1,
      options: selectedOptions,
    });
  };

  const handlePurchase = () => {
    // 즉시 전송
    RecommendSDK.trackEvent('purchase', {
      orderId: `ORD-${Date.now()}`,
      amount: product.price,
      paymentMethod: 'unknown',
      items: [{ sku: product.sku, quantity: 1, options: selectedOptions }],
    });
  };

  // 4) 구매시, 카드 구입 이벤트 예제
  const handleCardPurchase = () => {
    RecommendSDK.trackEvent('purchase', {
      orderId: `ORD-${Date.now()}`,
      amount: product.price,
      paymentMethod: 'card',
      items: [{ sku: product.sku, quantity: 1, options: selectedOptions }],
      card: { issuer: 'demo', installmentMonths: 0 },
    });
  };

  return (
    <div>
      <h1>{product?.name}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => onSelectOption('color', 'black')}>색상: black</button>
        <button onClick={() => onSelectOption('color', 'silver')}>색상: silver</button>
        <button onClick={() => onSelectOption('size', 'M')}>사이즈: M</button>
      </div>
      <button onClick={handleAddToCart}>장바구니 담기</button>
      <button onClick={handlePurchase}>구매하기</button>
      <button onClick={handleCardPurchase}>카드 결제</button>
    </div>
  );
}

// 추천 받기 예제
function RecommendationWidget() {
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    async function fetchRecommendations() {
      const result = await RecommendSDK.recommend({
        context: {
          category: 'electronics',
          page: 'home',
        }
      });
      
      if (result && result.items) {
        setRecommendations(result.items);
      }
    }

    fetchRecommendations();
  }, []);

  return (
    <div>
      <h2>추천 상품</h2>
      {recommendations.map(item => (
        <div key={item.sku}>{item.name}</div>
      ))}
    </div>
  );
}

// App 컴포넌트
function App() {
  const [userId, setUserId] = useState(null);
  const canLogout = !!userId;

  useEffect(() => {
    initSDK();
  }, []);

  // 2) 로그인 유저 인증관련 (identify)
  const login = () => {
    const id = 'user_' + Math.random().toString(36).slice(2, 8);
    setUserId(id);
    RecommendSDK.identify({ userId: id });
  };

  // 3) 로그아웃 로그 인증관련 (logout)
  const logout = () => {
    RecommendSDK.logout();
    setUserId(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={login}>로그인</button>
        <button onClick={logout} disabled={!canLogout}>로그아웃</button>
        <span>userId: {userId || '(guest)'}</span>
      </div>
      <ProductPage productId="LAPTOP-001" />
      <RecommendationWidget />
    </div>
  );
}

export default App;

// ============================================
// React Router v6 통합 (선택사항)
// ============================================

import { useLocation } from 'react-router-dom';

function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    // autoRouteTracking: true 이면 자동으로 감지하지만,
    // React Router의 location 변경을 수동으로 추적하고 싶다면:
    RecommendSDK.trackPageView(window.location.href, {
      path: location.pathname,
      search: location.search,
    }, { immediate: true });
  }, [location]);

  return null;
}

// _app.js 또는 App.js에 추가:
// <RouteTracker />
