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
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
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
