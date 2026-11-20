export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "openrouter"
  | "ollama"
  | "custom";

export type ProviderKind = "anthropic" | "openai" | "google";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  tagline: string;
  kind: ProviderKind;
  needsKey: boolean;
  defaultBase: string;
  editableBase: boolean;
  keyHint: string;
  docs: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    tagline: "Claude models — deep reasoning & careful writing",
    kind: "anthropic",
    needsKey: true,
    defaultBase: "https://api.anthropic.com",
    editableBase: false,
    keyHint: "sk-ant-…",
    docs: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline: "GPT family — versatile, fast, tool-savvy",
    kind: "openai",
    needsKey: true,
    defaultBase: "https://api.openai.com/v1",
    editableBase: false,
    keyHint: "sk-…",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    name: "Google Gemini",
    tagline: "Gemini — huge context, multimodal",
    kind: "google",
    needsKey: true,
    defaultBase: "https://generativelanguage.googleapis.com",
    editableBase: false,
    keyHint: "AIza…",
    docs: "https://aistudio.google.com/apikey",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    tagline: "DeepSeek Chat — strong tools at low cost",
    kind: "openai",
    needsKey: true,
    defaultBase: "https://api.deepseek.com",
    editableBase: false,
    keyHint: "sk-…",
    docs: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "One key, hundreds of models",
    kind: "openai",
    needsKey: true,
    defaultBase: "https://openrouter.ai/api/v1",
    editableBase: false,
    keyHint: "sk-or-…",
    docs: "https://openrouter.ai/keys",
  },
  {
    id: "ollama",
    name: "Ollama",
    tagline: "Run open models locally — private & free",
    kind: "openai",
    needsKey: false,
    defaultBase: "http://localhost:11434",
    editableBase: true,
    keyHint: "no key needed",
    docs: "https://ollama.com/download",
  },
  {
    id: "custom",
    name: "Custom endpoint",
    tagline: "Any OpenAI-compatible API (LM Studio, vLLM…)",
    kind: "openai",
    needsKey: false,
    defaultBase: "http://localhost:1234/v1",
    editableBase: true,
    keyHint: "optional",
    docs: "https://platform.openai.com/docs/api-reference",
  },
];

export const providerMeta = (id: ProviderId): ProviderMeta =>
  PROVIDERS.find((p) => p.id === id)!;

export interface ModelInfo {
  /** provider:id */
  key: string;
  provider: ProviderId;
  id: string;
  name: string;
  desc: string;
  /** Some models (e.g. deepseek-reasoner) cannot call tools. */
  supportsTools?: boolean;
  /** No charge for input or output. */
  free?: boolean;
  /** Context window in tokens. Used for compaction thresholds. */
  contextWindow?: number;
  /** USD per million input tokens. */
  inputPrice?: number;
  /** USD per million output tokens. */
  outputPrice?: number;
}

export interface ModelPricing {
  contextWindow?: number;
  inputPrice?: number;
  outputPrice?: number;
}

export const modelInfo = (
  provider: ProviderId,
  id: string,
  name: string,
  desc: string,
  supportsTools = true,
  pricing: ModelPricing = {},
): ModelInfo => ({
  key: `${provider}:${id}`,
  provider,
  id,
  name,
  desc,
  supportsTools,
  ...pricing,
});

export const CATALOG: Record<ProviderId, ModelInfo[]> = {
  anthropic: [
    modelInfo("anthropic", "claude-opus-4-1-20250805", "Claude Opus 4.1", "Powerful, large model for complex challenges", true, { contextWindow: 200_000, inputPrice: 15, outputPrice: 75 }),
    modelInfo("anthropic", "claude-sonnet-4-20250514", "Claude Sonnet 4", "Smart, efficient model for everyday use", true, { contextWindow: 200_000, inputPrice: 3, outputPrice: 15 }),
    modelInfo("anthropic", "claude-3-5-haiku-latest", "Claude Haiku 3.5", "Fastest model for quick answers", true, { contextWindow: 200_000, inputPrice: 0.8, outputPrice: 4 }),
  ],
  openai: [
    modelInfo("openai", "gpt-4.1", "GPT-4.1", "Flagship model for complex tasks", true, { contextWindow: 1_047_576, inputPrice: 2, outputPrice: 8 }),
    modelInfo("openai", "gpt-4.1-mini", "GPT-4.1 mini", "Balanced speed and intelligence", true, { contextWindow: 1_047_576, inputPrice: 0.4, outputPrice: 1.6 }),
    modelInfo("openai", "gpt-4o", "GPT-4o", "Fast multimodal generalist", true, { contextWindow: 128_000, inputPrice: 2.5, outputPrice: 10 }),
  ],
  google: [
    modelInfo("google", "gemini-2.5-pro", "Gemini 2.5 Pro", "Deep reasoning with long context", true, { contextWindow: 1_048_576, inputPrice: 1.25, outputPrice: 10 }),
    modelInfo("google", "gemini-2.5-flash", "Gemini 2.5 Flash", "Low-latency everyday model", true, { contextWindow: 1_048_576, inputPrice: 0.3, outputPrice: 2.5 }),
  ],
  deepseek: [
    modelInfo("deepseek", "deepseek-chat", "DeepSeek Chat", "Strong general model with tool calling", true, { contextWindow: 128_000, inputPrice: 0.27, outputPrice: 1.1 }),
    modelInfo("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", "Reasoning model — text only, no tools", false, { contextWindow: 128_000, inputPrice: 0.55, outputPrice: 2.19 }),
  ],
  openrouter: [
    modelInfo("openrouter", "anthropic/claude-sonnet-4", "Claude Sonnet 4", "via OpenRouter", true, { contextWindow: 200_000, inputPrice: 3, outputPrice: 15 }),
    modelInfo("openrouter", "openai/gpt-4.1", "GPT-4.1", "via OpenRouter", true, { contextWindow: 1_047_576, inputPrice: 2, outputPrice: 8 }),
    modelInfo("openrouter", "google/gemini-2.5-pro", "Gemini 2.5 Pro", "via OpenRouter", true, { contextWindow: 1_048_576, inputPrice: 1.25, outputPrice: 10 }),
    modelInfo("openrouter", "meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B", "Open weights via OpenRouter", true, { contextWindow: 128_000 }),
  ],
  ollama: [
    modelInfo("ollama", "llama3.2", "Llama 3.2", "Local · runs on your machine", true, { contextWindow: 131_072, inputPrice: 0, outputPrice: 0 }),
    modelInfo("ollama", "qwen2.5-coder", "Qwen 2.5 Coder", "Local · tuned for code", true, { contextWindow: 32_768, inputPrice: 0, outputPrice: 0 }),
  ],
  custom: [],
};

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export const PROVIDER_ID_SET = new Set<string>(PROVIDER_IDS);

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === "string" && PROVIDER_ID_SET.has(value);
