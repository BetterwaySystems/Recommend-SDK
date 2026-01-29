/**
 * GA-like Recommend SDK (Browser Module)
 *
 * - 이벤트 수집: POST {apiUrl}/api/v1/events (단건), /api/v1/events/batch (배치)
 * - 추천 요청:  POST {apiUrl}/api/v1/recommend
 *
 * 번들러(webpack/rollup/vite 등)에서 import 해서 사용할 수 있는 모듈 형태입니다.
 * (side-effect 최소화: 자동 init/전역 주입 없음)
 */

// injected at build time by esbuild (scripts/build.mjs)
const SDK_VERSION = __SDK_VERSION__;

function nowIso() {
  return new Date().toISOString();
}

function safeGet(storage, key) {
  try {
    if (!storage) return null;
    return storage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    if (!storage) return;
    storage.setItem(key, value);
  } catch (_) {}
}

function safeRemove(storage, key) {
  try {
    if (!storage) return;
    storage.removeItem(key);
  } catch (_) {}
}

// storage keys (prefix to avoid collisions)
const STORAGE_KEYS = {
  anonymousId: "recommend_sdk_anonymous_id",
  userId: "recommend_sdk_user_id",
  sessionId: "recommend_sdk_session_id",
  deviceId: "recommend_sdk_device_id",
  appInstanceId: "recommend_sdk_app_instance_id",
};



