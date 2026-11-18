import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CATALOG,
  PROVIDERS,
  providerMeta,
  type Autonomy,
  type ModelInfo,
  type ProviderId,
  type ProviderView,
  type ToolFlags,
} from "../shared/protocol.ts";

export interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  customModel: string;
  models?: ModelInfo[];
}

export interface SearchConfig {
  tavilyKey: string;
  braveKey: string;
}

export interface HikesConfig {
  version: 1;
  workspace: string;
  defaultModel?: string;
  providers: Record<ProviderId, ProviderConfig>;
  search: SearchConfig;
  tools: ToolFlags;
  autonomy: Autonomy;
}

export const defaultDataDir = () => path.join(os.homedir(), ".hikes");

export const defaultWorkspace = () => process.cwd();

const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

function initialProvider(id: ProviderId): ProviderConfig {
  const meta = providerMeta(id);
  return {
    enabled: false,
    apiKey: "",
    baseUrl: meta.defaultBase,
    customModel: "",
  };
}

export function defaultConfig(): HikesConfig {
  const providers = Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, initialProvider(id)]),
  ) as Record<ProviderId, ProviderConfig>;
  return {
    version: 1,
    workspace: defaultWorkspace(),
    providers,
    search: { tavilyKey: "", braveKey: "" },
    tools: { web: true, code: true, files: true, memory: true },
    autonomy: "balanced",
  };
}

const stringOrDefault = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

function normalize(raw: unknown): HikesConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, unknown>;

  base.workspace = stringOrDefault(data.workspace, base.workspace);

  const providersRaw = data.providers as Record<string, unknown> | undefined;
  if (providersRaw && typeof providersRaw === "object") {
    for (const id of PROVIDER_IDS) {
      const entry = providersRaw[id] as Record<string, unknown> | undefined;
      if (!entry || typeof entry !== "object") continue;
      const p = base.providers[id];
      p.enabled = Boolean(entry.enabled);
      p.apiKey = stringOrDefault(entry.apiKey, p.apiKey);
      p.baseUrl = stringOrDefault(entry.baseUrl, p.baseUrl);
      p.customModel = stringOrDefault(entry.customModel, p.customModel);
      if (Array.isArray(entry.models)) {
        p.models = entry.models.filter(
          (m): m is ModelInfo =>
            Boolean(m) &&
            typeof m === "object" &&
            typeof (m as ModelInfo).id === "string" &&
            typeof (m as ModelInfo).key === "string" &&
            typeof (m as ModelInfo).name === "string",
        );
      }
    }
  }

  const search = data.search as Record<string, unknown> | undefined;
  if (search && typeof search === "object") {
    base.search.tavilyKey = stringOrDefault(search.tavilyKey, "");
    base.search.braveKey = stringOrDefault(search.braveKey, "");
  }

  const tools = data.tools as Record<string, unknown> | undefined;
  if (tools && typeof tools === "object") {
    base.tools = {
      web: Boolean(tools.web),
      code: Boolean(tools.code),
      files: Boolean(tools.files),
      memory: Boolean(tools.memory),
    };
  }

  if (data.autonomy === "ask" || data.autonomy === "balanced" || data.autonomy === "auto") {
    base.autonomy = data.autonomy;
  }
  if (typeof data.defaultModel === "string") base.defaultModel = data.defaultModel;
  return base;
}

export interface ConfigStoreOptions {
  dataDir?: string;
  workspace?: string;
}

const freeFirst = (id: ProviderId, models: ModelInfo[]): ModelInfo[] =>
  models
    .map((model) => {
      if (model.free) return model;
      const inferred =
        id === "openrouter" && (model.id.endsWith(":free") || model.id === "openrouter/free");
      if (!inferred) return model;
      return {
        ...model,
        free: true,
        desc: model.desc === "Available on your account" ? "Free to use" : model.desc,
      };
    })
    .sort((a, b) => Number(Boolean(b.free)) - Number(Boolean(a.free)));

const expandHome = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
};

const isDirectory = (value: string): boolean => {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
};

export class ConfigStore {
  readonly dataDir: string;
  readonly configPath: string;
  private state: HikesConfig;

  constructor(options: ConfigStoreOptions = {}) {
    this.dataDir = options.dataDir ?? defaultDataDir();
    this.configPath = path.join(this.dataDir, "config.json");
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.state = this.loadFromDisk();

    const requested = options.workspace ? path.resolve(expandHome(options.workspace)) : "";
    const stored = this.state.workspace ? path.resolve(expandHome(this.state.workspace)) : "";
    this.state.workspace = isDirectory(requested)
      ? requested
      : isDirectory(stored)
        ? stored
        : defaultWorkspace();
    this.save();
  }

