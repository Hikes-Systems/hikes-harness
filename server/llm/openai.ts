import {
  failure,
  fetchWithRetry,
  parseJson,
  sseEvents,
  trimSlash,
  type AgentMessage,
  type LLMRequest,
  type ModelEvent,
} from "./types.ts";

interface OpenAiToolDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  error?: { message?: string };
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: OpenAiToolDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    prompt_tokens_cache_hit_tokens?: number;
  };
}

function toOpenAiMessage(message: AgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId ?? "call_unknown",
      content: message.content,
    };
  }
  if (message.role === "assistant") {
    const out: Record<string, unknown> = {
      role: "assistant",
      content: message.content || null,
    };
    if (message.toolCalls?.length) {
      out.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.args ?? {}),
        },
      }));
    }
    return out;
  }
  return { role: "user", content: message.content };
}

export async function* streamOpenAi(req: LLMRequest): AsyncGenerator<ModelEvent> {
  const base = trimSlash(req.provider.baseUrl);
  const root = req.model.provider === "ollama" ? `${base}/v1` : base;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (req.provider.apiKey) headers.authorization = `Bearer ${req.provider.apiKey}`;

  const body: Record<string, unknown> = {
    model: req.model.id,
    stream: true,
    messages: [
      { role: "system", content: req.system },
      ...req.messages.map(toOpenAiMessage),
    ],
  };

  if (req.model.supportsTools !== false && req.tools.length) {
    body.tools = req.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  // Ask for the usage counters. Most OpenAI-compatible servers support this,
  // and without it the app can only guess how much a request cost.
  body.stream_options = { include_usage: true };

  const post = (): Promise<Response> =>
    fetchWithRetry(
      `${root}/chat/completions`,
      { method: "POST", headers, body: JSON.stringify(body) },
      { signal: req.signal },
    );

  let res = await post();
  if (!res.ok && res.status === 400 && body.stream_options) {
    // A few older servers reject the unknown field outright. Retry once
    // without it rather than failing the whole run.
    delete body.stream_options;
    res = await post();
  }
  if (!res.ok) await failure(res);

  const calls = new Map<number, { id: string; name: string; args: string }>();
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cachedTokens: number | undefined;

  for await (const data of sseEvents(res)) {
    let chunk: OpenAiChunk;
    try {
      chunk = JSON.parse(data) as OpenAiChunk;
    } catch {
      continue;
    }
    if (chunk.error?.message) throw new Error(chunk.error.message);

    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) yield { type: "text", text: delta.content };

    if (Array.isArray(delta?.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = part.index ?? 0;
        const current = calls.get(index) ?? { id: part.id ?? `call_${index}`, name: "", args: "" };
        if (part.id) current.id = part.id;
        if (part.function?.name && !current.name) current.name = part.function.name;
        if (part.function?.arguments) current.args += part.function.arguments;
        calls.set(index, current);
      }
    }

    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
      outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      // OpenAI reports the cached part of the prompt here; DeepSeek uses its
      // own field name for the same number.
      const cached =
        chunk.usage.prompt_tokens_details?.cached_tokens ??
        chunk.usage.prompt_tokens_cache_hit_tokens;
      if (cached !== undefined) cachedTokens = cached;
    }
  }

  for (const call of calls.values()) {
    if (!call.name) continue;
    yield {
      type: "tool_call",
      call: { id: call.id, name: call.name, args: parseJson(call.args) },
    };
  }
  if (inputTokens !== undefined || outputTokens !== undefined) {
    yield { type: "usage", inputTokens, outputTokens, cachedTokens };
  }
  yield { type: "done" };
}
