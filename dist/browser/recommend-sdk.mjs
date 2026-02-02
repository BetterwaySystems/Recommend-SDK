// src/browser/recommend-sdk.module.js
var SDK_VERSION = "1.1.0";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
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
  } catch (_) {
  }
}
function safeRemove(storage, key) {
  try {
    if (!storage) return;
    storage.removeItem(key);
  } catch (_) {
  }
}
var STORAGE_KEYS = {
  anonymousId: "recommend_sdk_anonymous_id",
  userId: "recommend_sdk_user_id",
  sessionId: "recommend_sdk_session_id",
  deviceId: "recommend_sdk_device_id",
  appInstanceId: "recommend_sdk_app_instance_id"
};
function randomId(prefix) {
  try {
    if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch (_) {
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}
function parseGaClientIdFromCookie() {
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
      if (data !== void 0) console[level](prefix, message, data);
      else console[level](prefix, message);
    } catch (_) {
    }
  };
}
function normalizeApiUrl(apiUrl) {
  return String(apiUrl || "").replace(/\/$/, "");
}
var DEFAULT_API_URLS = {
  development: "https://dev-ba.redprinting.net",
  staging: "https://stg-ba.redprinting.net",
  production: "https://ba.redprinting.net"
};
function resolveApiUrl(options) {
  if (!options) return "";
  if (options.apiUrl) return normalizeApiUrl(options.apiUrl);
  const env = options.env || "production";
  if (options.apiUrls && options.apiUrls[env]) return normalizeApiUrl(options.apiUrls[env]);
  if (DEFAULT_API_URLS[env]) return normalizeApiUrl(DEFAULT_API_URLS[env]);
  return "";
}
var RecommendSDK = {
  version: SDK_VERSION,
  _initialized: false,
  _log: createLogger(false),
  _flushTimer: null,
  _routeHooked: false,
  _journey: [],
  _pageInstanceId: null,
  _queue: [],
  config: {
    env: "production",
    // development | staging | production
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
    flushOnRouteChange: true,
    // SPA 페이지 이동 시 자동 flush (기본: true)
    journeyMaxLen: 100,
    batchSize: 20,
    flushIntervalMs: 1e4,
    enableAutoFlush: false,
    // 주기적 자동 flush 비활성화 (페이지 이동/unload 시만 전송)
    immediateEventTypes: {
      action: true,
      add_to_cart: true,
      remove_from_cart: true,
      purchase: true,
      begin_checkout: true,
      add_payment_info: true,
      add_shipping_info: true
    }
  },
  init(options) {
    if (this._initialized) {
      this._log("warn", "already initialized");
      return;
    }
    options = options || {};
    if (this.config.apiUrl) {
      this._log("info", "apiUrl already set, preserving existing configuration", { apiUrl: this.config.apiUrl, env: this.config.env });
      this._initialized = true;
      this._startFlushTimer();
      this._setupLifecycleFlush();
      if (this.config.autoRouteTracking) this._hookRoutes();
      if (this.config.autoPageView) this.trackPageView(null, null, { immediate: true });
      return;
    }
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
    if (typeof options.flushOnRouteChange === "boolean") this.config.flushOnRouteChange = options.flushOnRouteChange;
    if (typeof options.journeyMaxLen === "number") this.config.journeyMaxLen = options.journeyMaxLen;
    if (typeof options.batchSize === "number") this.config.batchSize = options.batchSize;
    if (typeof options.flushIntervalMs === "number") this.config.flushIntervalMs = options.flushIntervalMs;
    if (typeof options.enableAutoFlush === "boolean") this.config.enableAutoFlush = options.enableAutoFlush;
    if (options.immediateEventTypes && typeof options.immediateEventTypes === "object") {
      this.config.immediateEventTypes = { ...this.config.immediateEventTypes, ...options.immediateEventTypes };
    }
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
    if (this.config.autoPageView) this.trackPageView(null, null, { immediate: true });
    this._log("info", "initialized", {
      apiUrl: this.config.apiUrl,
      env: this.config.env,
      domainId: this.config.domainId,
      anonymousId: this.config.anonymousId,
      userId: this.config.userId,
      sessionId: this.config.sessionId
    });
  },
  identify(params, options) {
    params = params || {};
    options = options || {};
    const prev = {
      userId: this.config.userId,
      anonymousId: this.config.anonymousId,
      sessionId: this.config.sessionId
    };
    if (params.userId !== void 0) this.setUserId(params.userId);
    if (params.anonymousId !== void 0) this.setAnonymousId(params.anonymousId);
    if (params.sessionId !== void 0) this.setSessionId(params.sessionId);
    if (params.clientId !== void 0) this.setClientId(params.clientId);
    if (params.deviceId !== void 0) this.setDeviceId(params.deviceId);
    if (params.appInstanceId !== void 0) this.setAppInstanceId(params.appInstanceId);
    const shouldEmit = options.emitEvent !== void 0 ? !!options.emitEvent : !!this.config.emitIdentityEvents;
    if (shouldEmit) {
      this.trackEvent(
        "identify",
        {
          prev,
          next: {
            userId: this.config.userId,
            anonymousId: this.config.anonymousId,
            sessionId: this.config.sessionId
          }
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
    const resetSession = options.resetSession !== false;
    const rotateAnonymousId = !!options.rotateAnonymousId;
    const shouldEmit = options.emitEvent !== void 0 ? !!options.emitEvent : !!this.config.emitIdentityEvents;
    if (shouldEmit) {
      this.trackEvent(
        "logout",
        {
          userId: this.config.userId,
          anonymousId: this.config.anonymousId,
          sessionId: this.config.sessionId
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
      try {
        self.flush({ useBeacon: true });
      } catch (_) {
      }
    }
    window.addEventListener("pagehide", flushOnHide);
    window.addEventListener("beforeunload", flushOnHide);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", function() {
        if (document.hidden) flushOnHide();
      });
    }
  },
  _hookRoutes() {
    if (this._routeHooked) return;
    if (typeof window === "undefined" || !window.history) return;
    const self = this;
    function onRoute() {
      self._log("info", "route change detected", { queueSize: self._queue ? self._queue.length : 0 });
      if (self.config.flushOnRouteChange && self._queue && self._queue.length > 0) {
        self._log("info", "flushing queue on route change", { count: self._queue.length });
        self.flush();
      }
      try {
        const pathname = typeof window !== "undefined" && window.location && typeof window.location.pathname === "string" ? window.location.pathname : null;
        if (pathname && pathname !== "/") {
          self._pageInstanceId = randomId("page");
          self.trackPageView(null, null, { immediate: true });
        }
      } catch (_) {
        self._pageInstanceId = randomId("page");
        self.trackPageView(null, null, { immediate: true });
      }
    }
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    if (typeof origPush === "function") {
      window.history.pushState = function() {
        const r = origPush.apply(this, arguments);
        try {
          onRoute();
        } catch (_) {
        }
        return r;
      };
    }
    if (typeof origReplace === "function") {
      window.history.replaceState = function() {
        const r = origReplace.apply(this, arguments);
        try {
          onRoute();
        } catch (_) {
        }
        return r;
      };
    }
    window.addEventListener("popstate", function() {
      try {
        onRoute();
      } catch (_) {
      }
    });
    this._routeHooked = true;
    this._log("info", "route tracking hooked", {
      pushStateHooked: typeof window.history.pushState === "function",
      replaceStateHooked: typeof window.history.replaceState === "function"
    });
  },
  _startFlushTimer() {
    const self = this;
    if (self._flushTimer) clearInterval(self._flushTimer);
    if (self.config.enableAutoFlush) {
      self._flushTimer = setInterval(function() {
        self.flush();
      }, self.config.flushIntervalMs);
    }
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
    } catch (_) {
    }
    try {
      ua = typeof navigator !== "undefined" ? navigator.userAgent || null : null;
    } catch (_) {
    }
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
      eventType,
      url,
      referrer,
      userAgent: ua,
      payload: payload || {},
      timestamp: nowIso()
    };
  },
  _withJourney(payload) {
    const p = payload || {};
    p.journey = (this._journey || []).slice(-this.config.journeyMaxLen);
    return p;
  },
  trackPageView(url, payload, options) {
    if (!this._initialized) {
      throw new Error("RecommendSDK not initialized. Call init() first.");
    }
    options = options || {};
    const u = url || (typeof window !== "undefined" && window.location ? window.location.href : "");
    const ev = this._baseEvent("page_view", u, this._withJourney(payload));
    this._pushJourney({ ts: ev.timestamp, eventType: ev.eventType, url: ev.url });
    if (options.immediate) {
      return this._sendOne(ev);
    }
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
    const immediate = !!options.immediate || this.config.immediateEventTypes && this.config.immediateEventTypes[ev.eventType];
    if (immediate) return this._sendOne(ev);
    this._enqueue(ev);
    return null;
  },
  trackAction(actionName, payload, options) {
    options = options || {};
    const p = payload || {};
    p.actionName = actionName;
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
      keepalive: true
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).catch((err) => {
      try {
        if (!RecommendSDK._queue) RecommendSDK._queue = [];
        RecommendSDK._queue.unshift(eventObj);
      } catch (_) {
      }
      RecommendSDK._log("error", "sendOne failed", { error: String(err && err.message ? err.message : err) });
      return null;
    });
  },
  _sendBatch(events, options) {
    const url = `${this.config.apiUrl}/api/v1/events/batch`;
    const body = JSON.stringify({ events });
    if (options && options.useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        const ok = navigator.sendBeacon(url, blob);
        if (!ok) throw new Error("sendBeacon returned false");
        this._log("info", "batch sent via beacon", { count: events.length });
        return null;
      } catch (_) {
      }
    }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).catch((err) => {
      try {
        if (!RecommendSDK._queue) RecommendSDK._queue = [];
        RecommendSDK._queue.unshift(...events);
      } catch (_) {
      }
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
      domainId: params.domainId !== void 0 ? params.domainId : this.config.domainId,
      userId: params.userId !== void 0 ? params.userId : this.config.userId,
      anonymousId: params.anonymousId !== void 0 ? params.anonymousId : this.config.anonymousId,
      channel: params.channel || this.config.channel,
      clientId: params.clientId !== void 0 ? params.clientId : this.config.clientId,
      deviceId: params.deviceId !== void 0 ? params.deviceId : this.config.deviceId,
      appInstanceId: params.appInstanceId !== void 0 ? params.appInstanceId : this.config.appInstanceId,
      context
    };
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).catch((err) => {
      RecommendSDK._log("error", "recommend failed", { error: String(err && err.message ? err.message : err) });
      return null;
    });
  }
};
var recommend_sdk_module_default = RecommendSDK;
export {
  RecommendSDK,
  recommend_sdk_module_default as default
};
