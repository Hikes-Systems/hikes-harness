import { useMemo, useState } from "react";
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
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Telescope,
  Terminal,
} from "lucide-react";
import { Burst, Spinner } from "./ui";
import { Markdown } from "./Markdown";
import type { ApprovalRequest, Msg, Source, Step, StepKind, SubAgentTask, ToolRisk, ToolStatus } from "../lib/types";
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
};

const RISK: Record<ToolRisk, { label: string; cls: string }> = {
  safe: { label: "Read-only", cls: "bg-emerald-300/15 text-emerald-100" },
  write: { label: "Writes files", cls: "bg-sky-300/15 text-sky-100" },
  execute: { label: "Runs a command", cls: "bg-amber-300/15 text-amber-100" },
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

function StepRow({ s }: { s: Step }) {
  const [open, setOpen] = useState(false);
  const Icon = STEP_ICON[s.kind];
  const tool = s.tool;
  const denied = tool?.status === "denied";
  const failed = tool?.status === "error" || tool?.ok === false;
  const pending = tool?.status === "pending";
  const expandable = Boolean(tool?.output || s.sources?.length);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl text-left outline-none",
          expandable && "cursor-pointer hover:bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "glass-css grid h-7 w-7 shrink-0 place-items-center rounded-full",
            failed && "text-amber-200",
            denied && "text-white/45",
            s.state === "running" && "sel-on",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("text-[13.5px]", s.state === "running" ? "text-white" : "text-white/80", denied && "text-white/45 line-through")}>{s.label}</span>
            {tool && <span className="text-[11px] text-white/40">{TOOL_STATUS[tool.status]}</span>}
            {s.detail && !open && <span className="max-w-[320px] truncate font-mono text-[11.5px] text-white/45">{s.detail}</span>}
          </div>
          {s.summary && <div className={cn("mt-0.5 truncate text-[11.5px]", failed ? "text-amber-200/80" : "text-white/45")}>{s.summary}</div>}
        </div>
        {s.state === "running" ? (
          <Spinner className={cn("h-3.5 w-3.5", pending ? "text-amber-200" : "text-white/70")} />
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-white/45">
            {s.ms ? formatMs(s.ms) : ""}
            {failed || denied ? <AlertTriangle className={cn("h-3.5 w-3.5", denied ? "text-white/40" : "text-amber-200")} /> : <Check className="h-3.5 w-3.5 text-emerald-300" strokeWidth={3} />}
          </span>
        )}
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
            <div className="ml-10 mt-2 space-y-2">
              {tool && (
                <div className="rounded-xl bg-black/25 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-white/65 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                  {tool.name}({Object.keys(tool.args ?? {}).length ? JSON.stringify(tool.args) : ""})
                </div>
              )}
              {tool?.output && (
                <pre className="scroll-thin max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-white/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                  {tool.output}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {s.state === "done" && s.sources && s.sources.length > 0 && (
        <div className="mb-1 ml-10 mt-2 flex flex-wrap gap-2">
          {s.sources.map((x, i) => {
            const inner = (
              <>
                <span className="block truncate text-white/90">{x.title}</span>
                <span className="block truncate text-white/45">{x.host}</span>
              </>
            );
            return x.url ? (
              <a
                key={`${x.url}-${i}`}
                href={x.url}
                target="_blank"
                rel="noreferrer"
                className="glass-css glass-hover max-w-[220px] truncate rounded-xl px-2.5 py-1.5 text-[11.5px] leading-tight outline-none"
              >
                {inner}
              </a>
            ) : (
              <span key={`${x.title}-${i}`} className="glass-css max-w-[220px] truncate rounded-xl px-2.5 py-1.5 text-[11.5px] leading-tight">
                {inner}
              </span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function Trace({ msg }: { msg: Msg }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const steps = msg.steps ?? [];
  if (!steps.length) return null;
  const running = msg.status === "running";
  const expanded = open ?? running;
  const total = steps.reduce((a, s) => a + (s.ms ?? 0), 0);
  const toolCount = steps.filter((s) => s.tool).length;
  const active = [...steps].reverse().find((s) => s.state === "running");
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(!expanded)} className="glass-css glass-hover inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-[13px] outline-none">
        <ChevronRight className={cn("h-3.5 w-3.5 text-white/60 transition-transform duration-300", expanded && "rotate-90")} />
        {running ? (
          <span className="shimmer-text">{active?.label ?? (msg.research ? "Researching first…" : "Working…")}</span>
        ) : (
          <span className="text-white/80">
            {msg.research ? "Researched" : "Ran"} {steps.length} {steps.length === 1 ? "step" : "steps"}
            {toolCount ? ` · ${toolCount} ${toolCount === 1 ? "tool" : "tools"}` : ""}
            {total ? ` · ${(total / 1000).toFixed(1)}s` : ""}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative mt-3 space-y-2.5 pl-1">
              <div className="absolute bottom-3 left-[18px] top-3 w-px bg-white/15" />
              {steps.map((s) => (
                <div key={s.id} className="relative">
                  <StepRow s={s} />
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
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="glass-css overflow-hidden rounded-2xl"
    >
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", running ? "sel-on" : failed ? "bg-amber-300/15 text-amber-100" : "bg-white/10")}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-medium">{task.title}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-white/45">
            {SUBAGENT_LABEL(task)} sub-agent · {running ? "working" : failed ? "failed" : `${task.result?.toolCalls ?? task.steps.length} tool calls`}
            {task.ms ? ` · ${(task.ms / 1000).toFixed(1)}s` : ""}
          </span>
        </span>
        {running ? <Spinner className="h-3.5 w-3.5 text-white/70" /> : failed ? <AlertTriangle className="h-4 w-4 text-amber-200" /> : <Check className="h-4 w-4 text-emerald-300" strokeWidth={3} />}
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-white/45 transition-transform duration-300", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 px-3.5 py-3">
              {task.steps.length > 0 && (
                <div className="mb-2.5 space-y-1">
                  {task.steps.map((step) => {
                    const StepIcon = STEP_ICON[step.kind];
                    return (
                      <div key={step.id} className="flex items-center gap-2 text-[11.5px] text-white/55">
                        {step.state === "running" ? <Spinner className="h-3 w-3" /> : <StepIcon className="h-3 w-3 shrink-0 text-white/35" />}
                        <span className="truncate">{step.label}</span>
                        {step.detail && <span className="ml-auto max-w-[160px] truncate font-mono text-[10.5px] text-white/30">{step.detail}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {task.result?.summary ? (
                <div className="scroll-thin max-h-[300px] overflow-y-auto rounded-xl bg-black/20 px-3 py-2.5 text-[12.5px] leading-relaxed text-white/75">
                  <Markdown text={task.result.summary} />
                </div>
              ) : running ? (
                <p className="text-[12px] text-white/45">The sub-agent is working in its own context.</p>
              ) : (
                <p className="text-[12px] text-amber-200/80">{task.error ?? "No report produced."}</p>
              )}
              {task.result?.artifacts.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {task.result.artifacts.map((artifact) => (
                    <span key={artifact.path} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10.5px] text-white/60">
                      <FileText className="h-3 w-3" />{artifact.path}
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
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 space-y-2">
      <div className="flex items-center gap-2 px-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/40">
        <Bot className="h-3.5 w-3.5" /> Delegated work
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
    <div className="mt-4">
      <button onClick={() => setOpen((v) => !v)} className="glass-css glass-hover inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-[12.5px] text-white/75 outline-none">
        <Globe className="h-3.5 w-3.5 text-white/55" />
        Sources · {sources.length}
        <span className="hidden max-w-[280px] truncate text-white/35 sm:inline">{hosts.join(" · ")}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-white/45 transition-transform duration-300", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {sources.map((source, index) => {
                const inner = (
                  <>
                    <span className="block truncate text-[12.5px] text-white/85">{source.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/40">{source.host}</span>
                  </>
                );
                return source.url ? (
                  <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="glass-css glass-hover flex items-start gap-2 rounded-xl px-3 py-2 outline-none">
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />
                    <span className="min-w-0 flex-1">{inner}</span>
                  </a>
                ) : (
                  <span key={`${source.title}-${index}`} className="glass-css flex items-start gap-2 rounded-xl px-3 py-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />
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
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.snappy}
      className="glass-css mb-4 rounded-2xl p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.2)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-300/15 text-amber-100">
          <ShieldAlert className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium">Permission needed</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider", risk.cls)}>{risk.label}</span>
          </div>
          <p className="mt-1 break-words text-[13.5px] leading-relaxed text-white/75">{request.description}</p>
          <pre className="scroll-thin mt-2.5 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-white/65">
            {JSON.stringify(request.args, null, 2)}
          </pre>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(true)}
              className="btn-primary glass-hover inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium outline-none disabled:opacity-50"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-4 w-4" />} Allow once
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(false)}
              className="glass-css glass-hover inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] text-white/80 outline-none disabled:opacity-50"
            >
              Deny
            </button>
            <span className="ml-1 text-[11.5px] text-white/40">The agent is paused until you choose.</span>
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
  return `${usage.estimated ? "~" : ""}${compact} tokens`;
}

export function MessageView({
  msg,
  onRegenerate,
  canRegenerate,
  onApprove,
  approvalBusy,
}: {
  msg: Msg;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  onApprove?: (callId: string, approve: boolean) => void;
  approvalBusy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (msg.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex justify-end">
        <div className="glass-css max-w-[85%] rounded-[26px] rounded-br-lg px-5 py-3.5 text-[15.5px] leading-relaxed" style={{ background: "linear-gradient(150deg, color-mix(in oklab, var(--accent) 26%, rgba(255,255,255,.1)), rgba(255,255,255,.06))" }}>
          {msg.files && msg.files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {msg.files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[12px]"><Paperclip className="h-3 w-3" />{f}</span>
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        </div>
      </motion.div>
    );
  }
  const running = msg.status === "running";
  const tokens = tokenLabel(msg);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex gap-4">
      <div className="mt-1 hidden h-8 w-8 shrink-0 place-items-center sm:grid"><Burst className="h-7 w-7" spin={running} /></div>
      <div className="min-w-0 flex-1">
        {msg.research && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
            <Telescope className="h-3.5 w-3.5 accent-text" /> Deep research
          </div>
        )}
        <Trace msg={msg} />
        <DelegatedWork tasks={msg.subagents ?? []} />
        {msg.approval && onApprove && (
          <ApprovalCard request={msg.approval} busy={approvalBusy} onDecide={(approve) => onApprove(msg.approval!.callId, approve)} />
        )}
        {msg.text ? (
          <div className={running ? "caret" : ""}><Markdown text={msg.text} /></div>
        ) : running && !msg.steps?.length ? (
          <span className="shimmer-text text-[14px]">{msg.research ? "Planning the research…" : "Connecting…"}</span>
        ) : running ? (
          <span className="shimmer-text text-[14px]">{msg.research ? "Researching before answering…" : "Working…"}</span>
        ) : null}
        {msg.status === "error" && (
          <div className="glass-css mt-3 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[13.5px] text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">The run failed</div>
              <div className="mt-0.5 break-words text-white/70">{msg.error}</div>
            </div>
          </div>
        )}
        {msg.status === "stopped" && <p className="mt-2 text-[12.5px] italic text-white/45">Stopped</p>}
        {!running && <SourcesBlock steps={msg.steps ?? []} subagents={msg.subagents} />}
        {!running && (msg.text || msg.status === "error") && (
          <div className="mt-3 flex flex-wrap items-center gap-1 text-white/50">
            <button onClick={() => { void navigator.clipboard?.writeText(msg.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] transition hover:bg-white/12 hover:text-white">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
            </button>
            {canRegenerate && (
              <button onClick={onRegenerate} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] transition hover:bg-white/12 hover:text-white"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
            )}
            <span className="ml-2 text-[12px] text-white/35">{msg.model}{tokens ? ` · ${tokens}` : ""}{msg.ms ? ` · ${(msg.ms / 1000).toFixed(1)}s` : ""}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
