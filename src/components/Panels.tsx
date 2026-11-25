import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  Keyboard,
  Link2,
  Moon,
  RefreshCw,
  Search,
  SearchCheck,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { Button, Chip, Field, Segmented, Spinner, TextInput, Toggle } from "./ui";
import {
  deleteMcpServer,
  deleteMemory,
  discoverMcpServers,
  listMemory,
  listMcpServers,
  saveMcpServer,
  testMcpServer,
  type MemoryEntry,
} from "../lib/api";
import { useServer } from "../lib/server";
import { useStore, type Autonomy, type SessionNav, type Tone } from "../store";
import { PALETTES, type PaletteInfo } from "../lib/palettes";
import { PROVIDERS, providerMeta, type ProviderId } from "@shared/providers";
import { ProviderLogo } from "./ProviderLogo";
import type { McpServerStatus } from "../lib/types";
import { cn } from "../utils/cn";

const ROLES = ["Developer", "Designer", "Researcher", "Founder", "Writer", "Student", "Analyst", "Something else"];
const GOALS = ["Coding & debugging", "Research & analysis", "Writing & editing", "Planning & ops", "Learning new things", "Data work", "Automation"];
const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: "concise", label: "Concise", hint: "Short, direct answers." },
  { id: "balanced", label: "Balanced", hint: "Clear answers with just enough context." },
  { id: "thorough", label: "Thorough", hint: "Deep dives with reasoning and examples." },
];

export function ProfilePanel({ autoFocus }: { autoFocus?: boolean }) {
  const { state, setProfile } = useStore();
  const p = state.profile;
  return (
    <div className="space-y-6">
      <Field label="Your name">
        <TextInput autoFocus={autoFocus} icon={<User className="h-4 w-4" />} value={p.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder="What should I call you?" maxLength={32} />
      </Field>
      <Field label="What do you do?">
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <Chip key={r} active={p.role === r} onClick={() => setProfile({ role: p.role === r ? "" : r })}>{r}</Chip>
          ))}
        </div>
      </Field>
      <Field label="What will we work on?" hint="Pick any">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip key={g} active={p.goals.includes(g)} onClick={() => setProfile({ goals: p.goals.includes(g) ? p.goals.filter((x) => x !== g) : [...p.goals, g] })}>{g}</Chip>
          ))}
        </div>
      </Field>
      <Field label="Response style">
        <Segmented value={p.tone} options={TONES.map((t) => ({ id: t.id, label: t.label }))} onChange={(tone) => setProfile({ tone })} />
        <p className="mt-2 px-1 text-[12.5px] t-muted">{TONES.find((t) => t.id === p.tone)?.hint}</p>
      </Field>
    </div>
  );
}

export function GeneralPanel({ autoFocus }: { autoFocus?: boolean }) {
  const { state, set } = useStore();
  return (
    <div className="space-y-7">
      <ProfilePanel autoFocus={autoFocus} />
      <div className="h-px bg-[var(--line)]" />
      <Field label="Default answer mode" hint="Used for every new message">
        <div className="flex items-center gap-3 rounded-[4px] border border-[var(--line)] bg-surface2 px-3.5 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-surface">
            <SearchCheck className="h-4 w-4 t-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium t-ink">Deep research first</div>
            <div className="text-[11.5px] leading-relaxed t-muted">
              Gathers and reads sources in stages before writing the answer. Slower, but grounded.
            </div>
          </div>
          <Toggle
            on={state.researchMode}
            onChange={(value) => set({ researchMode: value })}
            label="Deep research by default"
          />
        </div>
      </Field>
      <p className="px-1 text-[11.5px] leading-relaxed t-faint">
        Your name, role, goals and response style travel with each run so the agent can adapt. Nothing here leaves this machine except the request to your chosen model provider.
      </p>
    </div>
  );
}

interface Draft {
  apiKey: string;
  baseUrl: string;
  customModel: string;
}

interface TestStatus {
  state: "idle" | "testing" | "ok" | "error";
  message?: string;
}

function blankDrafts(baseUrls: Partial<Record<ProviderId, string>> = {}, customModels: Partial<Record<ProviderId, string>> = {}): Record<ProviderId, Draft> {
  return Object.fromEntries(
    PROVIDERS.map((p) => [
      p.id,
      {
        apiKey: "",
        baseUrl: baseUrls[p.id] || p.defaultBase,
        customModel: customModels[p.id] || "",
      },
    ]),
  ) as Record<ProviderId, Draft>;
}

