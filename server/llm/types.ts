import type { ModelInfo } from "../../shared/protocol.ts";
import type { ProviderConfig } from "../config.ts";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
      /** Prompt tokens the provider read from its prompt cache. */
      cachedTokens?: number;
      /** Prompt tokens the provider wrote into its prompt cache. */
      cacheWriteTokens?: number;
    }
  | { type: "done" };

export interface LLMRequest {
  model: ModelInfo;
  provider: ProviderConfig;
  system: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  signal: AbortSignal;
}

export class ProviderError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export const trimSlash = (value: string) => value.replace(/\/+$/, "");

export const parseJson = (value: string): unknown => {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
};

/**
 * Statuses worth one more attempt. Rate limits and transient provider faults
 * are the common ones; a 4xx that means "your request is wrong" is not.
 */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchOptions {
  /** Time to wait for the response to start. The body may take as long as it needs. */
  timeoutMs?: number;
  /** Attempts after the first failure. */
  retries?: number;
  /** The caller's own cancellation, honoured on every attempt. */
  signal?: AbortSignal;
  /** Logging hook, so the retry can be surfaced without importing a logger. */
  onRetry?: (attempt: number, reason: string, waitMs: number) => void;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `Retry-After` is either seconds or an HTTP date; only the seconds form is used. */
function retryAfterSec(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 10) : null;
}

/**
 * fetch with a header timeout and one retry on a transient failure.
 *
 * The timeout stops as soon as the response starts, so a long stream is never
 * cut in half — only a provider that never answers is. A caller that cancels
 * the run cancels every attempt immediately and is never retried.
 */
export async function fetchWithRetry(url: string, init: RequestInit, options: FetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const attempts = (options.retries ?? 1) + 1;
  let attempt = 0;

  for (;;) {
    // A caller that already cancelled never reaches the network again.
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("aborted");
    const controller = new AbortController();
    const caller = options.signal;
    const abortFromCaller = () => controller.abort(caller?.reason);
    caller?.addEventListener("abort", abortFromCaller);

    // The timer only covers the wait for the response to begin.
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const retryable = !res.ok && RETRYABLE.has(res.status) && attempt + 1 < attempts;
      if (!retryable) return res;
      const after = retryAfterSec(res);
      const waitMs = after !== null ? after * 1000 : 500 * 2 ** attempt;
      options.onRetry?.(attempt + 1, `${res.status} ${res.statusText}`, waitMs);
      await delay(waitMs);
    } catch (error) {
      if (caller?.aborted) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt + 1 >= attempts) throw error;
      const waitMs = 400 * 2 ** attempt;
      options.onRetry?.(attempt + 1, reason, waitMs);
      await delay(waitMs);
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener("abort", abortFromCaller);
    }
    attempt += 1;
  }
}

export async function* sseEvents(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (raw: string): string | null => {
    const line = raw.replace(/\r$/, "").trim();
    if (!line.startsWith("data:")) return null;
    const data = line.slice(5).trim();
    return data && data !== "[DONE]" ? data : null;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const data = emit(raw);
      if (data) yield data;
    }
  }
  buffer += decoder.decode();
  for (const raw of buffer.split("\n")) {
    const data = emit(raw);
    if (data) yield data;
  }
}

export async function failure(res: Response): Promise<never> {
  let detail = "";
  try {
    const j = (await res.json()) as Record<string, unknown>;
    const err = j.error as Record<string, unknown> | string | undefined;
    if (err && typeof err === "object") {
      detail = String(err.message ?? err.type ?? "");
    } else if (typeof err === "string") {
      detail = err;
    } else if (typeof j.message === "string") {
      detail = j.message;
    }
  } catch {
    /* body was not JSON */
  }
  throw new ProviderError(
    `${res.status} ${res.statusText || "error"}${detail ? ` — ${detail}` : ""}`,
    res.status,
  );
}
