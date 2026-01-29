/**
 * GA-like Recommend SDK (Node.js)
 *
 * - 이벤트 수집: POST {apiUrl}/api/v1/events (단건), /api/v1/events/batch (배치)
 * - 추천 요청:  POST {apiUrl}/api/v1/recommend
 *
 * Node 18+ (fetch 지원) 기준.
 */

// injected at build time by esbuild (scripts/build.mjs)
const SDK_VERSION = __SDK_VERSION__;

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  try {
    // node 19+ randomUUID
    const { randomUUID } = require("crypto");
    if (typeof randomUUID === "function") return `${prefix}_${randomUUID()}`;
  } catch (_) {}
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
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

function createLogger(enabled) {
  return function log(level, message, data) {
    if (!enabled && level !== "error") return;
    const prefix = "[RecommendSDK]";
    if (data !== undefined) console[level](prefix, message, data);
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
      flushIntervalMs: 10000,
      immediateEventTypes: { action: true },
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
      sessionId: this.config.sessionId,
    };
    if (params.userId !== undefined) this.config.userId = params.userId || null;
    if (params.anonymousId !== undefined) this.config.anonymousId = params.anonymousId || null;
    if (params.sessionId !== undefined) this.config.sessionId = params.sessionId || null;
    if (params.clientId !== undefined) this.config.clientId = params.clientId || null;
    if (params.deviceId !== undefined) this.config.deviceId = params.deviceId || null;
    if (params.appInstanceId !== undefined) this.config.appInstanceId = params.appInstanceId || null;

    const shouldEmit = options.emitEvent !== undefined ? !!options.emitEvent : !!this.config.emitIdentityEvents;
    if (shouldEmit) {
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
      domainId: options.domainId !== undefined ? options.domainId : this.config.domainId,
      anonymousId: options.anonymousId !== undefined ? options.anonymousId : this.config.anonymousId,
      userId: options.userId !== undefined ? options.userId : this.config.userId,
      sessionId: options.sessionId !== undefined ? options.sessionId : this.config.sessionId,
      clientId: options.clientId !== undefined ? options.clientId : this.config.clientId,
      deviceId: options.deviceId !== undefined ? options.deviceId : this.config.deviceId,
      appInstanceId: options.appInstanceId !== undefined ? options.appInstanceId : this.config.appInstanceId,
      requestId: randomId("req"),
      pageInstanceId: options.pageInstanceId || null,
      canonicalPageKey: options.canonicalPageKey || null,
      sdkVersion: this.config.sdkVersion,
      appVersion: this.config.appVersion,
      channel: options.channel || this.config.channel,
      eventType: eventType,
      url: url,
      referrer: options.referrer || null,
      userAgent: options.userAgent || null,
      payload: payload || {},
      timestamp: options.timestamp || nowIso(),
    };
  }

  trackEvent(eventType, payload, options) {
    if (!this._initialized) throw new Error("RecommendSDK not initialized. Call init() first.");
    options = options || {};
    const url = options.url || "";
    const ev = this._baseEvent(eventType || "event", url, payload, options);

    const immediate =
      !!options.immediate || (this.config.immediateEventTypes && this.config.immediateEventTypes[ev.eventType]);
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
        body: JSON.stringify(eventObj),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      // 실패 시 큐로 폴백
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
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      // 실패 시 되돌려 넣기
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
      domainId: params.domainId !== undefined ? params.domainId : this.config.domainId,
      userId: params.userId !== undefined ? params.userId : this.config.userId,
      anonymousId: params.anonymousId !== undefined ? params.anonymousId : this.config.anonymousId,
      channel: params.channel || this.config.channel,
      clientId: params.clientId !== undefined ? params.clientId : this.config.clientId,
      deviceId: params.deviceId !== undefined ? params.deviceId : this.config.deviceId,
      appInstanceId: params.appInstanceId !== undefined ? params.appInstanceId : this.config.appInstanceId,
      context: params.context && typeof params.context === "object" ? params.context : null,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
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

// singleton (backward compatible)
module.exports = new RecommendSDKNode();