export function ProvidersPanel() {
  const { boot, testProvider, saveProvider, saveSettings } = useServer();
  const [focus, setFocus] = useState<ProviderId>("anthropic");
  const [drafts, setDrafts] = useState<Record<ProviderId, Draft>>(() =>
    blankDrafts(
      Object.fromEntries(PROVIDERS.map((p) => [p.id, boot?.providers[p.id]?.baseUrl])),
      Object.fromEntries(PROVIDERS.map((p) => [p.id, boot?.providers[p.id]?.customModel])),
    ),
  );
  const [statuses, setStatuses] = useState<Partial<Record<ProviderId, TestStatus>>>({});
  const [searchDraft, setSearchDraft] = useState({ tavily: "", brave: "" });
  const [searchStatus, setSearchStatus] = useState<TestStatus>({ state: "idle" });

  const meta = providerMeta(focus);
  const view = boot?.providers[focus];
  const draft = drafts[focus];
  const status = statuses[focus] ?? { state: "idle" };

  const patchDraft = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [focus]: { ...prev[focus], ...patch } }));
  const setStatus = (next: TestStatus) => setStatuses((prev) => ({ ...prev, [focus]: next }));

  const toggle = async (enabled: boolean) => {
    setStatus({ state: "idle" });
    try {
      await saveProvider(focus, { enabled });
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const test = async () => {
    setStatus({ state: "testing" });
    try {
      const result = await testProvider(focus, {
        apiKey: draft.apiKey.trim() || undefined,
        baseUrl: draft.baseUrl.trim() || undefined,
        customModel: focus === "custom" ? draft.customModel.trim() : undefined,
      });
      if (result.ok) {
        patchDraft({ apiKey: "" });
        const count = result.models?.length ?? 0;
        const freeCount = result.models?.filter((m) => m.free).length ?? 0;
        setStatus({
          state: "ok",
          message: `Connected${count ? ` · ${count} models${freeCount ? ` · ${freeCount} free` : ""}` : ""}`,
        });
      } else {
        setStatus({ state: "error", message: result.error ?? "Could not connect." });
      }
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const clearKey = async () => {
    try {
      await saveProvider(focus, { clearKey: true });
      patchDraft({ apiKey: "" });
      setStatus({ state: "idle" });
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const saveSearch = async (clear?: "tavily" | "brave") => {
    setSearchStatus({ state: "testing" });
    try {
      await saveSettings({
        search: {
          tavilyKey: searchDraft.tavily.trim() || undefined,
          braveKey: searchDraft.brave.trim() || undefined,
          clearTavily: clear === "tavily" || undefined,
          clearBrave: clear === "brave" || undefined,
        },
      });
      setSearchDraft({ tavily: "", brave: "" });
      setSearchStatus({ state: "ok", message: "Search keys saved" });
    } catch (error) {
      setSearchStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const providerState = (id: ProviderId) => {
    const v = boot?.providers[id];
    if (!v?.enabled) return "Not set up";
    if (v.modelCount > 0) return "Connected";
    if (providerMeta(id).needsKey && !v.hasKey) return "Needs a key";
    return "Enabled";
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-[204px_1fr]">
        <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {PROVIDERS.map((p) => {
            const v = boot?.providers[p.id];
            const on = focus === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setFocus(p.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-[4px] border px-2.5 py-2 text-left outline-none transition-colors",
                  on
                    ? "border-[var(--line-strong)] bg-surface shadow-[var(--shadow-sm)]"
                    : "border-transparent hover-s2",
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-black/5 bg-white shadow-[var(--shadow-sm)]">
                  <ProviderLogo id={p.id} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium t-ink">{p.name}</span>
                  <span className="block text-[10.5px] t-faint">{providerState(p.id)}</span>
                </span>
                {v?.enabled && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: v.modelCount > 0 ? "var(--ok)" : "var(--accent)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div key={focus} className="a-fade rounded-[6px] border border-[var(--line)] bg-surface p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[17px] font-semibold leading-tight t-ink">{meta.name}</h3>
              <p className="mt-0.5 text-[12px] t-muted">{meta.tagline}</p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] t-muted">Enable</span>
              <Toggle on={Boolean(view?.enabled)} onChange={(v) => void toggle(v)} label={`Enable ${meta.name}`} />
            </div>
          </div>

          <div className="space-y-4">
            {meta.needsKey || focus === "custom" ? (
              <Field
                label={focus === "custom" ? "API key (optional)" : "API key"}
                hint={<a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={meta.docs} target="_blank" rel="noreferrer">Get one <ExternalLink className="h-3 w-3" /></a>}
              >
                <TextInput
                  secret
                  icon={<KeyRound className="h-4 w-4" />}
                  value={draft.apiKey}
                  placeholder={view?.hasKey ? "Saved — type a new key to replace it" : meta.keyHint}
                  onChange={(e) => patchDraft({ apiKey: e.target.value })}
                />
              </Field>
            ) : null}
            {meta.editableBase && (
              <Field label="Base URL">
                <TextInput icon={<Link2 className="h-4 w-4" />} value={draft.baseUrl} onChange={(e) => patchDraft({ baseUrl: e.target.value })} placeholder={meta.defaultBase} />
              </Field>
            )}
            {focus === "custom" && (
              <Field label="Model name">
                <TextInput value={draft.customModel} onChange={(e) => patchDraft({ customModel: e.target.value })} placeholder="e.g. qwen2.5-32b-instruct" />
              </Field>
            )}
            {focus === "ollama" && (
              <p className="px-1 text-[11.5px] leading-relaxed t-muted">
                Hikes talks to Ollama from the local server, so no CORS setup is needed. Pull a model first, for example{" "}
                <code className="rounded border border-[var(--line)] bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[10.5px] t-ink2">ollama pull llama3.2</code>.
              </p>
            )}
            {focus === "custom" && (
              <p className="px-1 text-[11.5px] leading-relaxed t-muted">
                Works with LM Studio, vLLM, llama.cpp and anything else exposing an OpenAI-compatible{" "}
                <code className="rounded border border-[var(--line)] bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[10.5px] t-ink2">/chat/completions</code> route.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
              <Button onClick={() => void test()} disabled={status.state === "testing"}>
                {status.state === "testing" ? <Spinner /> : <Zap className="h-4 w-4" />} Test &amp; save
              </Button>
              {view?.hasKey && (
                <Button variant="ghost" size="sm" onClick={() => void clearKey()}>
                  Remove key
                </Button>
              )}
              {status.state === "ok" && (
                <span className="a-pop flex items-center gap-1.5 text-[12px] t-ok"><CheckCircle2 className="h-3.5 w-3.5" /> {status.message}</span>
              )}
              {status.state === "error" && (
                <span className="a-pop flex items-start gap-1.5 text-[12px] t-warn"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {status.message}</span>
              )}
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-3.5 text-[11.5px] leading-relaxed t-faint">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 t-ok" />
            <span>
              Keys are stored on this machine in{" "}
              <span className="font-mono t-muted">~/.hikes/config.json</span> and never sent to the browser. Requests go straight from the local server to the provider.
            </span>
          </p>
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--line)] bg-surface p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-tight t-ink">
            <SearchCheck className="h-4 w-4 t-accent" /> Web search
          </h3>
          <div className="flex gap-1.5 text-[10.5px]">
            {boot?.search.tavily && <span className="rounded border border-[var(--line)] bg-ok-soft px-1.5 py-0.5 t-ok">Tavily saved</span>}
            {boot?.search.brave && <span className="rounded border border-[var(--line)] bg-ok-soft px-1.5 py-0.5 t-ok">Brave saved</span>}
          </div>
        </div>
        <p className="mb-4 text-[11.5px] leading-relaxed t-muted">
          Search works out of the box through DuckDuckGo. Add a Tavily or Brave key for more reliable results and fewer rate limits.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tavily API key" hint={<a className="underline-offset-2 hover:underline" href="https://app.tavily.com/home" target="_blank" rel="noreferrer">tavily.com</a>}>
            <TextInput secret icon={<KeyRound className="h-4 w-4" />} value={searchDraft.tavily} onChange={(e) => setSearchDraft((s) => ({ ...s, tavily: e.target.value }))} placeholder={boot?.search.tavily ? "Saved — type to replace" : "tvly-…"} />
          </Field>
          <Field label="Brave Search API key" hint={<a className="underline-offset-2 hover:underline" href="https://api.search.brave.com/app/keys" target="_blank" rel="noreferrer">brave.com</a>}>
            <TextInput secret icon={<KeyRound className="h-4 w-4" />} value={searchDraft.brave} onChange={(e) => setSearchDraft((s) => ({ ...s, brave: e.target.value }))} placeholder={boot?.search.brave ? "Saved — type to replace" : "Brave subscription token"} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Button size="sm" onClick={() => void saveSearch()}>{searchStatus.state === "testing" ? <Spinner /> : <SearchCheck className="h-4 w-4" />} Save search keys</Button>
          {boot?.search.tavily && <Button variant="ghost" size="sm" onClick={() => void saveSearch("tavily")}>Remove Tavily</Button>}
          {boot?.search.brave && <Button variant="ghost" size="sm" onClick={() => void saveSearch("brave")}>Remove Brave</Button>}
          {searchStatus.state === "ok" && <span className="text-[12px] t-ok">{searchStatus.message}</span>}
          {searchStatus.state === "error" && <span className="text-[12px] t-warn">{searchStatus.message}</span>}
        </div>
      </div>
    </div>
  );
}

const TOOLS = [
  { id: "web", icon: Globe, name: "Web search & pages", desc: "Search the web and read public pages" },
  { id: "code", icon: Terminal, name: "Shell & code", desc: "Run commands in the workspace (approval-gated)" },
  { id: "files", icon: FileText, name: "Workspace files", desc: "Read, write and search files in the workspace" },
  { id: "memory", icon: Brain, name: "Memory", desc: "Remember durable facts across sessions" },
] as const;

const AUTONOMY: { id: Autonomy; label: string; hint: string }[] = [
  { id: "ask", label: "Ask first", hint: "Approves every tool call before it runs." },
  { id: "balanced", label: "Balanced", hint: "Safe reads run automatically; writes and commands ask first." },
  { id: "auto", label: "Autonomous", hint: "Tools run automatically. Clearly destructive commands still ask." },
];

function InfoRow({ icon: Icon, label, value, mono = true }: { icon: typeof User; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[4px] border border-[var(--line)] bg-surface2 px-3 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 t-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] t-faint">{label}</div>
        <div className={cn("mt-0.5 break-all text-[11.5px] t-ink2", mono && "font-mono")}>{value}</div>
      </div>
    </div>
  );
}

export function AgentPanel() {
  const { boot, saveSettings } = useServer();
  const { state, set, setTools } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState(boot?.workspace ?? "");
  const [workspaceState, setWorkspaceState] = useState<"idle" | "saving" | "ok">("idle");
  const models = boot?.models ?? [];
  const current = models.some((m) => m.key === state.defaultModel)
    ? state.defaultModel
    : boot?.defaultModel ?? models[0]?.key ?? "";

  useEffect(() => {
    setWorkspace(boot?.workspace ?? "");
  }, [boot?.workspace]);

  const pickModel = (key: string) => {
    set({ defaultModel: key });
    setError(null);
    void saveSettings({ defaultModel: key }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  };

  const updateTool = (id: keyof typeof state.tools, value: boolean) => {
    const next = { ...state.tools, [id]: value };
    setTools({ [id]: value });
    setError(null);
    void saveSettings({ tools: next }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  };

  const updateAutonomy = (autonomy: Autonomy) => {
    set({ autonomy });
    setError(null);
    void saveSettings({ autonomy }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  };

  const applyWorkspace = async () => {
    const next = workspace.trim();
    if (!next) return;
    setWorkspaceState("saving");
    setError(null);
    try {
      await saveSettings({ workspace: next });
      setWorkspaceState("ok");
      window.setTimeout(() => setWorkspaceState("idle"), 1800);
    } catch (caught) {
      setWorkspaceState("idle");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="space-y-6">
      <Field label="Workspace" hint="Used by the file and shell tools">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <TextInput
              icon={<FolderOpen className="h-4 w-4" />}
              value={workspace}
              onChange={(e) => {
                setWorkspace(e.target.value);
                setWorkspaceState("idle");
              }}
              placeholder="C:\projects\my-app"
            />
          </div>
          <Button
            onClick={() => void applyWorkspace()}
            disabled={workspaceState === "saving" || !workspace.trim() || workspace.trim() === boot?.workspace}
          >
            {workspaceState === "saving" ? <Spinner /> : workspaceState === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
            {workspaceState === "ok" ? "Updated" : "Use folder"}
          </Button>
        </div>
        <p className="mt-2 px-1 text-[11.5px] t-faint">
          New runs read and write in this folder. Changes take effect immediately and are remembered for the next launch.
        </p>
      </Field>
      <Field label="Default model" hint={`${models.length} available`}>
        {models.length === 0 ? (
          <div className="rounded-[4px] border border-[var(--line)] bg-surface2 px-3.5 py-2.5 text-[12.5px] t-muted">
            No models yet. Connect a provider in the Providers tab first.
          </div>
        ) : (
          <div className="scroll-thin grid max-h-[190px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {models.map((m) => {
              const on = m.key === current;
              return (
                <button
                  key={m.key}
                  onClick={() => pickModel(m.key)}
                  className={cn(
                    "rounded-[4px] border px-3 py-2 text-left outline-none transition-colors",
                    on
                      ? "border-[var(--accent-line)] bg-accent-soft"
                      : "border-[var(--line)] bg-surface hover-s2",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium t-ink">{m.name}</span>
                      {m.free && (
                        <span className="shrink-0 rounded border border-[var(--line)] bg-surface px-1 py-px text-[8.5px] font-semibold uppercase tracking-[0.08em] t-ok">
                          Free
                        </span>
                      )}
                    </span>
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded border border-black/5 bg-white" title={providerMeta(m.provider).name}>
                      <ProviderLogo id={m.provider} className="h-3 w-3" />
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] t-muted">{m.desc}</span>
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="mt-2 flex items-center gap-1.5 px-1 text-[11.5px] t-warn"><AlertTriangle className="h-3 w-3" /> {error}</p>}
      </Field>
      <Field label="Tools the agent may use">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const on = state.tools[t.id];
            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-[4px] border px-3 py-2.5 transition-colors",
                  on ? "border-[var(--accent-line)] bg-accent-soft" : "border-[var(--line)] bg-surface",
                )}
              >
                <t.icon className={cn("h-4 w-4 shrink-0", on ? "t-accent" : "t-muted")} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium t-ink">{t.name}</div>
                  <div className="truncate text-[10.5px] t-muted">{t.desc}</div>
                </div>
                <Toggle on={on} onChange={(v) => updateTool(t.id, v)} label={t.name} />
              </div>
            );
          })}
        </div>
      </Field>
      <Field label="Autonomy">
        <Segmented value={state.autonomy} options={AUTONOMY.map((a) => ({ id: a.id, label: a.label }))} onChange={updateAutonomy} />
        <p className="mt-2 px-1 text-[12px] t-muted">{AUTONOMY.find((a) => a.id === state.autonomy)?.hint}</p>
      </Field>
      {boot && (
        <Field label="Harness" hint={`v${boot.version}`}>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <InfoRow icon={HardDrive} label="Data" value={boot.dataDir} />
            <InfoRow icon={Brain} label="Memories" value={`${boot.memoryCount} saved`} mono={false} />
            <InfoRow icon={Gauge} label="Node" value={boot.node} />
          </div>
        </Field>
      )}
    </div>
  );
}

function ThemeCard({ palette, active, onPick }: { palette: PaletteInfo; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={cn(
        "overflow-hidden rounded-[12px] border p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]",
        active
          ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
          : "border-[var(--line)] hover:border-[var(--line-strong)]",
      )}
      aria-pressed={active}
      aria-label={`${palette.label} palette`}
    >
      <span
        className="flex h-[92px] gap-1.5 overflow-hidden rounded-[9px] border p-1.5"
        style={{ background: palette.canvas, borderColor: palette.line }}
      >
        <span
          className="flex w-[28%] flex-col gap-1.5 rounded-[6px] border p-1.5"
          style={{ background: palette.surface, borderColor: palette.line }}
        >
          <span className="h-1.5 w-3/4 rounded-full" style={{ background: palette.accent }} />
          <span className="h-1 w-full rounded-full" style={{ background: palette.line }} />
          <span className="h-1 w-2/3 rounded-full" style={{ background: palette.line }} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-1.5">
          <span className="h-1.5 w-1/2 rounded-full" style={{ background: palette.ink }} />
          <span
            className="flex-1 rounded-[6px] border"
            style={{ background: palette.surface, borderColor: palette.line }}
          />
          <span className="flex items-center justify-between gap-1">
            <span className="h-1.5 w-1/3 rounded-full" style={{ background: palette.line }} />
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: palette.accent }} />
          </span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-2">
        <span>
          <span className="block text-[12px] font-medium t-ink">{palette.label}</span>
          <span className="block text-[10.5px] t-faint">{palette.note}</span>
        </span>
        <span
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
            active ? "border-[var(--accent)] bg-accent text-[var(--on-accent)]" : "border-[var(--line-strong)] bg-surface",
          )}
        >
          {active && <CheckCircle2 className="h-3 w-3" strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}

export function AppearancePanel() {
  const { state, set } = useStore();
  return (
    <div className="space-y-6">
      <Field label="Palette" hint="Six curated families">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PALETTES.map((palette) => (
            <ThemeCard
              key={palette.id}
              palette={palette}
              active={state.theme === palette.id}
              onPick={() => set({ theme: palette.id })}
            />
          ))}
        </div>
      </Field>

      <Field label="Session navigation" hint="Ctrl B toggles the chosen layout">
        <Segmented<SessionNav>
          value={state.sessionNav}
          options={[
            { id: "sidebar", label: "Sidebar" },
            { id: "top", label: "Top panel" },
            { id: "hidden", label: "Hidden" },
          ]}
          onChange={(sessionNav) => set({ sessionNav })}
        />
        <p className="mt-2 px-0.5 text-[11.5px] leading-relaxed t-muted">
          Dock sessions on the left, open them below the top bar, or keep the conversation full width.
        </p>
      </Field>

      <Field label="Motion">
        <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-surface2 px-3.5 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-surface">
            {state.motion ? <Sparkles className="h-4 w-4 t-accent" /> : <Moon className="h-4 w-4 t-muted" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium t-ink">Interface motion</div>
            <div className="text-[11.5px] leading-relaxed t-muted">
              Short fades and slides as messages and panels arrive. Turn it off for a still interface.
            </div>
          </div>
          <Toggle on={state.motion} onChange={(motion) => set({ motion })} label="Interface motion" />
        </div>
      </Field>

      <div className="rounded-[12px] border border-[var(--line)] bg-surface2 px-3.5 py-3">
        <div className="flex items-center gap-2 text-[12px] font-medium t-ink">
          <Sun className="h-3.5 w-3.5 t-muted" /> Restrained color, readable type
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed t-muted">
          Three light and three dark palettes share the same workspace geometry. Each family has its own
          surfaces, hairlines and accent, with contrast checked for secondary text.
        </p>
      </div>
    </div>
  );
}

/**
 * MCP servers. Each one is a local process that speaks the Model Context
 * Protocol over stdio; the agent can call its tools with the normal
 * approval policy.
 */
export function McpPanel() {
  const [servers, setServers] = useState<McpServerStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    listMcpServers()
      .then((list) => {
        if (alive) setServers(list);
      })
      .catch((caught) => {
        if (alive) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  const parseEnv = (value: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    return out;
  };

  const detect = async () => {
    setBusy("detect");
    setError(null);
    setNotice(null);
    try {
      const result = await discoverMcpServers();
      setServers(result.servers);
      setNotice(
        result.imported
          ? `Imported ${result.imported} local ${result.imported === 1 ? "server" : "servers"} from ${result.sources} configuration ${result.sources === 1 ? "file" : "files"}.`
          : result.discovered
            ? "Every discovered server is already configured."
            : "No supported local MCP configurations found.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!command.trim()) {
      setError("An MCP server needs a command, for example npx or a path to a server.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      setServers(
        await saveMcpServer({
          id: "",
          name: name.trim() || command.trim(),
          command: command.trim(),
          args: args.trim() ? args.trim().split(/\s+/) : [],
          env: parseEnv(env),
          enabled: true,
        }),
      );
      setName("");
      setCommand("");
      setArgs("");
      setEnv("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const test = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const status = await testMcpServer(id);
      setServers((prev) => prev?.map((entry) => (entry.id === id ? status : entry)) ?? prev);
      if (!status.connected && status.error) setError(status.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      setServers(await deleteMcpServer(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Field label="MCP servers" hint="Local tools over the Model Context Protocol">
        {servers === null ? (
          <div className="flex items-center gap-2 px-1 text-[12.5px] t-muted">
            <Spinner className="h-4 w-4" /> Loading servers…
          </div>
        ) : servers.length === 0 ? (
          <p className="px-1 text-[12.5px] t-muted">
            No MCP servers yet. Add one below and its tools become available to the agent.
          </p>
        ) : (
          <div className="space-y-1.5">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex flex-wrap items-center gap-2.5 rounded-[4px] border border-[var(--line)] bg-surface2 px-3 py-2.5"
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
                    server.connected
                      ? "border-[var(--line)] bg-ok-soft t-ok"
                      : "border-[var(--line)] bg-surface t-muted",
                  )}
                >
                  <Server className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium t-ink">{server.name}</div>
                  <div className="truncate font-mono text-[10.5px] t-faint">
                    {server.command}
                    {server.args.length ? ` ${server.args.join(" ")}` : ""}
                  </div>
                  {server.connected ? (
                    <div className="mt-0.5 truncate text-[10.5px] t-ok">
                      {server.tools.length} tool{server.tools.length === 1 ? "" : "s"}
                      {server.tools.length ? ` · ${server.tools.map((tool) => tool.name).join(", ")}` : ""}
                    </div>
                  ) : server.error ? (
                    <div className="mt-0.5 truncate text-[10.5px] t-warn">{server.error}</div>
                  ) : (
                    <div className="mt-0.5 text-[10.5px] t-faint">Not started</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={busy === server.id} onClick={() => void test(server.id)}>
                    {busy === server.id ? <Spinner className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />} Test
                  </Button>
                  <button
                    onClick={() => void remove(server.id)}
                    disabled={busy === server.id}
                    className="grid h-7 w-7 place-items-center rounded-md t-muted transition-colors hover-s3 hover-ink disabled:opacity-40"
                    aria-label={`Remove ${server.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field label="Add a server" hint="Started locally when a run needs it">
        <div className="space-y-2.5 rounded-[4px] border border-[var(--line)] bg-surface2 px-3.5 py-3.5">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" />
          <TextInput value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Command, e.g. npx" />
          <TextInput value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Arguments, e.g. -y @modelcontextprotocol/server-filesystem ." />
          <textarea
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            placeholder={"Environment variables, one per line\nAPI_KEY=value"}
            className="scroll-thin min-h-[84px] w-full resize-y rounded-[4px] border border-[var(--line-strong)] bg-surface px-3 py-2 font-mono text-[11.5px] leading-relaxed t-ink2 outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" disabled={busy === "add"} onClick={() => void add()}>
                {busy === "add" ? <Spinner className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />} Add server
              </Button>
              <Button variant="secondary" size="sm" disabled={busy === "detect"} onClick={() => void detect()}>
                {busy === "detect" ? <Spinner className="h-3.5 w-3.5" /> : <SearchCheck className="h-3.5 w-3.5" />} Detect existing
              </Button>
            </div>
            <button
              onClick={() => setReload((n) => n + 1)}
              className="inline-flex items-center gap-1.5 text-[11.5px] t-muted hover-ink"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>
        {notice && <p className="mt-2 flex items-center gap-1.5 px-1 text-[11.5px] t-ok"><CheckCircle2 className="h-3 w-3" /> {notice}</p>}
        {error && <p className="mt-2 flex items-center gap-1.5 px-1 text-[11.5px] t-warn"><AlertTriangle className="h-3 w-3" /> {error}</p>}
      </Field>

      <p className="px-1 text-[11.5px] leading-relaxed t-faint">
        MCP servers run as local processes with the permissions of your account. Their tools are treated as
        commands, so they ask for approval in Ask first and Balanced modes. Existing local OpenCode configurations
        are imported on first launch; Detect existing scans again without starting a server. Remote HTTP servers
        are not imported by this stdio-only build.
      </p>
    </div>
  );
}

export function MemoryPanel() {
  const { state } = useStore();
  const { boot, saveSettings } = useServer();
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    setError(null);
    // The search runs on the server so it uses the same BM25 ranking the
    // agent gets from the recall tool.
    const timer = window.setTimeout(() => {
      listMemory(query)
        .then((list) => {
          if (alive) setEntries(list);
        })
        .catch((caught) => {
          if (!alive) return;
          setEntries([]);
          setError(caught instanceof Error ? caught.message : String(caught));
        });
    }, query.trim() ? 160 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [reload, query]);

  const remove = async (entry: MemoryEntry) => {
    setBusy(entry.id);
    setError(null);
    try {
      await deleteMemory(entry.id);
      setEntries((prev) => (prev ? prev.filter((item) => item.id !== entry.id) : prev));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const updateAutoSave = async (autoSave: boolean) => {
    setBusy("autoSave");
    setError(null);
    try {
      await saveSettings({ memory: { autoSave } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-tight t-ink">
            <Brain className="h-4 w-4 t-accent" /> Memory
          </h3>
          <p className="mt-0.5 text-[11.5px] t-muted">Durable facts the agent has saved across sessions. Delete anything you no longer want it to recall.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>
          <RefreshCw className={cn("h-3.5 w-3.5", entries === null && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-surface2 px-3.5 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] bg-surface">
          <Brain className="h-4 w-4 t-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium t-ink">Automatic personal memory</div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed t-muted">
            After an answer, Hikes saves explicit durable facts and preferences from your message. Attachments,
            one-off tasks and obvious secrets are excluded. Turning this off keeps existing entries.
          </div>
        </div>
        <Toggle
          on={boot?.memory.autoSave ?? true}
          onChange={(value) => void updateAutoSave(value)}
          label="Automatic personal memory"
          disabled={busy === "autoSave" || !boot || !state.tools.memory}
        />
      </div>

      {!state.tools.memory && (
        <p className="flex items-start gap-2 rounded-[4px] border border-[var(--line)] bg-warn-soft px-3 py-2 text-[11.5px] t-warn">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>Memory is turned off in Agent settings. Existing entries are kept but the agent will not read or write them.</span>
        </p>
      )}

      {entries !== null && (
        <div className="field flex h-9 items-center gap-2 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 t-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memories"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] t-ink outline-none placeholder:text-[var(--faint)]"
          />
        </div>
      )}

      {entries === null ? (
        <div className="flex items-center gap-2.5 py-10 text-[12.5px] t-muted"><Spinner className="h-4 w-4" /> Loading memories…</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center rounded-[6px] border border-dashed border-[var(--line-strong)] bg-surface2 px-6 py-12 text-center">
          <Database className="mb-3 h-7 w-7 t-faint" />
          <p className="font-display text-[21px] t-ink">{query.trim() ? "No matching memories" : "Nothing remembered yet"}</p>
          <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed t-muted">
            {query.trim()
              ? "Search looks at every word, including partial words and tags, so a differently phrased fact can still surface."
              : "When the agent learns something worth keeping, it saves a short fact here. You can remove individual entries at any time."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const tags = entry.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
            return (
              <div key={entry.id} className="rounded-[4px] border border-[var(--line)] bg-surface2 px-3.5 py-2.5">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-surface">
                    <Brain className="h-3 w-3 t-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed t-ink2">{entry.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] t-faint">
                      <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{new Date(entry.created_at).toLocaleString()}</span>
                      <span className="rounded border border-[var(--line)] bg-surface px-1.5 py-px uppercase tracking-[0.1em] t-muted">{entry.scope}</span>
                      {tags.map((tag) => (
                        <span key={tag} className="rounded border border-[var(--line)] bg-surface px-1.5 py-px t-muted">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => void remove(entry)}
                    disabled={busy === entry.id}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md t-muted transition-colors hover-s3 hover-ink disabled:opacity-40"
                    aria-label="Delete memory"
                    title="Delete memory"
                  >
                    {busy === entry.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="flex items-center gap-1.5 px-1 text-[11.5px] t-warn"><AlertTriangle className="h-3 w-3" /> {error}</p>}
    </div>
  );
}

const SHORTCUTS = [
  { keys: "Ctrl K", label: "Command palette" },
  { keys: "Ctrl B", label: "Show or hide the session index" },
  { keys: "Ctrl J", label: "Show or hide the activity ledger" },
  { keys: "Esc", label: "Close settings, palette or menus" },
] as const;

export function AboutPanel() {
  const { boot } = useServer();
  const { state } = useStore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-tight t-ink">
          <Info className="h-4 w-4 t-accent" /> About Hikes
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed t-muted">
          A local-first agent harness: a quiet workspace, real tools, and any model you can reach.
        </p>
      </div>

      {boot ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <InfoRow icon={Info} label="Version" value={`Hikes v${boot.version}`} mono={false} />
          <InfoRow icon={Server} label="Node" value={boot.node} />
          <InfoRow icon={HardDrive} label="Data directory" value={boot.dataDir} />
          <InfoRow icon={FolderOpen} label="Workspace" value={boot.workspace} />
          <InfoRow icon={ShieldCheck} label="Authentication" value={boot.tokenRequired ? "Launch token required" : "Local access only"} mono={false} />
          <InfoRow icon={Database} label="Memory" value={`${boot.memoryCount} ${boot.memoryCount === 1 ? "entry" : "entries"}`} mono={false} />
          <InfoRow icon={Database} label="Model catalog" value={`${boot.models.length} available`} mono={false} />
          <InfoRow icon={KeyRound} label="Providers" value={`${Object.values(boot.providers).filter((p) => p.enabled).length} enabled`} mono={false} />
        </div>
      ) : (
        <div className="flex items-center gap-2.5 py-6 text-[12.5px] t-muted"><Spinner className="h-4 w-4" /> Loading harness details…</div>
      )}

      <Field label="Keyboard shortcuts">
        <div className="divide-line overflow-hidden rounded-[4px] border border-[var(--line)] bg-surface">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[12px]">
              <span className="flex items-center gap-2 t-muted"><Keyboard className="h-3 w-3 t-faint" />{shortcut.label}</span>
              <span className="kbd shrink-0">{shortcut.keys}</span>
            </div>
          ))}
        </div>
      </Field>

      <div className="flex items-start gap-2.5 rounded-[4px] border border-[var(--line)] bg-surface2 px-3.5 py-2.5 text-[11.5px] leading-relaxed t-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 t-ok" />
        <span>
          Setup runs once. This build deliberately has no “restart onboarding” action, so your profile, providers and appearance stay put. Your configuration is stored locally at{" "}
          <span className="font-mono t-ink2">~/.hikes/config.json</span> and in this browser.
          {state.onboarded ? " Setup is complete on this device." : ""}
        </span>
      </div>
    </div>
  );
}
