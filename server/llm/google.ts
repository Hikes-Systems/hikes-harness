import {
  failure,
  sseEvents,
  trimSlash,
  type AgentMessage,
  type LLMRequest,
  type ModelEvent,
} from "./types.ts";

interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
}

interface GeminiChunk {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

function toGeminiSchema(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(src)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && typeof v === "string") {
      out.type = v.toUpperCase();
    } else if (key === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([name, schema]) => [
          name,
          toGeminiSchema(schema),
        ]),
      );
    } else if (key === "items") {
      out.items = toGeminiSchema(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function toGeminiContents(messages: AgentMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const part = {
        functionResponse: {
          name: message.toolName ?? "tool",
          response: { result: message.content },
        },
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.parts)) {
        (last.parts as unknown[]).push(part);
      } else {
        out.push({ role: "user", parts: [part] });
      }
      continue;
    }
    if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.args ?? {} } });
      }
      if (parts.length) out.push({ role: "model", parts });
      continue;
    }
    out.push({ role: "user", parts: [{ text: message.content }] });
  }
  return out;
}

export async function* streamGoogle(req: LLMRequest): AsyncGenerator<ModelEvent> {
  const base = trimSlash(req.provider.baseUrl);
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: toGeminiContents(req.messages),
    generationConfig: { maxOutputTokens: 4096 },
  };
  if (req.model.supportsTools !== false && req.tools.length) {
    body.tools = [
      {
        functionDeclarations: req.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: toGeminiSchema(tool.parameters),
        })),
      },
    ];
  }

  const url =
    `${base}/v1beta/models/${encodeURIComponent(req.model.id)}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(req.provider.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: req.signal,
  });
  if (!res.ok) await failure(res);

  let callIndex = 0;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for await (const data of sseEvents(res)) {
    let chunk: GeminiChunk;
    try {
      chunk = JSON.parse(data) as GeminiChunk;
    } catch {
      continue;
    }
    if (chunk.error?.message) throw new Error(chunk.error.message);
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text) {
        yield { type: "text", text: part.text };
      }
      if (part.functionCall?.name) {
        yield {
          type: "tool_call",
          call: {
            id: `gemini_call_${Date.now().toString(36)}_${callIndex++}`,
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
          },
        };
      }
    }
    if (chunk.usageMetadata) {
      inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
      outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
    }
  }

  if (inputTokens !== undefined || outputTokens !== undefined) {
    yield { type: "usage", inputTokens, outputTokens };
  }
  yield { type: "done" };
}
