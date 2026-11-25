import { useMemo } from "react";
import {
  Brain,
  Check,
  Cpu,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  ListTree,
  PanelRightClose,
  PenLine,
  Telescope,
  Terminal,
} from "lucide-react";
import { IconButton, Spinner } from "./ui";
import { STEP_ICON } from "./Chat";
import { useServer } from "../lib/server";
import { useStore } from "../store";
import { providerMeta } from "@shared/providers";
import type { Msg, Session, Source, SubAgentTask } from "../lib/types";
import { cn } from "../utils/cn";

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-2">
      <dt className="shrink-0 text-[12px] t-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[11.5px] t-ink2" title={title}>
        {value}
      </dd>
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
    <div className="border-b border-[var(--line)] py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3 w-3 shrink-0", running ? "t-accent" : failed ? "t-warn" : "t-faint")} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] t-ink">{task.title}</div>
          <div className="truncate text-[10px] t-faint">
            {taskName(task)} · {running ? "working" : failed ? "failed" : `${total} steps`}
            {task.ms ? ` · ${(task.ms / 1000).toFixed(1)}s` : ""}
          </div>
        </div>
        {running ? (
          <Spinner className="h-3 w-3 t-muted" />
        ) : failed ? (
          <Cpu className="h-3 w-3 t-warn" />
        ) : (
          <Check className="h-3 w-3 t-ok" strokeWidth={3} />
        )}
      </div>
      {total > 0 && (
        <div className="mt-1.5 flex items-center gap-2 pl-5">
          <div className="h-px flex-1 bg-[var(--surface-3)]">
            <div
              className="h-px transition-[width] duration-500"
              style={{ width: `${Math.round((done / total) * 100)}%`, background: failed ? "var(--warn)" : "var(--accent)" }}
            />
          </div>
          <span className="shrink-0 font-mono text-[9px] t-faint">{done}/{total}</span>
        </div>
      )}
      {task.error && <p className="mt-1 truncate pl-5 text-[10px] t-warn">{task.error}</p>}
    </div>
  );
}

function SourceRow({ source }: { source: Source }) {
  const inner = (
    <>
      <span className="block truncate text-[11.5px] t-ink2">{source.title}</span>
      <span className="block truncate text-[10px] t-faint">{source.host}</span>
    </>
  );
  return source.url ? (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-2 border-b border-[var(--line)] py-2 transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
    >
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 t-faint" />
      <span className="min-w-0 flex-1">{inner}</span>
    </a>
  ) : (
    <div className="flex items-start gap-2 border-b border-[var(--line)] py-2 last:border-b-0">
      <FileText className="mt-0.5 h-3 w-3 shrink-0 t-faint" />
      <span className="min-w-0 flex-1">{inner}</span>
    </div>
  );
}

function SectionLabel({ children, count }: { children: string; count?: number }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <h3 className="text-[12px] font-medium t-ink">{children}</h3>
      {count !== undefined && <span className="font-mono text-[10px] t-faint">{count}</span>}
    </div>
  );
}

