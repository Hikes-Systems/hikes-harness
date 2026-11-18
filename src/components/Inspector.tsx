import { useMemo } from "react";
import {
  Activity,
  Brain,
  Check,
  Cpu,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  ListTree,
  PanelRightClose,
  PenLine,
  Telescope,
  Terminal,
} from "lucide-react";
import { Burst, Spinner } from "./ui";
import { STEP_ICON } from "./Chat";
import { useServer } from "../lib/server";
import { useStore } from "../store";
import { providerMeta } from "@shared/providers";
import type { Msg, Source, SubAgentTask } from "../lib/types";
import { cn } from "../utils/cn";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-1 truncate font-mono text-[18px] leading-none">{value}</div>
    </div>
  );
}

const compact = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value));

const taskIcon = (task: SubAgentTask) =>
  task.type === "researcher"
    ? Telescope
    : task.type === "coder"
      ? Terminal
      : task.type === "writer"
        ? PenLine
        : task.type === "planner"
          ? ListTree
          : Brain;

const taskName = (task: SubAgentTask) =>
  task.type === "researcher"
    ? "Researcher"
    : task.type === "coder"
      ? "Coder"
      : task.type === "writer"
        ? "Writer"
        : task.type === "planner"
          ? "Planner"
          : "Analyst";

