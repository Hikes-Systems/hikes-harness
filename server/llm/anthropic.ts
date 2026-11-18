import {
  failure,
  parseJson,
  sseEvents,
  trimSlash,
  type AgentMessage,
  type LLMRequest,
  type ModelEvent,
} from "./types.ts";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

interface AnthropicEvent {
  type?: string;
  index?: number;
  message?: { usage?: { input_tokens?: number } };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: { output_tokens?: number };
  error?: { message?: string };
}

function toAnthropicMessages(messages: AgentMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const block: AnthropicBlock = {
        type: "tool_result",
        tool_use_id: message.toolCallId ?? "call_unknown",
        content: message.content,
      };
      const last = out[out.length - 1];
      if (
        last &&
        last.role === "user" &&
        Array.isArray(last.content) &&
        last.content.every((b) => b.type === "tool_result")
      ) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (message.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args ?? {} });
      }
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    out.push({ role: "user", content: message.content });
  }
  return out;
}

export async function* streamAnthropic(req: LLMRequest): AsyncGenerator<ModelEvent> {
  const base = trimSlash(req.provider.baseUrl);
  const body: Record<string, unknown> = {
    model: req.model.id,
    max_tokens: 4096,
    system: req.system,
    messages: toAnthropicMessages(req.messages),
    stream: true,
  };
  if (req.model.supportsTools !== false && req.tools.length) {
    body.tools = req.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": req.provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });
  if (!res.ok) await failure(res);

  const blocks = new Map<number, { id: string; name: string; json: string }>();
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for await (const data of sseEvents(res)) {
    let event: AnthropicEvent;
    try {
      event = JSON.parse(data) as AnthropicEvent;
    } catch {
      continue;
    }
    if (event.type === "error") throw new Error(event.error?.message ?? "Anthropic stream error");
    if (event.type === "message_start") inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
    if (event.type === "message_delta") outputTokens = event.usage?.output_tokens ?? outputTokens;

    if (event.type === "content_block_start" && event.index !== undefined) {
      const block = event.content_block;
      if (block?.type === "tool_use") {
        blocks.set(event.index, {
          id: block.id ?? `call_${event.index}`,
          name: block.name ?? "",
          json: "",
        });
      }
    }

    if (event.type === "content_block_delta" && event.delta) {
      if (event.delta.type === "text_delta" && event.delta.text) {
        yield { type: "text", text: event.delta.text };
      }
      if (event.delta.type === "input_json_delta" && event.delta.partial_json !== undefined) {
        const current = event.index !== undefined ? blocks.get(event.index) : undefined;
        if (current) current.json += event.delta.partial_json;
      }
    }

    if (event.type === "content_block_stop" && event.index !== undefined) {
      const current = blocks.get(event.index);
      if (current && current.name) {
        yield {
          type: "tool_call",
          call: { id: current.id, name: current.name, args: parseJson(current.json) },
        };
        blocks.delete(event.index);
      }
    }
  }

  for (const current of blocks.values()) {
    if (current.name) {
      yield {
        type: "tool_call",
        call: { id: current.id, name: current.name, args: parseJson(current.json) },
      };
    }
  }

  if (inputTokens !== undefined || outputTokens !== undefined) {
    yield { type: "usage", inputTokens, outputTokens };
  }
  yield { type: "done" };
}