function randomId(prefix) {
  // crypto.randomUUID가 있으면 더 충돌이 적음
  try {
    if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch (_) {}
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function parseGaClientIdFromCookie() {
  // _ga=GA1.2.1234567890.1234567890 -> client_id=1234567890.1234567890
  try {
    if (typeof document === "undefined" || !document.cookie) return null;
    const m = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
    if (!m) return null;
    const v = decodeURIComponent(m[1] || "");
    const parts = v.split(".");
    if (parts.length >= 4) return `${parts[2]}.${parts[3]}`;
    return null;
  } catch (_) {
    return null;
  }
}

function createLogger(enabled) {
  return function log(level, message, data) {
    if (!enabled && level !== "error") return;
    const prefix = "[RecommendSDK]";
    try {
      if (data !== undefined) console[level](prefix, message, data);
      else console[level](prefix, message);
    } catch (_) {}
  };
}

function normalizeApiUrl(apiUrl) {
  return String(apiUrl || "").replace(/\/$/, "");
}

// 기본 환경별 서빙 API (env 파일 불필요: init에서 env만 받아도 동작)
const DEFAULT_API_URLS = {
  development: "https://dev-ba.betterwaysys.com",
  staging: "https://staging-ba.betterwaysys.com",
  production: "https://ba.betterwaysys.com",
};

function resolveApiUrl(options) {
  if (!options) return "";
  if (options.apiUrl) return normalizeApiUrl(options.apiUrl);
  const env = options.env || "production";
  if (options.apiUrls && options.apiUrls[env]) return normalizeApiUrl(options.apiUrls[env]);
  if (DEFAULT_API_URLS[env]) return normalizeApiUrl(DEFAULT_API_URLS[env]);
  return "";
}

/**
 * RecommendSDK 싱글톤 (브라우저)
 * - 기존 CDN(IIFE)와 동일한 API를 제공
 */
const RecommendSDK = {
  version: SDK_VERSION,
  _initialized: false,
  _log: createLogger(false),
  _flushTimer: null,
  _routeHooked: false,
  _journey: [],
  _pageInstanceId: null,

  _queue: [],

  config: {
    env: "production", // development | staging | production
    apiUrl: "",
    domainId: null,
    channel: "web",
    sdkVersion: SDK_VERSION,
    appVersion: null,

    // ids
    anonymousId: null,
    userId: null,
    sessionId: null,
    clientId: null,
    deviceId: null,
    appInstanceId: null,

    // behavior
    enableLogging: false,
    // identity events
    // - identify()/logout() 시점에 즉시 이벤트를 남길지 여부
    emitIdentityEvents: true,
    autoPageView: true,
    autoRouteTracking: true,
    journeyMaxLen: 100,
    batchSize: 20,
    flushIntervalMs: 10000,
    immediateEventTypes: { action: true },
  },

  init(options) {
    if (this._initialized) {
      this._log("warn", "already initialized");
      return;
    }
    options = options || {};

    const apiUrl = resolveApiUrl(options);
    if (!apiUrl) {
      throw new Error("RecommendSDK: apiUrl (or apiUrls+env) is required");
    }

    this.config.env = options.env || this.config.env;
    this.config.apiUrl = apiUrl;
    this.config.domainId = options.domainId || null;
    this.config.channel = options.channel || this.config.channel;
    this.config.sdkVersion = options.sdkVersion || this.config.sdkVersion;
    this.config.appVersion = options.appVersion || this.config.appVersion;

    this.config.enableLogging = !!options.enableLogging;
    this._log = createLogger(this.config.enableLogging);

    if (typeof options.emitIdentityEvents === "boolean") this.config.emitIdentityEvents = options.emitIdentityEvents;
    if (typeof options.autoPageView === "boolean") this.config.autoPageView = options.autoPageView;
    if (typeof options.autoRouteTracking === "boolean") this.config.autoRouteTracking = options.autoRouteTracking;
    if (typeof options.journeyMaxLen === "number") this.config.journeyMaxLen = options.journeyMaxLen;
    if (typeof options.batchSize === "number") this.config.batchSize = options.batchSize;
    if (typeof options.flushIntervalMs === "number") this.config.flushIntervalMs = options.flushIntervalMs;

    // IDs: anonymous은 항상 생성/유지, user는 필요 시 setUser로 설정 권장
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    const ss = typeof sessionStorage !== "undefined" ? sessionStorage : null;

    let anon = options.anonymousId || safeGet(ls, STORAGE_KEYS.anonymousId);
    if (!anon) anon = randomId("anon");
    safeSet(ls, STORAGE_KEYS.anonymousId, anon);

    const userId = options.userId || safeGet(ls, STORAGE_KEYS.userId) || null;

    let sessionId = options.sessionId || safeGet(ss, STORAGE_KEYS.sessionId);
    if (!sessionId) sessionId = randomId("sess");
    safeSet(ss, STORAGE_KEYS.sessionId, sessionId);

    const clientId = options.clientId || parseGaClientIdFromCookie() || null;
    let deviceId = options.deviceId || safeGet(ls, STORAGE_KEYS.deviceId) || null;
    if (!deviceId) {
      deviceId = randomId("dev");
      safeSet(ls, STORAGE_KEYS.deviceId, deviceId);
    }

    this.config.anonymousId = anon;
    this.config.userId = userId;
    this.config.sessionId = sessionId;
    this.config.clientId = clientId;
    this.config.deviceId = deviceId;
    this.config.appInstanceId = options.appInstanceId || safeGet(ls, STORAGE_KEYS.appInstanceId) || null;
    if (this.config.appInstanceId) safeSet(ls, STORAGE_KEYS.appInstanceId, this.config.appInstanceId);

    this._pageInstanceId = randomId("page");

    this._initialized = true;

    this._startFlushTimer();
    this._setupLifecycleFlush();
    if (this.config.autoRouteTracking) this._hookRoutes();
    if (this.config.autoPageView) this.trackPageView();

    this._log("info", "initialized", {
      apiUrl: this.config.apiUrl,
      env: this.config.env,
      domainId: this.config.domainId,
      anonymousId: this.config.anonymousId,
      userId: this.config.userId,
      sessionId: this.config.sessionId,
    });
  },

  identify(params, options) {
    params = params || {};
    options = options || {};
    const prev = {
      userId: this.config.userId,
      anonymousId: this.config.anonymousId,
      sessionId: this.config.sessionId,
    };
    if (params.userId !== undefined) this.setUserId(params.userId);
    if (params.anonymousId !== undefined) this.setAnonymousId(params.anonymousId);
    if (params.sessionId !== undefined) this.setSessionId(params.sessionId);
    if (params.clientId !== undefined) this.setClientId(params.clientId);
    if (params.deviceId !== undefined) this.setDeviceId(params.deviceId);
    if (params.appInstanceId !== undefined) this.setAppInstanceId(params.appInstanceId);

    const shouldEmit = options.emitEvent !== undefined ? !!options.emitEvent : !!this.config.emitIdentityEvents;
    if (shouldEmit) {
      // userId/anonymousId가 함께 포함되도록, 갱신 후 즉시 전송
      this.trackEvent(
        "identify",
        {
          prev,
          next: {
            userId: this.config.userId,
            anonymousId: this.config.anonymousId,
            sessionId: this.config.sessionId,
          },
        },
        { immediate: true, url: options.url }
      );
    }
  },

  setUserId(userId) {
    this.config.userId = userId || null;
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    if (userId) safeSet(ls, STORAGE_KEYS.userId, String(userId));
    else safeRemove(ls, STORAGE_KEYS.userId);
  },
  setAnonymousId(anonymousId) {
    this.config.anonymousId = anonymousId || null;
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    if (anonymousId) safeSet(ls, STORAGE_KEYS.anonymousId, String(anonymousId));
    else safeRemove(ls, STORAGE_KEYS.anonymousId);
  },
  setSessionId(sessionId) {
    this.config.sessionId = sessionId || null;
    const ss = typeof sessionStorage !== "undefined" ? sessionStorage : null;
    if (sessionId) safeSet(ss, STORAGE_KEYS.sessionId, String(sessionId));
    else safeRemove(ss, STORAGE_KEYS.sessionId);
  },
  setClientId(clientId) {
    this.config.clientId = clientId || null;
  },
  setDeviceId(deviceId) {
    this.config.deviceId = deviceId || null;
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    if (deviceId) safeSet(ls, STORAGE_KEYS.deviceId, String(deviceId));
    else safeRemove(ls, STORAGE_KEYS.deviceId);
  },
  setAppInstanceId(appInstanceId) {
    this.config.appInstanceId = appInstanceId || null;
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    if (appInstanceId) safeSet(ls, STORAGE_KEYS.appInstanceId, String(appInstanceId));
    else safeRemove(ls, STORAGE_KEYS.appInstanceId);
  },

  /**
   * 로그아웃/유저 변경 처리용
   *
   * - userId는 제거 (localStorage에서도 제거)
   * - 필요 시 sessionId/anonymousId를 새로 발급
   */
  logout(options) {
    options = options || {};
    const resetSession = options.resetSession !== false; // default true
    const rotateAnonymousId = !!options.rotateAnonymousId; // default false

    const shouldEmit = options.emitEvent !== undefined ? !!options.emitEvent : !!this.config.emitIdentityEvents;
    if (shouldEmit) {
      // 로그아웃 이벤트는 "현재 userId가 살아있는 상태"에서 먼저 전송
      this.trackEvent(
        "logout",
        {
          userId: this.config.userId,
          anonymousId: this.config.anonymousId,
          sessionId: this.config.sessionId,
        },
        { immediate: true, url: options.url }
      );
    }

    this.setUserId(null);

    if (resetSession) {
      this.setSessionId(randomId("sess"));
      this._pageInstanceId = randomId("page");
    }

    if (rotateAnonymousId) {
      this.setAnonymousId(randomId("anon"));
    }
  },

  _setupLifecycleFlush() {
    if (typeof window === "undefined") return;

    const self = this;
    function flushOnHide() {
      // unload 계열은 fetch가 drop될 수 있어 sendBeacon 우선
      try {
        self.flush({ useBeacon: true });
      } catch (_) {}
    }

    window.addEventListener("pagehide", flushOnHide);
    window.addEventListener("beforeunload", flushOnHide);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) flushOnHide();
      });
    }
  },

  _hookRoutes() {
    if (this._routeHooked) return;
    if (typeof window === "undefined" || !window.history) return;

    const self = this;
    function onRoute() {
      // 새 페이지로 간주: pageInstanceId 갱신
      self._pageInstanceId = randomId("page");
      self.trackPageView();
    }

    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;

    if (typeof origPush === "function") {
      window.history.pushState = function () {
        const r = origPush.apply(this, arguments);
        try {
          onRoute();
        } catch (_) {}
        return r;
      };
    }

    if (typeof origReplace === "function") {
      window.history.replaceState = function () {
        const r = origReplace.apply(this, arguments);
        try {
          onRoute();
        } catch (_) {}
        return r;
      };
    }

    window.addEventListener("popstate", function () {
      try {
        onRoute();
      } catch (_) {}
    });

    this._routeHooked = true;
    this._log("info", "route tracking hooked");
  },

  _startFlushTimer() {
    const self = this;
    if (self._flushTimer) clearInterval(self._flushTimer);
    self._flushTimer = setInterval(function () {
      self.flush();
    }, self.config.flushIntervalMs);
  },

  _pushJourney(entry) {
    this._journey.push(entry);
    if (this._journey.length > this.config.journeyMaxLen) {
      this._journey.splice(0, this._journey.length - this.config.journeyMaxLen);
    }
  },

  _baseEvent(eventType, url, payload) {
    let referrer = null;
    let ua = null;
    try {
      referrer = typeof document !== "undefined" ? document.referrer || null : null;
    } catch (_) {}
    try {
      ua = typeof navigator !== "undefined" ? navigator.userAgent || null : null;
    } catch (_) {}

    return {
      domainId: this.config.domainId,
      anonymousId: this.config.anonymousId,
      userId: this.config.userId,
      sessionId: this.config.sessionId,
      clientId: this.config.clientId,
      deviceId: this.config.deviceId,
      appInstanceId: this.config.appInstanceId,
      requestId: randomId("req"),
      pageInstanceId: this._pageInstanceId,
      canonicalPageKey: null,
      sdkVersion: this.config.sdkVersion,
      appVersion: this.config.appVersion,
      channel: this.config.channel,
      eventType: eventType,
      url: url,
      referrer: referrer,
      userAgent: ua,
      payload: payload || {},
      timestamp: nowIso(),
    };
  },

  _withJourney(payload) {
    const p = payload || {};
    // journey는 "지금까지의 행적"을 한번에 보내기 위한 보조정보(서버는 무시해도 됨)
    p.journey = (this._journey || []).slice(-this.config.journeyMaxLen);
    return p;
  },

  trackPageView(url, payload) {
    if (!this._initialized) {
      throw new Error("RecommendSDK not initialized. Call init() first.");
    }
    const u = url || (typeof window !== "undefined" && window.location ? window.location.href : "");
    const ev = this._baseEvent("page_view", u, this._withJourney(payload));
    this._pushJourney({ ts: ev.timestamp, eventType: ev.eventType, url: ev.url });
    // page_view는 기본적으로 배치로 보냄(트래픽 절감)
    this._enqueue(ev);
  },

  trackEvent(eventType, payload, options) {
    if (!this._initialized) {
      throw new Error("RecommendSDK not initialized. Call init() first.");
    }
    options = options || {};
    const u = options.url || (typeof window !== "undefined" && window.location ? window.location.href : "");
    const ev = this._baseEvent(eventType || "event", u, this._withJourney(payload));
    this._pushJourney({ ts: ev.timestamp, eventType: ev.eventType, url: ev.url });

    const immediate =
      !!options.immediate || (this.config.immediateEventTypes && this.config.immediateEventTypes[ev.eventType]);
    if (immediate) return this._sendOne(ev);
    this._enqueue(ev);
    return null;
  },

  trackAction(actionName, payload, options) {
    options = options || {};
    const p = payload || {};
    p.actionName = actionName;
    // 액션은 즉시 전송
    return this.trackEvent("action", p, { immediate: true, url: options.url });
  },

  _enqueue(eventObj) {
    if (!this._queue) this._queue = [];
    this._queue.push(eventObj);
    if (this._queue.length >= this.config.batchSize) {
      this.flush();
    }
  },

  flush(options) {
    options = options || {};
    if (!this._queue || this._queue.length === 0) return null;

    const batch = this._queue.splice(0, this.config.batchSize);
    return this._sendBatch(batch, options);
  },

  _sendOne(eventObj) {
    const url = `${this.config.apiUrl}/api/v1/events`;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventObj),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        // 실패 시 큐로 폴백
        try {
          if (!RecommendSDK._queue) RecommendSDK._queue = [];
          RecommendSDK._queue.unshift(eventObj);
        } catch (_) {}
        RecommendSDK._log("error", "sendOne failed", { error: String(err && err.message ? err.message : err) });
        return null;
      });
  },

  _sendBatch(events, options) {
    const url = `${this.config.apiUrl}/api/v1/events/batch`;
    const body = JSON.stringify({ events: events });

    // unload 계열에서는 sendBeacon 우선
    if (options && options.useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        const ok = navigator.sendBeacon(url, blob);
        if (!ok) throw new Error("sendBeacon returned false");
        this._log("info", "batch sent via beacon", { count: events.length });
        return null;
      } catch (_) {
        // beacon 실패 시 fetch로 재시도
      }
    }

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        // 실패 시 되돌려 넣기
        try {
          if (!RecommendSDK._queue) RecommendSDK._queue = [];
          RecommendSDK._queue.unshift(...events);
        } catch (_) {}
        RecommendSDK._log("error", "sendBatch failed", { error: String(err && err.message ? err.message : err) });
        return null;
      });
  },

  recommend(params) {
    if (!this._initialized) {
      throw new Error("RecommendSDK not initialized. Call init() first.");
    }
    params = params || {};

    const url = `${this.config.apiUrl}/api/v1/recommend`;
    const pageUrl = params.url || (typeof window !== "undefined" && window.location ? window.location.href : "");

    const context = params.context && typeof params.context === "object" ? params.context : {};
    context.url = context.url || pageUrl;
    context.referrer = context.referrer || (typeof document !== "undefined" ? document.referrer || null : null);
    context.journey = (this._journey || []).slice(-this.config.journeyMaxLen);

    const req = {
      domainId: params.domainId !== undefined ? params.domainId : this.config.domainId,
      userId: params.userId !== undefined ? params.userId : this.config.userId,
      anonymousId: params.anonymousId !== undefined ? params.anonymousId : this.config.anonymousId,
      channel: params.channel || this.config.channel,
      clientId: params.clientId !== undefined ? params.clientId : this.config.clientId,
      deviceId: params.deviceId !== undefined ? params.deviceId : this.config.deviceId,
      appInstanceId: params.appInstanceId !== undefined ? params.appInstanceId : this.config.appInstanceId,
      context: context,
    };

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        RecommendSDK._log("error", "recommend failed", { error: String(err && err.message ? err.message : err) });
        return null;
      });
  },
};

export { RecommendSDK };
export default RecommendSDK;