function SubAgentRow({ task }: { task: SubAgentTask }) {
  const Icon = taskIcon(task);
  const running = task.status === "running";
  const failed = task.status === "error";
  const done = (task.steps ?? []).filter((step) => step.state === "done").length;
  const total = (task.steps ?? []).length;
  return (
    <div className="rounded-2xl bg-white/[0.06] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-xl", running ? "sel-on" : failed ? "bg-amber-300/20 text-amber-100" : "bg-white/10")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{task.title}</div>
          <div className="truncate text-[11px] text-white/40">
            {taskName(task)} · {running ? "working" : failed ? "failed" : `${total} steps`}
            {task.ms ? ` · ${(task.ms / 1000).toFixed(1)}s` : ""}
          </div>
        </div>
        {running ? (
          <Spinner className="h-3.5 w-3.5 text-white/60" />
        ) : failed ? (
          <Cpu className="h-3.5 w-3.5 text-amber-200" />
        ) : (
          <Check className="h-3.5 w-3.5 text-emerald-300" strokeWidth={3} />
        )}
      </div>
      {total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.round((done / total) * 100)}%`, background: failed ? "#fcd34d" : "var(--accent)" }}
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] text-white/35">{done}/{total}</span>
        </div>
      )}
      {task.error && <p className="mt-1.5 truncate text-[11px] text-amber-200/80">{task.error}</p>}
    </div>
  );
}

function SourceRow({ source }: { source: Source }) {
  return source.url ? (
    <a href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-xl bg-white/[0.055] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.1)] transition hover:bg-white/[0.1]">
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-white/35" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] text-white/80">{source.title}</span>
        <span className="block truncate text-[10.5px] text-white/35">{source.host}</span>
      </span>
    </a>
  ) : (
    <div className="flex items-start gap-2 rounded-xl bg-white/[0.055] px-2.5 py-2">
      <FileText className="mt-0.5 h-3 w-3 shrink-0 text-white/35" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] text-white/80">{source.title}</span>
        <span className="block truncate text-[10.5px] text-white/35">{source.host}</span>
      </span>
    </div>
  );
}

export function Inspector({ run, prompt, onClose }: { run?: Msg; prompt?: Msg; onClose: () => void }) {
  const { state } = useStore();
  const { boot } = useServer();
  const running = run?.status === "running";
  const steps = run?.steps ?? [];
  const subagents = run?.subagents ?? [];
  const usage = run?.usage;
  const estimated = usage?.estimated ? "~" : "";
  const tokensIn = usage?.inputTokens;
  const tokensOut = usage?.outputTokens;
  const toolList = [
    { id: "web", icon: Globe, name: "Web" }, { id: "code", icon: Terminal, name: "Shell" },
    { id: "files", icon: FileText, name: "Files" }, { id: "memory", icon: Brain, name: "Memory" },
  ] as const;

  const promptChars = (prompt?.full ?? prompt?.text ?? "").length;
  const provider = run?.provider ? providerMeta(run.provider).name : "";
  const toolCalls = steps.filter((step) => step.tool).length + subagents.reduce((sum, task) => sum + (task.result?.toolCalls ?? 0), 0);

  const sources = useMemo(() => {
    const out: Source[] = [];
    const seen = new Set<string>();
    const add = (source: Source) => {
      const key = source.url ?? source.title;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(source);
    };
    for (const step of steps) for (const source of step.sources ?? []) add(source);
    for (const task of subagents) for (const source of task.result?.sources ?? []) add(source);
    return out;
  }, [steps, subagents]);

  return (
    <div className="glass-css a-slide-r flex h-full w-full flex-col rounded-[30px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Activity className="h-[18px] w-[18px] accent-text" />
          <span className="font-serif text-[22px] leading-none">Run inspector</span>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/12 hover:text-white" aria-label="Hide inspector"><PanelRightClose className="h-[18px] w-[18px]" /></button>
      </div>

      <div className="scroll-thin -mr-2 min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
        {!run ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <Burst className="mb-4 h-12 w-12 opacity-80" />
            <p className="font-serif text-[22px]">Nothing running</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">Send a message and watch the agent plan, call real tools and compose its answer — step by step.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.07] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-white/45">{provider || "Model"}</div>
                <div className="truncate text-[14px] font-medium">{run.model ?? "Unknown"}</div>
              </div>
              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]", running ? "accent-soft accent-text" : run.status === "error" ? "bg-amber-300/20 text-amber-100" : run.status === "stopped" ? "bg-white/15 text-white/70" : "bg-emerald-300/20 text-emerald-100")}>
                <span className={cn("h-1.5 w-1.5 rounded-full bg-current", running && "animate-pulse")} />
                {running ? "Running" : run.status === "error" ? "Failed" : run.status === "stopped" ? "Stopped" : "Complete"}
              </span>
            </div>

            {run.research && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
                <Telescope className="h-4 w-4 accent-text" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">Deep research</div>
                  <div className="truncate text-[11px] text-white/45">Evidence gathered before the answer</div>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10.5px] text-white/55">{sources.length} sources</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Stat label="Tokens in" value={tokensIn !== undefined ? `${estimated}${compact(tokensIn)}` : "—"} />
              <Stat label="Tokens out" value={tokensOut !== undefined ? `${estimated}${compact(tokensOut)}` : "—"} />
              <Stat label="Tool calls" value={String(toolCalls)} />
              <Stat label="Latency" value={run.ms ? `${(run.ms / 1000).toFixed(1)}s` : running ? "…" : "—"} />
            </div>

            {promptChars > 0 && (
              <div className="flex items-center justify-between px-1 text-[11.5px] text-white/40">
                <span>Prompt</span>
                <span className="font-mono">{compact(promptChars)} chars</span>
              </div>
            )}

            {subagents.length > 0 && (
              <div>
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/40">Sub-agents</span>
                  <span className="font-mono text-[10.5px] text-white/30">{subagents.length}</span>
                </div>
                <div className="space-y-2">
                  {subagents.map((task) => <SubAgentRow key={task.id} task={task} />)}
                </div>
              </div>
            )}

            <div>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/40">Timeline</span>
                <span className="font-mono text-[10.5px] text-white/30">{steps.length}</span>
              </div>
              <div className="relative space-y-3 pl-1">
                <div className="absolute bottom-3 left-[17px] top-3 w-px bg-white/15" />
                {steps.map((s) => {
                  const I = STEP_ICON[s.kind];
                  const failed = s.tool?.status === "error" || s.tool?.ok === false;
                  return (
                    <div key={s.id} className="a-pop relative flex items-start gap-3">
                      <span className={cn("relative grid h-7 w-7 shrink-0 place-items-center rounded-full", s.state === "running" ? "sel-on" : failed ? "bg-amber-300/20 text-amber-100" : "bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,.35)]")}><I className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px]">{s.label}</span>
                          <span className="shrink-0 font-mono text-[11px] text-white/40">{s.ms ? `${(s.ms / 1000).toFixed(1)}s` : s.state === "running" ? "…" : ""}</span>
                        </div>
                        {s.detail && <div className="truncate font-mono text-[11px] text-white/40">{s.detail}</div>}
                        {s.summary && <div className={cn("truncate text-[11px]", failed ? "text-amber-200/80" : "text-white/40")}>{s.summary}</div>}
                      </div>
                    </div>
                  );
                })}
                {steps.length === 0 && <p className="pl-9 text-[12.5px] text-white/45">Waiting for first event…</p>}
              </div>
            </div>

            {sources.length > 0 && (
              <div>
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/40">Sources</span>
                  <span className="font-mono text-[10.5px] text-white/30">{sources.length}</span>
                </div>
                <div className="space-y-1.5">
                  {sources.map((source, index) => <SourceRow key={`${source.url ?? source.title}-${index}`} source={source} />)}
                </div>
              </div>
            )}
          </>
        )}

        <div>
          <div className="mb-2.5 px-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/40">Harness</div>
          <div className="flex flex-wrap gap-1.5">
            {toolList.map((t) => (
              <span key={t.id} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px]", state.tools[t.id] ? "sel-on" : "bg-white/[0.06] text-white/35 line-through")}><t.icon className="h-3.5 w-3.5" />{t.name}</span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
            <Gauge className="h-4 w-4 text-white/60" /> Autonomy <span className="ml-auto capitalize text-white/70">{state.autonomy === "ask" ? "Ask first" : state.autonomy}</span>
          </div>
          {boot && (
            <>
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
                <FolderOpen className="h-4 w-4 shrink-0 text-white/60" />
                <span className="shrink-0 text-white/70">Workspace</span>
                <span className="ml-auto min-w-0 truncate font-mono text-[11px] text-white/45" title={boot.workspace}>{boot.workspace}</span>
              </div>
              <p className="mt-2 px-1 text-[11.5px] text-white/35">Hikes v{boot.version} · {boot.memoryCount} memories · {boot.tokenRequired ? "token-protected" : "auth disabled"}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
