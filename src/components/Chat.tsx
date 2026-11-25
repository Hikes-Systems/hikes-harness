import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  FileText,
  Globe,
  Minimize2,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Telescope,
  Terminal,
  Undo2,
} from "lucide-react";
import { MountainMark, Spinner } from "./ui";
import { Markdown } from "./Markdown";
import type {
  ApprovalRequest,
  FileChange,
  Msg,
  Source,
  Step,
  StepKind,
  SubAgentTask,
  ToolRisk,
  ToolStatus,
} from "../lib/types";
import { cn } from "../utils/cn";
import { spring } from "../lib/motion";

export const STEP_ICON: Record<StepKind, typeof Search> = {
  think: Search,
  search: Globe,
  file: FileText,
  code: Terminal,
  memory: Brain,
  write: PenLine,
  research: Telescope,
  agent: Cpu,
  compact: Minimize2,
};

const RISK: Record<ToolRisk, { label: string; cls: string }> = {
  safe: { label: "Read-only", cls: "border-[var(--line)] bg-ok-soft t-ok" },
  write: { label: "Writes files", cls: "border-[var(--line)] bg-accent-soft t-accent" },
  execute: { label: "Runs a command", cls: "border-[var(--line)] bg-warn-soft t-warn" },
};

const TOOL_STATUS: Record<ToolStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  denied: "Denied",
  done: "Done",
  error: "Failed",
};

const SUBAGENT_ICON = (task: SubAgentTask) => {
  if (task.type === "coder") return Terminal;
  if (task.type === "writer") return PenLine;
  if (task.type === "researcher") return Telescope;
  if (task.type === "analyst") return Brain;
  return Cpu;
};

const SUBAGENT_LABEL = (task: SubAgentTask) =>
  task.type === "researcher"
    ? "Researcher"
    : task.type === "coder"
      ? "Coder"
      : task.type === "analyst"
        ? "Analyst"
        : task.type === "writer"
          ? "Writer"
          : "Planner";

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function DiffView({ change }: { change: FileChange }) {
  const lines = change.diff.split("\n");
  return (
    <div className="overflow-hidden border border-[var(--line)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-1.5">
        <span className="truncate font-mono text-[11px] t-muted">{change.path}</span>
        <span className="shrink-0 font-mono text-[10.5px]">
          <span className="t-ok">+{change.additions}</span>{" "}
          <span className="t-warn">-{change.deletions}</span>
        </span>
      </div>
      <pre className="scroll-thin max-h-[240px] overflow-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed">
        {lines.map((line, index) => (
          <span
            key={index}
            className={cn(
              "block whitespace-pre-wrap break-words",
              line.startsWith("@@")
                ? "t-faint"
                : line.startsWith("+")
                  ? "t-ok"
                  : line.startsWith("-")
                    ? "t-warn"
                    : "t-ink2",
            )}
          >
            {line || " "}
          </span>
        ))}
      </pre>
    </div>
  );
}

