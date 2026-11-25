import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CATALOG,
  PROVIDERS,
  providerMeta,
  type Autonomy,
  type McpServerConfig,
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
  mcp: { servers: McpServerConfig[]; autoImported: boolean };
  /** Server-owned extraction of durable user facts after successful runs. */
  memory: { autoSave: boolean };
  /**
   * True once the onboarding wizard has been completed on this machine.
   *
   * This lives on disk rather than in the browser because the browser's
   * storage is scoped to an origin, and the origin includes the port. A
   * launch on a different port would otherwise look like a fresh install and
   * put the user back through onboarding, with all their sessions waiting
   * behind it.
   */
  onboarded: boolean;
  /** A mirror of the interface state, so it survives a change of origin. */
  ui?: Record<string, unknown>;
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
    mcp: { servers: [], autoImported: false },
    memory: { autoSave: true },
    onboarded: false,
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

  base.onboarded = Boolean(data.onboarded);
  if (data.ui && typeof data.ui === "object" && !Array.isArray(data.ui)) {
    base.ui = data.ui as Record<string, unknown>;
  }

  const mcp = data.mcp as Record<string, unknown> | undefined;
  if (mcp && typeof mcp === "object") {
    base.mcp.autoImported = Boolean(mcp.autoImported);
  }
  if (mcp && typeof mcp === "object" && Array.isArray(mcp.servers)) {
    base.mcp.servers = mcp.servers
      .map((entry): McpServerConfig | null => {
        if (!entry || typeof entry !== "object") return null;
        const raw = entry as Record<string, unknown>;
        const command = stringOrDefault(raw.command, "").trim();
        if (!command) return null;
        const id = stringOrDefault(raw.id, "").trim() || slugify(stringOrDefault(raw.name, command));
        const args = Array.isArray(raw.args)
          ? raw.args.filter((arg): arg is string => typeof arg === "string")
          : [];
        const envRaw = (raw.env ?? {}) as Record<string, unknown>;
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(envRaw)) {
          if (typeof value === "string") env[key] = value;
        }
        return {
          id,
          name: stringOrDefault(raw.name, command).trim() || command,
          command,
          args,
          env,
          enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
          ...(typeof raw.cwd === "string" && raw.cwd.trim() ? { cwd: raw.cwd } : {}),
        };
      })
      .filter((entry): entry is McpServerConfig => entry !== null);
  }
  const memory = data.memory as Record<string, unknown> | undefined;
  if (memory && typeof memory === "object" && typeof memory.autoSave === "boolean") {
    base.memory.autoSave = memory.autoSave;
  }

  return base;
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "server";

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

  setOnboarded(value: boolean): void {
    this.state.onboarded = value;
    this.save();
  }

  setUi(ui: Record<string, unknown>): void {
    this.state.ui = ui;
    this.save();
  }

  setMemory(patch: { autoSave: boolean }): void {
    this.state.memory = { autoSave: patch.autoSave };
    this.save();
  }

  /* ───────────── MCP servers ───────────── */

  mcpServers(): McpServerConfig[] {
    return this.state.mcp.servers.map((server) => ({ ...server, args: [...server.args], env: { ...server.env } }));
  }

  upsertMcpServer(server: McpServerConfig): McpServerConfig[] {
    const list = this.state.mcp.servers;
    const index = list.findIndex((entry) => entry.id === server.id);
    if (index >= 0) list[index] = server;
    else list.push(server);
    this.save();
    return this.mcpServers();
  }

  /** Add newly discovered servers without replacing any user-defined entry. */
  importMcpServers(servers: McpServerConfig[], automatic = false): number {
    if (automatic && this.state.mcp.autoImported) return 0;
    const existing = new Set(this.state.mcp.servers.map((server) => server.id));
    let added = 0;
    for (const server of servers) {
      if (existing.has(server.id)) continue;
      this.state.mcp.servers.push(server);
      existing.add(server.id);
      added++;
    }
    if (automatic) this.state.mcp.autoImported = true;
    if (added > 0 || automatic) this.save();
    return added;
  }

  removeMcpServer(id: string): void {
    this.state.mcp.servers = this.state.mcp.servers.filter((entry) => entry.id !== id);
    this.save();
  }
}
