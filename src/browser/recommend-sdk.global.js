/**
 * GA-like Recommend SDK (Browser Global Entry)
 *
 * - window.RecommendSDK 로 전역 노출 (CDN/IIFE 용)
 * - window.recommendSDKConfig 가 있으면 자동 init
 */

import RecommendSDK from "./recommend-sdk.module.js";

if (typeof window !== "undefined") {
  window.RecommendSDK = RecommendSDK;

  try {
    if (window.recommendSDKConfig) {
      window.RecommendSDK.init(window.recommendSDKConfig);
    }
  } catch (_) {}
}

