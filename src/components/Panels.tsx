import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  Image,
  KeyRound,
  Link2,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  User,
  Wand2,
  Zap,
} from "lucide-react";
import { Button, Chip, Field, Segmented, Spinner, TextInput, Toggle } from "./ui";
import { useServer } from "../lib/server";
import { useStore, type Autonomy, type Tone } from "../store";
import { PROVIDERS, providerMeta, type ProviderId } from "@shared/providers";
import { SCENES } from "../lib/scenes";
import { DEFAULT_WALLPAPER, WALLPAPERS, prepareWallpaper } from "../lib/wallpaper";
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
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-semibold text-[#1b1038]" style={{ background: `linear-gradient(145deg, ${p.grad[0]}, ${p.grad[1]})`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.7), 0 4px 10px rgba(0,0,0,.25)" }}>{p.mono}</span>
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
                    <span className="shrink-0 text-[10.5px] uppercase tracking-wider text-white/45">{providerMeta(m.provider).name.split(" ")[0]}</span>
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
                    background: custom && wp.image ? `url("${wp.image}") center / cover no-repeat` : preset.preview,
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
          <Segmented value={state.quality} options={[{ id: "full", label: "Liquid" }, { id: "lite", label: "Lite" }]} onChange={(quality) => set({ quality })} />
        </div>
      </div>
      <div className="flex items-start justify-between gap-3 px-1">
        <p className="text-[12.5px] leading-relaxed text-white/50">The shell is a single curved glass surface. Liquid mode adds live refraction inside panels and looks best in Chrome, Edge and Brave. Switch to Lite if your device feels warm.</p>
        <Button variant="ghost" size="sm" onClick={() => set({ wallpaper: { ...DEFAULT_WALLPAPER } })}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
      </div>
    </div>
  );
}
