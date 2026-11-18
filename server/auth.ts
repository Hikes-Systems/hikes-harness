import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function hostnameOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return "";
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function tokenMatches(expected: string, received: string): boolean {
  const a = digest(expected);
  const b = digest(received);
  return timingSafeEqual(a, b);
}

/** Rejects requests that did not originate from this machine. */
export function loopbackOnly(): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host");
    if (host) {
      const name = hostnameOf(host);
      if (!loopback.has(name)) return c.text("Forbidden host", 403);
    }
    const origin = c.req.header("origin");
    if (origin) {
      if (origin === "null") return c.text("Forbidden origin", 403);
      const name = hostnameOf(origin);
      if (!loopback.has(name)) return c.text("Forbidden origin", 403);
    }
    await next();
  };
}

export function tokenAuth(token: string, disabled = false): MiddlewareHandler {
  return async (c, next) => {
    if (disabled) return next();
    const header = c.req.header("authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const received = bearer || c.req.header("x-hikes-token") || c.req.query("token") || "";
    if (!received || !tokenMatches(token, received)) {
      return c.json({ error: "Unauthorized. Start the harness with `hikes` and use the printed token." }, 401);
    }
    await next();
  };
}