  private loadFromDisk(): HikesConfig {
    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      return normalize(JSON.parse(raw));
    } catch {
      return defaultConfig();
    }
  }

  get config(): HikesConfig {
    return this.state;
  }

  get workspace(): string {
    return this.state.workspace;
  }

  provider(id: ProviderId): ProviderConfig {
    return this.state.providers[id];
  }

  save(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.configPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, this.configPath);
    try {
      fs.chmodSync(this.configPath, 0o600);
    } catch {
      /* Windows may not fully support POSIX modes. */
    }
  }

  updateProvider(
    id: ProviderId,
    patch: {
      enabled?: boolean;
      apiKey?: string;
      clearKey?: boolean;
      baseUrl?: string;
      customModel?: string;
    },
  ): void {
    const st = this.state.providers[id];
    if (typeof patch.enabled === "boolean") st.enabled = patch.enabled;
    if (patch.clearKey) {
      st.apiKey = "";
      st.models = undefined;
    }
    if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
      const next = patch.apiKey.trim();
      if (next !== st.apiKey) st.models = undefined;
      st.apiKey = next;
    }
    if (typeof patch.baseUrl === "string" && patch.baseUrl.trim()) {
      const next = patch.baseUrl.trim().replace(/\/+$/, "");
      if (next !== st.baseUrl) st.models = undefined;
      st.baseUrl = next;
    }
    if (typeof patch.customModel === "string") st.customModel = patch.customModel.trim();
    this.save();
  }

  updateSearch(patch: { tavilyKey?: string; braveKey?: string; clearTavily?: boolean; clearBrave?: boolean }): void {
    if (patch.clearTavily) this.state.search.tavilyKey = "";
    if (patch.clearBrave) this.state.search.braveKey = "";
    if (typeof patch.tavilyKey === "string" && patch.tavilyKey.trim()) {
      this.state.search.tavilyKey = patch.tavilyKey.trim();
    }
    if (typeof patch.braveKey === "string" && patch.braveKey.trim()) {
      this.state.search.braveKey = patch.braveKey.trim();
    }
    this.save();
  }

  setModels(id: ProviderId, models: ModelInfo[] | undefined): void {
    this.state.providers[id].models = models?.length ? models : undefined;
    this.save();
  }

  providerReady(id: ProviderId): boolean {
    const st = this.provider(id);
    const meta = providerMeta(id);
    if (!st.enabled) return false;
    if (id === "custom") return Boolean(st.customModel.trim() && st.baseUrl.trim());
    if (meta.needsKey && !st.apiKey.trim()) return false;
    return true;
  }

  modelsFor(id: ProviderId): ModelInfo[] {
    const st = this.provider(id);
    if (id === "custom") {
      return st.customModel.trim()
        ? [
            {
              key: `custom:${st.customModel.trim()}`,
              provider: "custom",
              id: st.customModel.trim(),
              name: st.customModel.trim(),
              desc: "Custom endpoint",
              supportsTools: true,
            },
          ]
        : [];
    }
    const list = st.models?.length ? st.models : CATALOG[id];
    return freeFirst(id, list);
  }

  availableModels(): ModelInfo[] {
    const out: ModelInfo[] = [];
    for (const p of PROVIDERS) {
      if (!this.providerReady(p.id)) continue;
      for (const m of this.modelsFor(p.id)) {
        if (!out.some((x) => x.key === m.key)) out.push(m);
      }
    }
    return out;
  }

  resolvedDefaultModel(): string | undefined {
    const models = this.availableModels();
    const wanted = this.state.defaultModel;
    if (wanted && models.some((m) => m.key === wanted)) return wanted;
    return models[0]?.key;
  }

  providerView(id: ProviderId): ProviderView {
    const st = this.provider(id);
    return {
      enabled: st.enabled,
      baseUrl: st.baseUrl,
      customModel: st.customModel,
      hasKey: Boolean(st.apiKey),
      modelCount: this.providerReady(id) ? this.modelsFor(id).length : 0,
    };
  }

  publicProviders(): Record<ProviderId, ProviderView> {
    return Object.fromEntries(
      PROVIDERS.map((p) => [p.id, this.providerView(p.id)]),
    ) as Record<ProviderId, ProviderView>;
  }

  setDefaultModel(key: string, persist = true): void {
    this.state.defaultModel = key;
    if (persist) this.save();
  }

  setTools(tools: ToolFlags): void {
    this.state.tools = { ...tools };
    this.save();
  }

  setAutonomy(autonomy: Autonomy): void {
    this.state.autonomy = autonomy;
    this.save();
  }

  setWorkspace(folder: string): void {
    const resolved = path.resolve(expandHome(folder));
    if (!isDirectory(resolved)) {
      throw new Error("That workspace folder does not exist.");
    }
    this.state.workspace = resolved;
    this.save();
  }
}
