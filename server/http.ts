import type { MiddlewareHandler } from "hono";

/**
 * Headers and guards that every response carries.
 *
 * The UI is a single-file build: the script and the stylesheet are inlined,
 * so the policy has to allow inline code. Everything else is locked down —
 * no plugins, no framing, no form posts, no navigation to a foreign base —
 * and the font CDN is the only third party that may send bytes.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline'",
  // The dev server (Vite) and the API are separate loopback ports, and Vite
  // speaks WebSocket for hot reload.
  "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
].join("; ");

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const headers = c.res.headers;
    // Never overwrite a more specific policy a route set itself.
    if (!headers.has("content-security-policy")) headers.set("content-security-policy", CSP);
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
    headers.set("cross-origin-opener-policy", "same-origin");
    if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  };
}

/**
 * Reject oversized bodies before the route reads them.
 *
 * `content-length` is always present for a request this app makes, so the
 * guard costs nothing and stops a single request from filling memory.
 */
export function bodyLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "GET" || method === "HEAD") return next();
    const declared = Number(c.req.header("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      return c.json({ error: `Request body is too large. The limit is ${maxBytes} bytes.` }, 413);
    }
    await next();
  };
}

export interface RateRule {
  /** Requests allowed inside one window. */
  max: number;
  windowMs: number;
}

export type RateRules = Record<string, RateRule>;

interface Window {
  hits: number;
  startedAt: number;
}

/**
 * A fixed-window request limiter.
 *
 * This is a single-user local server, so the limiter exists to stop a loop —
 * a stuck client, a runaway sub-agent, a script that spams the run endpoint —
 * from spending money or wedging the process, not to meter real users.
 */
export class RateLimiter {
  private windows = new Map<string, Window>();
  private rules: RateRules;

  constructor(rules: RateRules) {
    this.rules = rules;
  }

  /** True when the request is inside its window; also reports the wait otherwise. */
  allow(rule: string, key = "local"): { ok: boolean; retryAfterSec: number } {
    const config = this.rules[rule];
    if (!config) return { ok: true, retryAfterSec: 0 };
    const id = `${rule}:${key}`;
    const now = Date.now();
    const window = this.windows.get(id);
    if (!window || now - window.startedAt >= config.windowMs) {
      this.windows.set(id, { hits: 1, startedAt: now });
      return { ok: true, retryAfterSec: 0 };
    }
    window.hits += 1;
    if (window.hits <= config.max) return { ok: true, retryAfterSec: 0 };
    return { ok: false, retryAfterSec: Math.ceil((window.startedAt + config.windowMs - now) / 1000) };
  }

  /** Drop windows that have expired, so the map cannot grow without bound. */
  sweep(): void {
    const now = Date.now();
    for (const [id, window] of this.windows) {
      const rule = id.slice(0, id.indexOf(":"));
      const config = this.rules[rule];
      if (config && now - window.startedAt >= config.windowMs) this.windows.delete(id);
    }
  }
}

export interface RateLimitOptions {
  rules: RateRules;
  /** Which rule applies to this request, or null to skip it. */
  classify: (path: string, method: string) => string | null;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const limiter = new RateLimiter(options.rules);
  // Requests are per-session, so one key is enough.
  const key = "client";
  const sweep = setInterval(() => limiter.sweep(), 60_000);
  sweep.unref?.();
  return async (c, next) => {
    const rule = options.classify(c.req.path, c.req.method);
    if (rule) {
      const verdict = limiter.allow(rule, key);
      if (!verdict.ok) {
        c.res.headers.set("retry-after", String(verdict.retryAfterSec));
        return c.json(
          { error: "Too many requests. Wait a moment and try again." },
          429,
        );
      }
    }
    await next();
  };
}