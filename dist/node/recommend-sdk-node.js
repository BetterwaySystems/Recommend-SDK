const SDK_VERSION = "1.1.0";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function randomId(prefix) {
  try {
    const { randomUUID } = require("crypto");
    if (typeof randomUUID === "function") return `${prefix}_${randomUUID()}`;
  } catch (_) {
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}
function normalizeApiUrl(apiUrl) {
  return String(apiUrl || "").replace(/\/$/, "");
}
const DEFAULT_API_URLS = {
  development: "https://dev-ba.betterwaysys.com",
  staging: "https://staging-ba.betterwaysys.com",
  production: "https://ba.betterwaysys.com"
};
function resolveApiUrl(options) {
  if (!options) return "";
  if (options.apiUrl) return normalizeApiUrl(options.apiUrl);
  const env = options.env || "production";
  if (options.apiUrls && options.apiUrls[env]) return normalizeApiUrl(options.apiUrls[env]);
  if (DEFAULT_API_URLS[env]) return normalizeApiUrl(DEFAULT_API_URLS[env]);
  return "";
}
function createLogger(enabled) {
  return function log(level, message, data) {
    if (!enabled && level !== "error") return;
    const prefix = "[RecommendSDK]";
    if (data !== void 0) console[level](prefix, message, data);
    else console[level](prefix, message);
  };
}
class RecommendSDKNode {
  constructor() {
    this.version = SDK_VERSION;
    this._initialized = false;
    this._log = createLogger(false);
    this._flushTimer = null;
    this._queue = [];
    this.config = {
      env: "production",
      apiUrl: "",
      domainId: null,
      channel: "web",
      sdkVersion: SDK_VERSION,
      appVersion: null,
      anonymousId: null,
      userId: null,
      sessionId: null,
      clientId: null,
      deviceId: null,
      appInstanceId: null,
      enableLogging: false,
      // identity events
      // - identify()/logout() 시점에 즉시 이벤트를 남길지 여부
      emitIdentityEvents: true,
      batchSize: 50,
      flushIntervalMs: 1e4,
      immediateEventTypes: { action: true }
    };
  }
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
    if (typeof options.batchSize === "number") this.config.batchSize = options.batchSize;
    if (typeof options.flushIntervalMs === "number") this.config.flushIntervalMs = options.flushIntervalMs;
    this.config.anonymousId = options.anonymousId || this.config.anonymousId || randomId("anon");
    this.config.userId = options.userId || this.config.userId || null;
    this.config.sessionId = options.sessionId || this.config.sessionId || randomId("sess");
    this.config.clientId = options.clientId || this.config.clientId || null;
    this.config.deviceId = options.deviceId || this.config.deviceId || null;
    this.config.appInstanceId = options.appInstanceId || this.config.appInstanceId || null;
    this._initialized = true;
    this._startFlushTimer();
  }
  identify(params, options) {
    params = params || {};
    options = options || {};
    const prev = {
      userId: this.config.userId,
      anonymousId: this.config.anonymousId,
      sessionId: this.config.sessionId
    };
    if (params.userId !== void 0) this.config.userId = params.userId || null;
    if (params.anonymousId !== void 0) this.config.anonymousId = params.anonymousId || null;
    if (params.sessionId !== void 0) this.config.sessionId = params.sessionId || null;
    if (params.clientId !== void 0) this.config.clientId = params.clientId || null;
    if (params.deviceId !== void 0) this.config.deviceId = params.deviceId || null;
    if (params.appInstanceId !== void 0) this.config.appInstanceId = params.appInstanceId || null;
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
        { ...options, immediate: true, url: options.url || "" }
      );
    }
  }
  /**
   * 서버 환경에서의 로그아웃/유저 변경 처리
   * - userId 제거
   * - 필요 시 sessionId/anonymousId 회전
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
        { ...options, immediate: true, url: options.url || "" }
      );
    }
    this.config.userId = null;
    if (resetSession) {
      this.config.sessionId = randomId("sess");
    }
    if (rotateAnonymousId) {
      this.config.anonymousId = randomId("anon");
    }
  }
  _baseEvent(eventType, url, payload, options) {
    options = options || {};
    return {
      domainId: options.domainId !== void 0 ? options.domainId : this.config.domainId,
      anonymousId: options.anonymousId !== void 0 ? options.anonymousId : this.config.anonymousId,
      userId: options.userId !== void 0 ? options.userId : this.config.userId,
      sessionId: options.sessionId !== void 0 ? options.sessionId : this.config.sessionId,
      clientId: options.clientId !== void 0 ? options.clientId : this.config.clientId,
      deviceId: options.deviceId !== void 0 ? options.deviceId : this.config.deviceId,
      appInstanceId: options.appInstanceId !== void 0 ? options.appInstanceId : this.config.appInstanceId,
      requestId: randomId("req"),
      pageInstanceId: options.pageInstanceId || null,
      canonicalPageKey: options.canonicalPageKey || null,
      sdkVersion: this.config.sdkVersion,
      appVersion: this.config.appVersion,
      channel: options.channel || this.config.channel,
      eventType,
      url,
      referrer: options.referrer || null,
      userAgent: options.userAgent || null,
      payload: payload || {},
      timestamp: options.timestamp || nowIso()
    };
  }
  trackEvent(eventType, payload, options) {
    if (!this._initialized) throw new Error("RecommendSDK not initialized. Call init() first.");
    options = options || {};
    const url = options.url || "";
    const ev = this._baseEvent(eventType || "event", url, payload, options);
    const immediate = !!options.immediate || this.config.immediateEventTypes && this.config.immediateEventTypes[ev.eventType];
    if (immediate) return this._sendOne(ev);
    this._enqueue(ev);
    return null;
  }
  trackAction(actionName, payload, options) {
    options = options || {};
    const p = payload || {};
    p.actionName = actionName;
    return this.trackEvent("action", p, { ...options, immediate: true });
  }
  _enqueue(eventObj) {
    this._queue.push(eventObj);
    if (this._queue.length >= this.config.batchSize) {
      void this.flush();
    }
  }
  async flush() {
    if (this._queue.length === 0) return null;
    const batch = this._queue.splice(0, this.config.batchSize);
    return await this._sendBatch(batch);
  }
  async _sendOne(eventObj) {
    const url = `${this.config.apiUrl}/api/v1/events`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventObj)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      this._queue.unshift(eventObj);
      this._log("error", "sendOne failed", { error: String(err && err.message ? err.message : err) });
      return null;
    }
  }
  async _sendBatch(events) {
    const url = `${this.config.apiUrl}/api/v1/events/batch`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      this._queue.unshift(...events);
      this._log("error", "sendBatch failed", { error: String(err && err.message ? err.message : err) });
      return null;
    }
  }
  async recommend(params) {
    if (!this._initialized) throw new Error("RecommendSDK not initialized. Call init() first.");
    params = params || {};
    const url = `${this.config.apiUrl}/api/v1/recommend`;
    const req = {
      domainId: params.domainId !== void 0 ? params.domainId : this.config.domainId,
      userId: params.userId !== void 0 ? params.userId : this.config.userId,
      anonymousId: params.anonymousId !== void 0 ? params.anonymousId : this.config.anonymousId,
      channel: params.channel || this.config.channel,
      clientId: params.clientId !== void 0 ? params.clientId : this.config.clientId,
      deviceId: params.deviceId !== void 0 ? params.deviceId : this.config.deviceId,
      appInstanceId: params.appInstanceId !== void 0 ? params.appInstanceId : this.config.appInstanceId,
      context: params.context && typeof params.context === "object" ? params.context : null
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  _startFlushTimer() {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
  }
}
module.exports = new RecommendSDKNode();