export function Inspector({
  run,
  prompt,
  session,
  onClose,
}: {
  run?: Msg;
  prompt?: Msg;
  session?: Session;
  onClose: () => void;
}) {
  const { state } = useStore();
  const { boot } = useServer();
  const workspaceFolder = boot?.workspace.split(/[\\/]/).filter(Boolean).pop() ?? boot?.workspace ?? "";
  const running = run?.status === "running";
  const steps = run?.steps ?? [];
  const subagents = run?.subagents ?? [];
  const usage = run?.usage;
  const estimated = usage?.estimated ? "~" : "";
  const tokensIn = usage?.inputTokens;
  const tokensOut = usage?.outputTokens;
  const toolList = [
    { id: "web", icon: Globe, name: "Web" },
    { id: "code", icon: Terminal, name: "Shell" },
    { id: "files", icon: FileText, name: "Files" },
    { id: "memory", icon: Brain, name: "Memory" },
  ] as const;

  const promptChars = (prompt?.full ?? prompt?.text ?? "").length;
  const provider = run?.provider ? providerMeta(run.provider).name : "";
  const cachedTokens = usage?.cachedTokens ?? 0;
  const toolCalls = steps.filter((step) => step.tool).length + subagents.reduce((sum, task) => sum + (task.result?.toolCalls ?? 0), 0);

  const cost = usage?.costUsd;
  const contextWindow = usage?.contextWindow;
  const contextUsed = usage?.contextUsed;

  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    let spent = 0;
    let priced = false;
    for (const message of session?.messages ?? []) {
      const u = message.usage;
      if (!u) continue;
      input += u.inputTokens ?? 0;
      output += u.outputTokens ?? 0;
      if (u.costUsd !== undefined) {
        spent += u.costUsd;
        priced = true;
      }
    }
    return { input, output, spent, priced };
  }, [session?.messages]);

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

  const status = run
    ? running
      ? { label: "Running", tone: "t-accent" }
      : run.status === "error"
        ? { label: "Failed", tone: "t-danger" }
        : run.status === "stopped"
          ? { label: "Stopped", tone: "t-muted" }
          : { label: "Complete", tone: "t-ok" }
    : { label: "Idle", tone: "t-faint" };

  return (
    <div className="flex h-full w-full flex-col">
      <header className="shrink-0 border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold t-ink">Activity</h2>
            <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status.tone, running && "animate-pulse")} />
            <span className={cn("text-[11px]", status.tone)}>{status.label}</span>
          </div>
          <IconButton onClick={onClose} aria-label="Close activity" title="Close activity">
            <PanelRightClose className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pb-5 pt-4">
          {!run ? (
            <>
              <dl>
                <Row label="Tokens" value="—" />
                <Row label="Steps" value="0" />
                <Row label="Context" value="—" />
              </dl>
              <p className="mt-4 text-[12.5px] leading-relaxed t-muted">
                No activity yet. Steps appear here as the agent works: tool calls, sources and the tokens
                each run cost.
              </p>

              <div className="mt-6">
                <SectionLabel>Available tools</SectionLabel>
                <div className="grid grid-cols-2 gap-x-3">
                  {toolList.map((tool) => (
                    <div key={tool.id} className="flex items-center gap-1.5 py-1 text-[12px]">
                      <span className={cn("h-1 w-1 rounded-full", state.tools[tool.id] ? "bg-[var(--ok)]" : "bg-[var(--line-strong)]")} />
                      <tool.icon className="h-3 w-3 shrink-0 t-faint" />
                      <span className={state.tools[tool.id] ? "t-ink2" : "t-faint line-through"}>{tool.name}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-[var(--line)] py-2 text-[10.5px] t-faint">
                  <span>Autonomy</span>
                  <span className="capitalize t-muted">{state.autonomy === "ask" ? "Ask first" : state.autonomy}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[var(--line)] pb-3">
                <div className="text-[10.5px] t-faint">{provider || "Model"}</div>
                <div className="mt-0.5 truncate text-[13px] t-ink">{run.model ?? "Unknown"}</div>
              </div>

              <dl className="mt-1">
                <Row label="Tokens in" value={tokensIn !== undefined ? `${estimated}${compact(tokensIn)}` : "—"} />
                <Row label="Tokens out" value={tokensOut !== undefined ? `${estimated}${compact(tokensOut)}` : "—"} />
                <Row label="Tool calls" value={String(toolCalls)} />
                <Row label="Latency" value={run.ms ? `${(run.ms / 1000).toFixed(1)}s` : running ? "…" : "—"} />
                {cost !== undefined && (
                  <Row
                    label="Cost"
                    value={cost === 0 ? "$0.00" : cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`}
                  />
                )}
                {contextWindow !== undefined && (
                  <Row
                    label="Context"
                    value={`${contextUsed !== undefined ? `${Math.round(contextUsed * 100)}% of ` : ""}${compact(contextWindow)}`}
                  />
                )}
                {promptChars > 0 && <Row label="Prompt" value={`${compact(promptChars)} chars`} />}
              </dl>

              {run.research && (
                <div className="mt-4 flex items-start gap-2 border-l-2 border-[var(--accent)] pl-3">
                  <Telescope className="mt-0.5 h-3.5 w-3.5 shrink-0 t-accent" />
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium t-ink">Deep research</div>
                    <div className="text-[10.5px] leading-relaxed t-muted">
                      Evidence gathered before the answer · {sources.length} sources
                    </div>
                  </div>
                </div>
              )}

              {cachedTokens > 0 && (
                <p className="mt-3 text-[10.5px] leading-relaxed t-faint">
                  {compact(cachedTokens)} prompt tokens were reused from the provider cache.
                </p>
              )}

              {session && (totals.input > 0 || totals.output > 0) && (
                <div className="mt-5">
                  <SectionLabel>Session total</SectionLabel>
                  <dl>
                    <Row label="Input" value={compact(totals.input)} />
                    <Row label="Output" value={compact(totals.output)} />
                    <Row label="Total" value={compact(totals.input + totals.output)} />
                    <Row
                      label="Spent"
                      value={
                        totals.priced
                          ? totals.spent < 0.01
                            ? `$${totals.spent.toFixed(4)}`
                            : `$${totals.spent.toFixed(2)}`
                          : "cost n/a"
                      }
                    />
                  </dl>
                </div>
              )}

              {subagents.length > 0 && (
                <div className="mt-5">
                  <SectionLabel count={subagents.length}>Sub-agents</SectionLabel>
                  {subagents.map((task) => (
                    <SubAgentRow key={task.id} task={task} />
                  ))}
                </div>
              )}

              <div className="mt-5">
                <SectionLabel count={steps.length}>Timeline</SectionLabel>
                <div className="relative">
                  {steps.length > 0 && <div className="absolute bottom-2 left-[9px] top-2 w-px bg-[var(--line)]" />}
                  {steps.map((s) => {
                    const I = STEP_ICON[s.kind];
                    const failed = s.tool?.status === "error" || s.tool?.ok === false;
                    return (
                      <div key={s.id} className="a-pop relative flex items-start gap-2.5 py-1">
                        <span
                          className={cn(
                            "relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center border bg-[var(--surface)]",
                            s.state === "running"
                              ? "border-[var(--accent)] t-accent"
                              : failed
                                ? "border-[var(--line)] t-warn"
                                : "border-[var(--line)] t-faint",
                          )}
                        >
                          <I className="h-2.5 w-2.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[11px] t-ink2">{s.label}</span>
                            <span className="shrink-0 font-mono text-[9.5px] t-faint">
                              {s.ms ? `${(s.ms / 1000).toFixed(1)}s` : s.state === "running" ? "…" : ""}
                            </span>
                          </div>
                          {s.detail && <div className="truncate font-mono text-[9.5px] t-faint">{s.detail}</div>}
                          {s.summary && <div className={cn("truncate text-[10px]", failed ? "t-warn" : "t-faint")}>{s.summary}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {steps.length === 0 && <p className="text-[11px] t-faint">Waiting for the first event…</p>}
                </div>
              </div>

              {sources.length > 0 && (
                <div className="mt-5">
                  <SectionLabel count={sources.length}>Sources</SectionLabel>
                  {sources.map((source, index) => (
                    <SourceRow key={`${source.url ?? source.title}-${index}`} source={source} />
                  ))}
                </div>
              )}

              <div className="mt-5">
                <SectionLabel>Harness</SectionLabel>
                <div className="grid grid-cols-2 gap-x-3">
                  {toolList.map((t) => (
                    <div key={t.id} className="flex items-center gap-1.5 py-1 text-[12px]">
                      <span className={cn("h-1 w-1 rounded-full", state.tools[t.id] ? "bg-[var(--ok)]" : "bg-[var(--line-strong)]")} />
                      <t.icon className="h-3 w-3 shrink-0 t-faint" />
                      <span className={state.tools[t.id] ? "t-ink2" : "t-faint line-through"}>{t.name}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-[var(--line)] py-2 text-[10.5px] t-faint">
                  <span>Autonomy</span>
                  <span className="capitalize t-muted">{state.autonomy === "ask" ? "Ask first" : state.autonomy}</span>
                </div>
              </div>
            </>
          )}

          <div className="mt-5 border-t border-[var(--line)] pt-2.5">
            <div className="flex items-center gap-2 py-0.5">
              <FolderOpen className="h-3 w-3 shrink-0 t-faint" />
              <span className="shrink-0 text-[10.5px] t-faint">Workspace</span>
              <span className="ml-auto min-w-0 truncate font-mono text-[9.5px] t-muted" title={boot?.workspace}>
                {workspaceFolder}
              </span>
            </div>
            {boot && (
              <p className="mt-1.5 text-[9.5px] leading-relaxed t-faint">
                Hikes v{boot.version} · {boot.memoryCount} memories · {boot.tokenRequired ? "token-protected" : "auth disabled"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
