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
  mono: string;
  grad: [string, string];
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
    mono: "A",
    grad: ["#ffb08a", "#e0613f"],
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
    mono: "O",
    grad: ["#86f0c9", "#1c9a78"],
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
    mono: "G",
    grad: ["#9cc2ff", "#5a6cf0"],
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
    mono: "D",
    grad: ["#a7c4ff", "#4d6bfe"],
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
    mono: "R",
    grad: ["#d3a8ff", "#8a4fe0"],
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
    mono: "L",
    grad: ["#f6e6b8", "#b48f55"],
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
    mono: "∞",
    grad: ["#c9d3e8", "#6f7fa0"],
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
}

export const modelInfo = (
  provider: ProviderId,
  id: string,
  name: string,
  desc: string,
  supportsTools = true,
): ModelInfo => ({
  key: `${provider}:${id}`,
  provider,
  id,
  name,
  desc,
  supportsTools,
});

export const CATALOG: Record<ProviderId, ModelInfo[]> = {
  anthropic: [
    modelInfo("anthropic", "claude-opus-4-1-20250805", "Claude Opus 4.1", "Powerful, large model for complex challenges"),
    modelInfo("anthropic", "claude-sonnet-4-20250514", "Claude Sonnet 4", "Smart, efficient model for everyday use"),
    modelInfo("anthropic", "claude-3-5-haiku-latest", "Claude Haiku 3.5", "Fastest model for quick answers"),
  ],
  openai: [
    modelInfo("openai", "gpt-4.1", "GPT-4.1", "Flagship model for complex tasks"),
    modelInfo("openai", "gpt-4.1-mini", "GPT-4.1 mini", "Balanced speed and intelligence"),
    modelInfo("openai", "gpt-4o", "GPT-4o", "Fast multimodal generalist"),
  ],
  google: [
    modelInfo("google", "gemini-2.5-pro", "Gemini 2.5 Pro", "Deep reasoning with long context"),
    modelInfo("google", "gemini-2.5-flash", "Gemini 2.5 Flash", "Low-latency everyday model"),
  ],
  deepseek: [
    modelInfo("deepseek", "deepseek-chat", "DeepSeek Chat", "Strong general model with tool calling"),
    modelInfo("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", "Reasoning model — text only, no tools", false),
  ],
  openrouter: [
    modelInfo("openrouter", "anthropic/claude-sonnet-4", "Claude Sonnet 4", "via OpenRouter"),
    modelInfo("openrouter", "openai/gpt-4.1", "GPT-4.1", "via OpenRouter"),
    modelInfo("openrouter", "google/gemini-2.5-pro", "Gemini 2.5 Pro", "via OpenRouter"),
    modelInfo("openrouter", "meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B", "Open weights via OpenRouter"),
  ],
  ollama: [
    modelInfo("ollama", "llama3.2", "Llama 3.2", "Local · runs on your machine"),
    modelInfo("ollama", "qwen2.5-coder", "Qwen 2.5 Coder", "Local · tuned for code"),
  ],
  custom: [],
};

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export const PROVIDER_ID_SET = new Set<string>(PROVIDER_IDS);

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === "string" && PROVIDER_ID_SET.has(value);