function StepRow({
  s,
  onRevert,
  revertBusy,
}: {
  s: Step;
  onRevert?: (stepId: string) => void;
  revertBusy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = STEP_ICON[s.kind];
  const tool = s.tool;
  const denied = tool?.status === "denied";
  const failed = tool?.status === "error" || tool?.ok === false;
  const pending = tool?.status === "pending";
  const changes = tool?.changes ?? [];
  const expandable = Boolean(tool?.output || s.sources?.length || changes.length);

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        className={cn(
          "flex w-full items-center gap-2.5 px-1 py-1.5 text-left outline-none",
          expandable && "cursor-pointer transition-colors hover-s2",
        )}
      >
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center border",
            failed
              ? "border-[var(--line)] bg-warn-soft t-warn"
              : denied
                ? "border-[var(--line)] bg-surface2 t-faint"
                : s.state === "running"
                  ? "border-[var(--accent-line)] bg-accent-soft t-accent"
                  : "border-[var(--line)] bg-surface2 t-muted",
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                "text-[12.5px]",
                s.state === "running" ? "t-ink" : "t-ink2",
                denied && "t-faint line-through",
              )}
            >
              {s.label}
            </span>
            {tool && <span className="text-[10.5px] t-faint">{TOOL_STATUS[tool.status]}</span>}
            {s.detail && !open && (
              <span className="max-w-[320px] truncate font-mono text-[10.5px] t-faint">{s.detail}</span>
            )}
          </div>
          {s.summary && (
            <div className={cn("mt-0.5 truncate text-[11px]", failed ? "t-warn" : "t-muted")}>{s.summary}</div>
          )}
        </div>
        {s.state === "running" ? (
          <Spinner className={cn("h-3 w-3", pending ? "t-warn" : "t-muted")} />
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] t-faint">
            {s.ms ? formatMs(s.ms) : ""}
            {failed || denied ? (
              <AlertTriangle className={cn("h-3 w-3", denied ? "t-faint" : "t-warn")} />
            ) : (
              <Check className="h-3 w-3 t-ok" strokeWidth={3} />
            )}
          </span>
        )}
      </button>

      {changes.length ? (
        <div className="ml-[34px] mt-1.5 flex flex-wrap items-center gap-1.5">
          {changes.map((change) => (
            <span
              key={change.snapshotId ?? change.path}
              className="inline-flex max-w-[280px] items-center gap-1.5 border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] t-muted"
            >
              <FileText className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{change.path}</span>
              <span className="shrink-0 t-ok">+{change.additions}</span>
              <span className="shrink-0 t-warn">-{change.deletions}</span>
            </span>
          ))}
          {changes.every((change) => change.reverted) ? (
            <span className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-ok-soft px-2 py-1 text-[10.5px] t-ok">
              <Check className="h-3 w-3" /> Reverted to this step
            </span>
          ) : (
            <button
              type="button"
              disabled={revertBusy || !onRevert}
              onClick={() => onRevert?.(s.id)}
              className="btn-secondary inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[10.5px] outline-none disabled:opacity-50"
            >
              {revertBusy ? <Spinner className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}
              Revert to this step
            </button>
          )}
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-[34px] mt-1.5 space-y-1.5">
              {tool && (
                <div className="rounded-md border border-[var(--line)] bg-[var(--code-bg)] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed t-muted">
                  {tool.name}({Object.keys(tool.args ?? {}).length ? JSON.stringify(tool.args) : ""})
                </div>
              )}
              {changes.map((change) => (
                <DiffView key={change.snapshotId ?? change.path} change={change} />
              ))}
              {tool?.output && (
                <pre className="scroll-thin max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--line)] bg-[var(--code-bg)] px-2.5 py-2 font-mono text-[11px] leading-relaxed t-ink2">
                  {tool.output}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {s.state === "done" && s.sources && s.sources.length > 0 && (
        <div className="mb-1 ml-[34px] mt-1.5 flex flex-wrap gap-1.5">
          {s.sources.map((x, i) => {
            const inner = (
              <>
                <span className="block truncate text-[11px] t-ink2">{x.title}</span>
                <span className="block truncate text-[10px] t-faint">{x.host}</span>
              </>
            );
            return x.url ? (
              <a
                key={`${x.url}-${i}`}
                href={x.url}
                target="_blank"
                rel="noreferrer"
                className="max-w-[220px] truncate rounded-md border border-[var(--line)] bg-surface px-2 py-1 text-[11px] leading-tight outline-none transition-colors hover-s2"
              >
                {inner}
              </a>
            ) : (
              <span
                key={`${x.title}-${i}`}
                className="max-w-[220px] truncate rounded-md border border-[var(--line)] bg-surface px-2 py-1 text-[11px] leading-tight"
              >
                {inner}
              </span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function Trace({
  msg,
  onRevert,
  revertBusy,
}: {
  msg: Msg;
  onRevert?: (stepId: string) => void;
  revertBusy?: boolean;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const steps = msg.steps ?? [];
  if (!steps.length) return null;
  const running = msg.status === "running";
  const expanded = open ?? running;
  const total = steps.reduce((a, s) => a + (s.ms ?? 0), 0);
  const toolCount = steps.filter((s) => s.tool).length;
  const active = [...steps].reverse().find((s) => s.state === "running");
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!expanded)}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[12px] outline-none transition-colors hover-s2"
      >
        <ChevronRight
          className={cn("h-3 w-3 t-faint transition-transform duration-200", expanded && "rotate-90")}
        />
        {running ? (
          <span className="shimmer-text">{active?.label ?? (msg.research ? "Researching first…" : "Working…")}</span>
        ) : (
          <span className="t-muted">
            {msg.research ? "Researched" : "Ran"} {steps.length} {steps.length === 1 ? "step" : "steps"}
            {toolCount ? `, ${toolCount} ${toolCount === 1 ? "tool" : "tools"}` : ""}
            {total ? `, ${(total / 1000).toFixed(1)}s` : ""}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative mt-2 space-y-1 pl-0.5">
              <div className="absolute bottom-3 left-[13px] top-3 w-px bg-[var(--line)]" />
              {steps.map((s) => (
                <div key={s.id} className="relative">
                  <StepRow s={s} onRevert={onRevert} revertBusy={revertBusy} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SubAgentCard({ task }: { task: SubAgentTask }) {
  const [open, setOpen] = useState(task.status === "running");
  const Icon = SUBAGENT_ICON(task);
  const running = task.status === "running";
  const failed = task.status === "error";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="overflow-hidden border-y border-[var(--line)] bg-surface"
    >
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover-s2">
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center border",
            running
              ? "border-[var(--accent-line)] bg-accent-soft t-accent"
              : failed
                ? "border-[var(--line)] bg-warn-soft t-warn"
                : "border-[var(--line)] bg-surface2 t-muted",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12.5px] font-medium t-ink">{task.title}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] t-muted">
            {SUBAGENT_LABEL(task)} sub-agent · {running ? "working" : failed ? "failed" : `${task.result?.toolCalls ?? task.steps.length} tool calls`}
            {task.ms ? ` · ${(task.ms / 1000).toFixed(1)}s` : ""}
          </span>        </span>
        {running ? (
          <Spinner className="h-3.5 w-3.5 t-muted" />
        ) : failed ? (
          <AlertTriangle className="h-3.5 w-3.5 t-warn" />
        ) : (
          <Check className="h-3.5 w-3.5 t-ok" strokeWidth={3} />
        )}
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 t-faint transition-transform duration-200", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--line)] px-3 py-2.5">
              {task.steps.length > 0 && (
                <div className="mb-2 space-y-1">
                  {task.steps.map((step) => {
                    const StepIcon = STEP_ICON[step.kind];
                    return (
                      <div key={step.id} className="flex items-center gap-2 text-[11px] t-muted">
                        {step.state === "running" ? <Spinner className="h-3 w-3" /> : <StepIcon className="h-3 w-3 shrink-0 t-faint" />}
                        <span className="truncate">{step.label}</span>
                        {step.detail && <span className="ml-auto max-w-[160px] truncate font-mono text-[10px] t-faint">{step.detail}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {task.result?.summary ? (
                <div className="scroll-thin max-h-[300px] overflow-y-auto border-y border-[var(--line)] py-2 text-[12px] leading-relaxed">
                  <Markdown text={task.result.summary} />
                </div>
              ) : running ? (
                <p className="text-[11.5px] t-muted">The sub-agent is working in its own context.</p>
              ) : (
                <p className="text-[11.5px] t-warn">{task.error ?? "No report produced."}</p>
              )}
              {task.result?.artifacts.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {task.result.artifacts.map((artifact) => (
                    <span key={artifact.path} className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-surface2 px-2 py-1 font-mono text-[10px] t-muted">
                      <FileText className="h-2.5 w-2.5" />{artifact.path}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DelegatedWork({ tasks }: { tasks: SubAgentTask[] }) {
  if (!tasks.length) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5 px-0.5 text-[10.5px] font-medium t-faint">
        <Bot className="h-3 w-3" /> Delegated work
      </div>
      {tasks.map((task) => <SubAgentCard key={task.id} task={task} />)}
    </motion.div>
  );
}

function SourcesBlock({ steps, subagents }: { steps: Step[]; subagents?: SubAgentTask[] }) {
  const [open, setOpen] = useState(false);
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
    for (const task of subagents ?? []) for (const source of task.result?.sources ?? []) add(source);
    return out;
  }, [steps, subagents]);
  if (!sources.length) return null;
  const hosts = [...new Set(sources.map((source) => source.host).filter(Boolean))].slice(0, 3);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[11.5px] t-muted outline-none transition-colors hover-s2 hover-ink"
      >
        <Globe className="h-3 w-3 t-faint" />
        Sources · {sources.length}
        <span className="hidden max-w-[280px] truncate t-faint sm:inline">{hosts.join(" · ")}</span>
        <ChevronRight className={cn("h-3 w-3 t-faint transition-transform duration-200", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 grid gap-x-4 border-t border-[var(--line)] sm:grid-cols-2">
              {sources.map((source, index) => {
                const inner = (
                  <>
                    <span className="block truncate text-[11px] t-ink2">{source.title}</span>
                    <span className="mt-0.5 block truncate text-[10px] t-faint">{source.host}</span>
                  </>
                );
                return source.url ? (
                  <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 border-b border-[var(--line)] py-1.5 outline-none transition-colors hover-s2">
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 t-faint" />
                    <span className="min-w-0 flex-1">{inner}</span>
                  </a>
                ) : (
                  <span key={`${source.title}-${index}`} className="flex items-start gap-2 border-b border-[var(--line)] py-1.5">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 t-faint" />
                    <span className="min-w-0 flex-1">{inner}</span>
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ApprovalCard({ request, busy, onDecide }: { request: ApprovalRequest; busy?: boolean; onDecide: (approve: boolean) => void }) {
  const risk = RISK[request.risk];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.snappy}
      className="mb-4 border-l-2 border-[var(--accent)] bg-[var(--surface-2)] py-3 pl-3 pr-3"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center border border-[var(--line)] bg-surface t-warn">
          <ShieldAlert className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium t-ink">Permission needed</span>
            <span className={cn("rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-medium", risk.cls)}>
              {risk.label}
            </span>
          </div>
          <p className="mt-1 break-words text-[12px] leading-relaxed t-muted">{request.description}</p>
          <pre className="scroll-thin mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap break-words border border-[var(--line)] bg-[var(--code-bg)] px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed t-ink2">
            {JSON.stringify(request.args, null, 2)}
          </pre>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(true)}
              className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-[12px] font-medium outline-none disabled:opacity-50"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />} Allow once
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(false)}
              className="btn-secondary inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-[12px] outline-none disabled:opacity-50"
            >
              Deny
            </button>
            <span className="text-[10.5px] t-faint">The agent is paused until you choose.</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function tokenLabel(msg: Msg): string {
  const usage = msg.usage;
  if (!usage) return "";
  const total = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  if (!total) return "";
  const compact = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);
  const mark = usage.estimated ? "~" : "";
  // A cached prompt was paid for once. Say how much of it was free.
  const cached = usage.cachedTokens ?? 0;
  if (cached > 0) {
    const fresh = Math.max(0, total - cached);
    const freshLabel = fresh >= 1000 ? `${(fresh / 1000).toFixed(1)}k` : String(fresh);
    const cachedLabel = cached >= 1000 ? `${(cached / 1000).toFixed(1)}k` : String(cached);
    return `${mark}${freshLabel} new · ${cachedLabel} cached`;
  }
  return `${mark}${compact} tokens`;
}

function costLabel(msg: Msg): string {
  const cost = msg.usage?.costUsd;
  if (cost === undefined) return "";
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export const MessageView = memo(function MessageView({
  msg,
  onRegenerate,
  canRegenerate,
  onApprove,
  approvalBusy,
  onRevertStep,
  revertBusy,
}: {
  msg: Msg;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  onApprove?: (callId: string, approve: boolean) => void;
  approvalBusy?: boolean;
  onRevertStep?: (stepId: string) => void;
  revertBusy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (msg.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="flex flex-col items-end py-4 first:pt-2"
      >
        <span className="mb-1.5 pr-1 text-[11px] font-medium t-faint">You</span>
        <div className="max-w-[min(76%,620px)] rounded-[16px] rounded-br-[6px] bg-surface3 px-4 py-3">
          {msg.files && msg.files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {msg.files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10.5px] t-muted">
                  <Paperclip className="h-2.5 w-2.5" />{f}
                </span>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words text-[15.5px] leading-[1.65] t-ink">{msg.text}</div>
        </div>
      </motion.div>
    );
  }
  const running = msg.status === "running";
  const tokens = tokenLabel(msg);
  const cost = costLabel(msg);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="py-6 first:pt-2"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <MountainMark className="h-6 w-6" />
        <span className="text-[12.5px] font-semibold t-ink">Hikes</span>
        {running && <span className="text-[11px] t-faint">Working</span>}
      </div>
      <div className="min-w-0">
        {msg.research && (
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10.5px] font-medium t-accent">
            <Telescope className="h-3 w-3" /> Deep research
          </div>
        )}
        <Trace msg={msg} onRevert={onRevertStep} revertBusy={revertBusy} />
        <DelegatedWork tasks={msg.subagents ?? []} />
        {msg.approval && onApprove && (
          <ApprovalCard request={msg.approval} busy={approvalBusy} onDecide={(approve) => onApprove(msg.approval!.callId, approve)} />
        )}
        {msg.text ? (
          <div className={running ? "caret" : ""}><Markdown text={msg.text} /></div>
        ) : running && !msg.steps?.length ? (
          <span className="shimmer-text text-[13px]">{msg.research ? "Planning the research…" : "Connecting…"}</span>
        ) : running ? (
          <span className="shimmer-text text-[13px]">{msg.research ? "Researching before answering…" : "Working…"}</span>
        ) : null}
        {msg.status === "error" && (
          <div className="mt-3 flex items-start gap-2 border-l-2 border-[var(--danger)] bg-danger-soft px-3 py-2 text-[12px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 t-danger" />
            <div>
              <div className="font-medium t-danger">The run failed</div>
              <div className="mt-0.5 break-words t-ink2">{msg.error}</div>
            </div>
          </div>
        )}
        {msg.status === "stopped" && <p className="mt-2 text-[11px] italic t-faint">Stopped</p>}
        {!running && <SourcesBlock steps={msg.steps ?? []} subagents={msg.subagents} />}
        {!running && (msg.text || msg.status === "error") && (
          <div className="mt-2 flex flex-wrap items-center gap-0.5 t-faint">
            <button
              onClick={() => { void navigator.clipboard?.writeText(msg.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[11px] transition-colors hover-s2 hover-ink"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? "Copied" : "Copy"}
            </button>
            {canRegenerate && (
              <button onClick={onRegenerate} className="inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[11px] transition-colors hover-s2 hover-ink">
                <RefreshCw className="h-3 w-3" />Retry
              </button>
            )}
            <span className="ml-2 text-[10px] t-faint">
              {msg.model}{tokens ? ` · ${tokens}` : ""}{cost ? ` · ${cost}` : ""}{msg.ms ? ` · ${(msg.ms / 1000).toFixed(1)}s` : ""}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
});
