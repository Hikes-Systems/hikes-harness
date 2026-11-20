import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
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
  Image,
  Info,
  KeyRound,
  Keyboard,
  Link2,
  RefreshCw,
  RotateCcw,
  Search,
  SearchCheck,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  User,
  Wand2,
  Zap,
} from "lucide-react";
import { Button, Chip, Field, Segmented, Spinner, TextInput, Toggle } from "./ui";
import {
  deleteMcpServer,
  deleteMemory,
  listMemory,
  listMcpServers,
  saveMcpServer,
  testMcpServer,
  type MemoryEntry,
} from "../lib/api";
import { useServer } from "../lib/server";
import { useStore, type Autonomy, type Tone } from "../store";
import { AGENTS } from "@shared/agents";
import { MASCOTS, resolveAgent } from "../lib/mascots";
import { PROVIDERS, providerMeta, type ProviderId } from "@shared/providers";
import { ProviderLogo } from "./ProviderLogo";
import { SCENES } from "../lib/scenes";
import { DEFAULT_WALLPAPER, WALLPAPERS, prepareWallpaper } from "../lib/wallpaper";
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
        <p className="mt-2 px-1 text-[13px] text-white/55">{TONES.find((t) => t.id === p.tone)?.hint}</p>
      </Field>
    </div>
  );
}

