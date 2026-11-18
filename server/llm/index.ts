import {
  CATALOG,
  modelInfo,
  providerMeta,
  type ProviderId,
  type TestProviderResult,
} from "../../shared/protocol.ts";
import type { ProviderConfig } from "../config.ts";
import { streamAnthropic } from "./anthropic.ts";
import { streamGoogle } from "./google.ts";
import { streamOpenAi } from "./openai.ts";
import { trimSlash, type LLMRequest, type ModelEvent } from "./types.ts";

export async function* streamModel(req: LLMRequest): AsyncGenerator<ModelEvent> {
  const kind = providerMeta(req.model.provider).kind;
  if (kind === "anthropic") {
    yield* streamAnthropic(req);
    return;
  }
  if (kind === "google") {
    yield* streamGoogle(req);
    return;
  }
  yield* streamOpenAi(req);
}

async function timed(url: string, init: RequestInit, ms = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const keyRejected = (status: number): boolean => status === 401 || status === 403;

const keyError = (subject: string, status: number): string =>
  keyRejected(status) ? `Key rejected by ${subject} (${status}).` : `${subject} replied ${status}.`;

interface ModelList {
  data?: Array<{
    id: string;
    name?: string;
    display_name?: string;
    description?: string;
    architecture?: { output_modalities?: string[] };
    pricing?: { prompt?: string; completion?: string };
  }>;
  models?: Array<{ name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }>;
}

const isFreeModel = (model: { pricing?: { prompt?: string; completion?: string } }): boolean =>
  model.pricing !== undefined &&
  Number(model.pricing.prompt) === 0 &&
  Number(model.pricing.completion) === 0;

export async function testProvider(id: ProviderId, state: ProviderConfig): Promise<TestProviderResult> {
  const meta = providerMeta(id);
  const base = trimSlash(state.baseUrl || meta.defaultBase);
  try {
    if (meta.needsKey && !state.apiKey.trim()) return { ok: false, error: "Add an API key first." };

    if (id === "openrouter") {
      // /models is public on OpenRouter, so it cannot prove the key works.
      const auth = await timed(`${base}/key`, {
        headers: { authorization: `Bearer ${state.apiKey}` },
      });
      if (!auth.ok) return { ok: false, error: keyError("OpenRouter", auth.status) };
    }

    if (meta.kind === "anthropic") {
      const res = await timed(`${base}/v1/models?limit=20`, {
        headers: {
          "x-api-key": state.apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) return { ok: false, error: keyError("Anthropic", res.status) };
      const json = (await res.json()) as ModelList;
      const models = (json.data ?? []).map((m) =>
        modelInfo(id, m.id, m.display_name ?? m.id, "Available on your account"),
      );
      return { ok: true, models };
    }

    if (meta.kind === "google") {
      const res = await timed(
        `${base}/v1beta/models?pageSize=60&key=${encodeURIComponent(state.apiKey)}`,
        {},
      );
      if (!res.ok) {
        const rejected = res.status === 400 || res.status === 403;
        return {
          ok: false,
          error: rejected ? `Key rejected by Google (${res.status}).` : `Google replied ${res.status}.`,
        };
      }
      const json = (await res.json()) as ModelList;
      const models = (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) =>
          modelInfo(
            id,
            m.name.replace("models/", ""),
            m.displayName ?? m.name,
            (m.description ?? "").slice(0, 60) || "Available on your account",
          ),
        );
      return { ok: true, models: models.slice(0, 14) };
    }

    if (id === "ollama") {
      const res = await timed(`${base}/api/tags`, {});
      if (!res.ok) return { ok: false, error: `Ollama replied ${res.status}. Start it with \`ollama serve\`.` };
      const json = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (json.models ?? []).map((m) =>
        modelInfo(id, m.name, m.name, "Local · installed"),
      );
      return { ok: true, models: models.length ? models : undefined };
    }

    if (id === "custom") {
      // Any endpoint can expose /models publicly, so make it prove a real completion.
      const model = state.customModel.trim();
      if (!model) return { ok: false, error: "Add a model name first." };
      const res = await timed(
        `${base}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(state.apiKey.trim() ? { authorization: `Bearer ${state.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            stream: false,
          }),
        },
        20000,
      );
      if (!res.ok) {
        return {
          ok: false,
          error: keyRejected(res.status)
            ? `The endpoint rejected its API key (${res.status}).`
            : `The endpoint replied ${res.status}. Check the base URL and model name.`,
        };
      }
      return { ok: true, models: [modelInfo(id, model, model, "Custom endpoint")] };
    }

    const res = await timed(`${base}/models`, {
      headers: state.apiKey ? { authorization: `Bearer ${state.apiKey}` } : {},
    });
    if (!res.ok) return { ok: false, error: keyError(meta.name, res.status) };
    const json = (await res.json()) as ModelList;
    let list = json.data ?? [];
    if (id === "openai") list = list.filter((m) => /^(gpt|o\d|chatgpt)/.test(m.id));
    if (id === "openrouter") {
      // Keep chat models; free audio/image generators are not usable here.
      list = list.filter((m) => {
        const outputs = m.architecture?.output_modalities;
        return !outputs || (outputs.includes("text") && outputs.every((kind) => kind === "text"));
      });
    }
    // Free models first so they survive the cap and stay at the top of the catalog.
    list = [...list].sort((a, b) => Number(isFreeModel(b)) - Number(isFreeModel(a)));
    let models = list.slice(0, 40).map((m) => {
      const free = isFreeModel(m);
      const info = modelInfo(
        id,
        m.id,
        m.name ?? m.display_name ?? m.id,
        free ? "Free to use" : "Available on your account",
      );
      if (free) info.free = true;
      return info;
    });
    if (!models.length) models = CATALOG[id];
    return { ok: true, models: models.length ? models : undefined };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timed out."
        : "Couldn't reach the endpoint (network, DNS or offline).";
    return { ok: false, error: message };
  }
}