export function GeneralPanel({ autoFocus }: { autoFocus?: boolean }) {
  const { state, set } = useStore();
  return (
    <div className="space-y-7">
      <ProfilePanel autoFocus={autoFocus} />
      <div className="h-px bg-white/10" />
      <Field label="Default answer mode" hint="Used for every new message">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.08]">
            <SearchCheck className="h-[18px] w-[18px] text-white/80" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">Deep research first</div>
            <div className="text-[12px] leading-relaxed text-white/55">
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
      <p className="px-1 text-[12.5px] leading-relaxed text-white/45">
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
      <div className="grid gap-5 md:grid-cols-[208px_1fr]">
        <div className="scroll-thin flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {PROVIDERS.map((p) => {
            const v = boot?.providers[p.id];
            const on = focus === p.id;
            return (
              <button
                key={p.id} onClick={() => setFocus(p.id)}
                className={cn("glass-hover flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-[background-color,box-shadow,transform]", on ? "sel-on" : "glass-css hover:bg-white/10")}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/92 shadow-[0_4px_10px_rgba(0,0,0,.25)] ring-1 ring-white/60">
                  <ProviderLogo id={p.id} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{p.name}</span>
                  <span className="block text-[11.5px] text-white/50">{providerState(p.id)}</span>
                </span>
                {v?.enabled && <span className={cn("h-2 w-2 rounded-full", v.modelCount > 0 ? "bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" : "accent-bg")} style={v.modelCount > 0 ? undefined : { background: "var(--accent)" }} />}
              </button>
            );
          })}
        </div>

        <div key={focus} className="a-fade glass-css rounded-3xl p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-serif text-[26px] leading-tight">{meta.name}</h3>
              <p className="text-[13.5px] text-white/60">{meta.tagline}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[12px] text-white/50">Enable</span>
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
              <p className="px-1 text-[12.5px] leading-relaxed text-white/50">
                Hikes talks to Ollama from the local server, so no CORS setup is needed. Pull a model first, for example{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11.5px]">ollama pull llama3.2</code>.
              </p>
            )}
            {focus === "custom" && (
              <p className="px-1 text-[12.5px] leading-relaxed text-white/50">
                Works with LM Studio, vLLM, llama.cpp and anything else exposing an OpenAI-compatible <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11.5px]">/chat/completions</code> route.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={() => void test()} disabled={status.state === "testing"}>
                {status.state === "testing" ? <Spinner /> : <Zap className="h-4 w-4" />} Test &amp; save
              </Button>
              {view?.hasKey && (
                <Button variant="ghost" size="sm" onClick={() => void clearKey()}>
                  Remove key
                </Button>
              )}
              {status.state === "ok" && <span className="a-pop flex items-center gap-1.5 text-[13px] text-emerald-200"><CheckCircle2 className="h-4 w-4" /> {status.message}</span>}
              {status.state === "error" && <span className="a-pop flex items-start gap-1.5 text-[13px] text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {status.message}</span>}
            </div>
          </div>
          <p className="mt-5 flex items-start gap-2 border-t border-white/10 pt-4 text-[12.5px] leading-relaxed text-white/50">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Keys are stored on this machine in{" "}
            <span className="font-mono text-white/65">~/.hikes/config.json</span> and never sent to the browser. Requests go straight from the local server to the provider.
          </p>
        </div>
      </div>

      <div className="glass-css rounded-3xl p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-serif text-[22px] leading-tight"><SearchCheck className="h-[18px] w-[18px] accent-text" /> Web search</h3>
          <div className="flex gap-2 text-[11.5px] text-white/50">
            {boot?.search.tavily && <span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-emerald-100">Tavily saved</span>}
            {boot?.search.brave && <span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-emerald-100">Brave saved</span>}
          </div>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-white/55">
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void saveSearch()}>{searchStatus.state === "testing" ? <Spinner /> : <SearchCheck className="h-4 w-4" />} Save search keys</Button>
          {boot?.search.tavily && <Button variant="ghost" size="sm" onClick={() => void saveSearch("tavily")}>Remove Tavily</Button>}
          {boot?.search.brave && <Button variant="ghost" size="sm" onClick={() => void saveSearch("brave")}>Remove Brave</Button>}
          {searchStatus.state === "ok" && <span className="text-[13px] text-emerald-200">{searchStatus.message}</span>}
          {searchStatus.state === "error" && <span className="text-[13px] text-amber-200">{searchStatus.message}</span>}
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
    <div className="flex items-start gap-3 rounded-2xl bg-white/[0.06] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-white/40">{label}</div>
        <div className={cn("mt-0.5 break-all text-[12.5px] text-white/80", mono && "font-mono")}>{value}</div>
      </div>
    </div>
  );
}

export function AgentPanel() {
  const { boot, saveSettings } = useServer();
  const { state, set, setTools, setAgentIdentity, resetAgentIdentity } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [mascotFor, setMascotFor] = useState<string | null>(null);
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
      <Field label="Agent identities" hint="Names and mascots">
        <div className="space-y-2">
          {AGENTS.map((definition) => {
            const agent = resolveAgent(definition.id, state.agents);
            const Icon = agent.Icon;
            const picker = mascotFor === agent.id;
            return (
              <div
                key={agent.id}
                className="rounded-2xl bg-white/[0.06] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMascotFor(picker ? null : agent.id)}
                    className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-2xl outline-none transition-colors",
                      picker ? "sel-on" : "glass-css glass-hover",
                    )}
                    aria-label={`Choose mascot for ${agent.name}`}
                    aria-expanded={picker}
                    title="Choose mascot"
                  >
                    <Icon className="h-5 w-5 accent-text" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10.5px] uppercase tracking-[0.14em] text-white/40">{agent.desc}</span>
                      {agent.customized && (
                        <span className="rounded-full bg-white/10 px-1.5 py-[1px] text-[9px] uppercase tracking-[0.1em] text-white/50">
                          Custom
                        </span>
                      )}
                    </div>
                    <input
                      value={state.agents[agent.id]?.name ?? ""}
                      onChange={(event) => setAgentIdentity(agent.id, { name: event.target.value })}
                      onBlur={() => {
                        if (!state.agents[agent.id]?.name.trim()) resetAgentIdentity(agent.id);
                      }}
                      maxLength={40}
                      placeholder={definition.name}
                      aria-label={`Name for ${definition.name}`}
                      className="h-9 w-full rounded-xl bg-white/[0.07] px-3 text-[14px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,.35)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => resetAgentIdentity(agent.id)}
                    disabled={!agent.customized}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/60 outline-none transition-colors hover:bg-white/12 hover:text-white disabled:pointer-events-none disabled:opacity-25"
                    aria-label={`Reset ${agent.name}`}
                    title="Reset name and mascot"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
                {picker && (
                  <div className="mt-3 grid grid-cols-8 gap-1.5">
                    {MASCOTS.map((mascot) => {
                      const Mascot = mascot.Icon;
                      const on = mascot.id === agent.identity.mascot;
                      return (
                        <button
                          key={mascot.id}
                          type="button"
                          onClick={() => {
                            setAgentIdentity(agent.id, { mascot: mascot.id });
                            setMascotFor(null);
                          }}
                          className={cn(
                            "grid h-8 place-items-center rounded-xl outline-none transition-colors",
                            on ? "sel-on accent-text" : "bg-white/[0.05] text-white/60 hover:bg-white/12 hover:text-white",
                          )}
                          aria-label={mascot.label}
                          aria-pressed={on}
                          title={mascot.label}
                        >
                          <Mascot className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-[12.5px] text-white/50">
          Names and mascots appear in the header, session list and the agent&apos;s system prompt.
        </p>
      </Field>
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
        <p className="mt-2 px-1 text-[12.5px] text-white/50">
          New runs read and write in this folder. Changes take effect immediately and are remembered for the next launch.
        </p>
      </Field>
      <Field label="Default model" hint={`${models.length} available`}>
        {models.length === 0 ? (
          <div className="glass-css rounded-2xl px-4 py-3 text-[13.5px] text-white/60">
            No models yet. Connect a provider in the Providers tab first.
          </div>
        ) : (
          <div className="scroll-thin grid max-h-[190px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {models.map((m) => {
              const on = m.key === current;
              return (
                <button key={m.key} onClick={() => pickModel(m.key)} className={cn("glass-hover rounded-2xl px-3.5 py-2.5 text-left outline-none", on ? "sel-on" : "glass-css hover:bg-white/10")}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">{m.name}</span>
                      {m.free && (
                        <span className="shrink-0 rounded-full bg-emerald-300/15 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
                          Free
                        </span>
                      )}
                    </span>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/90" title={providerMeta(m.provider).name}>
                      <ProviderLogo id={m.provider} className="h-3.5 w-3.5" />
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-white/55">{m.desc}</span>
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="mt-2 flex items-center gap-1.5 px-1 text-[12.5px] text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
      </Field>
      <Field label="Tools the agent may use">
        <div className="grid gap-2 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const on = state.tools[t.id];
            return (
              <div key={t.id} className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-[background-color,box-shadow]", on ? "sel-on" : "glass-css")}>
                <t.icon className="h-5 w-5 shrink-0 text-white/80" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{t.name}</div>
                  <div className="truncate text-[12px] text-white/55">{t.desc}</div>
                </div>
                <Toggle on={on} onChange={(v) => updateTool(t.id, v)} label={t.name} />
              </div>
            );
          })}
        </div>
      </Field>
      <Field label="Autonomy">
        <Segmented value={state.autonomy} options={AUTONOMY.map((a) => ({ id: a.id, label: a.label }))} onChange={updateAutonomy} />
        <p className="mt-2 px-1 text-[13px] text-white/55">{AUTONOMY.find((a) => a.id === state.autonomy)?.hint}</p>
      </Field>
      {boot && (
        <Field label="Harness" hint={`v${boot.version}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoRow icon={HardDrive} label="Data" value={boot.dataDir} />
            <InfoRow icon={Brain} label="Memories" value={`${boot.memoryCount} saved`} mono={false} />
            <InfoRow icon={Gauge} label="Node" value={boot.node} />
          </div>
        </Field>
      )}
    </div>
  );
}

export function AtmospherePanel() {
  const { state, set } = useStore();
  const wp = state.wallpaper;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (next: Partial<typeof wp>) => set({ wallpaper: { ...wp, ...next } });

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await prepareWallpaper(file);
      patch({ id: "custom", image });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Field label="Wallpaper" hint="Shows through the glass shell">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WALLPAPERS.map((preset) => {
            const on = wp.id === preset.id;
            const custom = preset.id === "custom";
            return (
              <button
                key={preset.id}
                onClick={() => (custom ? fileRef.current?.click() : patch({ id: preset.id }))}
                className={cn("glass-hover group overflow-hidden rounded-3xl p-2 text-left outline-none", on ? "sel-on" : "glass-css hover:bg-white/10")}
              >
                <span
                  className="relative block h-[76px] overflow-hidden rounded-[18px]"
                  style={{
                    background: custom && wp.image ? `url("${wp.image}") center / ${wp.fit ?? "cover"} no-repeat` : preset.preview,
                    backgroundSize: preset.id === "grid" ? "22px 22px, 22px 22px, cover, cover" : undefined,
                  }}
                >
                  {custom && wp.image && on && <span className="absolute inset-0 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--accent)_70%,transparent)]" />}
                  {!wp.image && custom && (
                    <span className="absolute inset-0 grid place-items-center text-white/50"><Upload className="h-5 w-5" /></span>
                  )}
                </span>
                <span className="block px-2 pb-1 pt-2.5">
                  <span className="block text-[13.5px] font-medium">{preset.name}</span>
                  <span className="block text-[11.5px] text-white/50">{preset.note}</span>
                </span>
              </button>
            );
          })}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void upload(event.target.files?.[0])} />
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-[12.5px] text-white/65 underline-offset-2 hover:text-white hover:underline">
            {busy ? <Spinner className="h-3 w-3" /> : <Image className="h-3.5 w-3.5" />}
            {wp.image ? "Replace image" : "Upload an image"}
          </button>
          {wp.image && (
            <button onClick={() => patch({ image: "", id: "alpine" })} className="inline-flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
          {wp.id === "solid" && (
            <label className="ml-auto inline-flex items-center gap-2 text-[12px] text-white/55">
              Colour
              <input
                type="color"
                value={wp.color}
                onChange={(event) => patch({ color: event.target.value })}
                className="h-7 w-10 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0.5"
              />
            </label>
          )}
        </div>
        {error && <p className="mt-2 flex items-center gap-1.5 px-1 text-[12.5px] text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
        {wp.id === "custom" && wp.image && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
            <div>
              <div className="text-[13px] text-white/75">Image fit</div>
              <div className="text-[11.5px] text-white/45">Cover fills the window; contain shows the whole image.</div>
            </div>
            <Segmented
              value={wp.fit ?? "cover"}
              options={[{ id: "cover", label: "Cover" }, { id: "contain", label: "Contain" }]}
              onChange={(fit) => patch({ fit })}
            />
          </div>
        )}
      </Field>

      <Field label="Background tuning">
        <div className="space-y-3 rounded-2xl bg-white/[0.05] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[12.5px] text-white/65"><span>Opacity</span><span className="font-mono text-white/45">{wp.opacity}%</span></span>
            <input type="range" min={20} max={100} value={wp.opacity} onChange={(event) => patch({ opacity: Number(event.target.value) })} className="range" />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[12.5px] text-white/65"><span>Blur</span><span className="font-mono text-white/45">{wp.blur}px</span></span>
            <input type="range" min={0} max={40} value={wp.blur} onChange={(event) => patch({ blur: Number(event.target.value) })} className="range" />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[12.5px] text-white/65"><span>Dim</span><span className="font-mono text-white/45">{wp.dim}%</span></span>
            <input type="range" min={0} max={80} value={wp.dim} onChange={(event) => patch({ dim: Number(event.target.value) })} className="range" />
          </label>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[13px] text-white/70">Pointer parallax</span>
            <Toggle on={wp.parallax} onChange={(value) => patch({ parallax: value })} label="Parallax" />
          </div>
        </div>
      </Field>

      {wp.id === "alpine" && (
        <Field label="Alpine scene" hint="Changes the whole sky live">
          <div className="grid grid-cols-2 gap-3">
            {SCENES.map((s) => {
              const on = state.scene === s.id;
              return (
                <button key={s.id} onClick={() => set({ scene: s.id })} className={cn("glass-hover group overflow-hidden rounded-3xl p-2 text-left outline-none", on ? "sel-on" : "glass-css hover:bg-white/10")}>
                  <div className="relative h-[84px] overflow-hidden rounded-[18px]" style={{ background: `linear-gradient(to bottom, ${s.sky[0]}, ${s.sky[2]} 45%, ${s.sky[3]} 70%, ${s.sky[4]})` }}>
                    <div className="absolute left-[58%] top-[44%] h-6 w-6 rounded-full blur-[2px]" style={{ background: s.sun, opacity: 0.9 }} />
                    {s.peaks.slice(0, 4).map((c, i) => (
                      <div key={i} className="absolute bottom-0 w-[130%]" style={{ left: `${-12 + i * 9}%`, height: `${64 - i * 12}%`, background: c, clipPath: i % 2 ? "polygon(0 100%, 18% 38%, 30% 62%, 52% 12%, 72% 56%, 86% 34%, 100% 100%)" : "polygon(0 100%, 12% 50%, 34% 18%, 48% 54%, 66% 30%, 84% 60%, 100% 100%)" }} />
                    ))}
                  </div>
                  <div className="px-2 pb-1 pt-2.5">
                    <div className="text-[14px] font-medium">{s.name}</div>
                    <div className="text-[12px] text-white/55">{s.blurb}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass-css flex items-center gap-3 rounded-2xl px-4 py-3">
          <Wand2 className="h-5 w-5 text-white/80" />
          <div className="flex-1"><div className="text-[14px] font-medium">Mountains in motion</div><div className="text-[12px] text-white/55">Parallax drift</div></div>
          <Toggle on={state.motion} onChange={(v) => set({ motion: v })} label="Motion" />
        </div>
        <div className="glass-css rounded-2xl px-4 py-3">
          <div className="mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4 text-white/80" /><span className="text-[14px] font-medium">Glass quality</span></div>
          <Segmented value="lite" options={[{ id: "lite", label: "Lite" }]} onChange={() => undefined} />
          <p className="mt-2 text-[12px] leading-relaxed text-white/50">Lite is the stable mode. The liquid refraction is being reworked and returns in a future update.</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-3 px-1">
        <p className="text-[12.5px] leading-relaxed text-white/50">The shell is a single curved glass surface, with real refraction at its rim. Lite keeps the whole scene at full speed on every device.</p>
        <Button variant="ghost" size="sm" onClick={() => set({ wallpaper: { ...DEFAULT_WALLPAPER } })}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
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
          <div className="flex items-center gap-2 px-1 text-[13px] text-white/50">
            <Spinner className="h-4 w-4" /> Loading servers…
          </div>
        ) : servers.length === 0 ? (
          <p className="px-1 text-[13px] text-white/50">
            No MCP servers yet. Add one below and its tools become available to the agent.
          </p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", server.connected ? "bg-emerald-300/15 text-emerald-100" : "bg-white/10 text-white/60")}>
                  <Server className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{server.name}</div>
                  <div className="truncate font-mono text-[11.5px] text-white/45">
                    {server.command}
                    {server.args.length ? ` ${server.args.join(" ")}` : ""}
                  </div>
                  {server.connected ? (
                    <div className="mt-0.5 truncate text-[11.5px] text-emerald-200/80">
                      {server.tools.length} tool{server.tools.length === 1 ? "" : "s"}
                      {server.tools.length ? ` · ${server.tools.map((tool) => tool.name).join(", ")}` : ""}
                    </div>
                  ) : server.error ? (
                    <div className="mt-0.5 truncate text-[11.5px] text-amber-200/80">{server.error}</div>
                  ) : (
                    <div className="mt-0.5 text-[11.5px] text-white/35">Not started</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" size="sm" disabled={busy === server.id} onClick={() => void test(server.id)}>
                    {busy === server.id ? <Spinner className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />} Test
                  </Button>
                  <button
                    onClick={() => void remove(server.id)}
                    disabled={busy === server.id}
                    className="grid h-8 w-8 place-items-center rounded-full text-white/45 transition hover:bg-white/12 hover:text-white disabled:opacity-40"
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
        <div className="space-y-3 rounded-2xl bg-white/[0.05] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" />
          <TextInput value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Command, e.g. npx" />
          <TextInput value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Arguments, e.g. -y @modelcontextprotocol/server-filesystem ." />
          <textarea
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            placeholder={"Environment variables, one per line\nAPI_KEY=value"}
            className="scroll-thin min-h-[84px] w-full resize-y rounded-xl bg-black/25 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white/80 outline-none placeholder:text-white/30 focus:ring-1 focus:ring-white/30"
          />
          <div className="flex items-center justify-between gap-3">
            <Button variant="primary" size="sm" disabled={busy === "add"} onClick={() => void add()}>
              {busy === "add" ? <Spinner className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />} Add server
            </Button>
            <button
              onClick={() => setReload((n) => n + 1)}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
        {error && <p className="mt-2 flex items-center gap-1.5 px-1 text-[12.5px] text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
      </Field>

      <p className="px-1 text-[12.5px] leading-relaxed text-white/45">
        MCP servers run as local processes with the permissions of your account. Their tools are treated as
        commands, so they ask for approval in Ask first and Balanced modes.
      </p>
    </div>
  );
}

export function MemoryPanel() {
  const { state } = useStore();
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-serif text-[24px] leading-tight"><Brain className="h-[18px] w-[18px] accent-text" /> Memory</h3>
          <p className="text-[13px] text-white/55">Durable facts the agent has saved across sessions. Delete anything you no longer want it to recall.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>
          <RefreshCw className={cn("h-3.5 w-3.5", entries === null && "animate-spin")} /> Refresh
        </Button>
      </div>

      {!state.tools.memory && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-300/10 px-3.5 py-2.5 text-[12.5px] text-amber-100 shadow-[inset_0_0_0_1px_rgba(255,220,150,.18)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Memory is turned off in Agent settings. Existing entries are kept but the agent will not read or write them.
        </p>
      )}

      {entries !== null && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memories"
            className="w-full rounded-xl bg-black/25 py-2.5 pl-9 pr-3 text-[13px] text-white/85 outline-none placeholder:text-white/30 focus:ring-1 focus:ring-white/30"
          />
        </div>
      )}

      {entries === null ? (
        <div className="flex items-center gap-2.5 py-10 text-[13.5px] text-white/55"><Spinner className="h-4 w-4" /> Loading memories…</div>
      ) : entries.length === 0 ? (
        <div className="glass-css flex flex-col items-center rounded-3xl px-6 py-12 text-center">
          <Database className="mb-3 h-8 w-8 text-white/35" />
          <p className="font-serif text-[22px]">{query.trim() ? "No matching memories" : "Nothing remembered yet"}</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-white/50">
            {query.trim()
              ? "Search looks at every word, including partial words and tags, so a differently phrased fact can still surface."
              : "When the agent learns something worth keeping, it saves a short fact here. You can remove individual entries at any time."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => {
            const tags = entry.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
            return (
              <div key={entry.id} className="group rounded-2xl bg-white/[0.06] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/10"><Brain className="h-3.5 w-3.5 text-white/70" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-white/85">{entry.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-white/40">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(entry.created_at).toLocaleString()}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 uppercase tracking-[0.12em] text-white/50">{entry.scope}</span>
                      {tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-white/45">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => void remove(entry)}
                    disabled={busy === entry.id}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
                    aria-label="Delete memory"
                    title="Delete memory"
                  >
                    {busy === entry.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="flex items-center gap-1.5 px-1 text-[12.5px] text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
    </div>
  );
}

const SHORTCUTS = [
  { keys: "Ctrl K", label: "Command palette" },
  { keys: "Ctrl B", label: "Show or hide sidebar" },
  { keys: "Ctrl J", label: "Show or hide inspector" },
  { keys: "Esc", label: "Close settings, palette or menus" },
] as const;

export function AboutPanel() {
  const { boot } = useServer();
  const { state } = useStore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 font-serif text-[26px] leading-tight"><Info className="h-[18px] w-[18px] accent-text" /> About Hikes</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">
          A local-first agent harness: one glass shell, real tools, and any model you can reach.
        </p>
      </div>

      {boot ? (
        <div className="grid gap-2 sm:grid-cols-2">
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
        <div className="flex items-center gap-2.5 py-6 text-[13.5px] text-white/55"><Spinner className="h-4 w-4" /> Loading harness details…</div>
      )}

      <Field label="Keyboard shortcuts">
        <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <span className="flex items-center gap-2 text-white/70"><Keyboard className="h-3.5 w-3.5 text-white/40" />{shortcut.label}</span>
              <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-white/55">{shortcut.keys}</span>
            </div>
          ))}
        </div>
      </Field>

      <div className="flex items-start gap-2.5 rounded-2xl bg-white/[0.05] px-3.5 py-3 text-[12.5px] leading-relaxed text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200/80" />
        <span>
          Setup runs once. This build deliberately has no “restart onboarding” action, so your profile, providers and appearance stay put. Your configuration is stored locally at{" "}
          <span className="font-mono text-white/70">~/.hikes/config.json</span> and in this browser.
          {state.onboarded ? " Setup is complete on this device." : ""}
        </span>
      </div>
    </div>
  );
}
