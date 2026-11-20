import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Compass,
  Download,
  ListChecks,
  Minimize2,
  PanelLeft,
  PanelRight,
  Palette,
  PenLine,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { Composer, type Attachment } from "./Composer";
import { MessageView } from "./Chat";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { Settings, type SettingsTab } from "./Settings";
import { CommandPalette } from "./CommandPalette";
import { Burst, Spinner } from "./ui";
import { useStore } from "../store";
import { useServer } from "../lib/server";
import { AGENTS, DEFAULT_AGENT_ID } from "@shared/agents";
import { resolveAgent } from "../lib/mascots";
import { providerMeta } from "@shared/providers";
import type { Msg, RunRequest, Session, SessionSummary } from "@shared/protocol";
import {
  cancelRun,
  compactSession,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  patchSession,
  resolveApproval,
  revertStep,
  streamRun,
} from "../lib/api";
import { SCENES } from "../lib/scenes";
import { ease, pop, spring } from "../lib/motion";
import { cn } from "../utils/cn";

const CHIPS = [
  { icon: PenLine, label: "Write", seed: "Help me write " },
  { icon: BookOpen, label: "Learn", seed: "Explain to me how " },
  { icon: Code2, label: "Code", seed: "Write a function that " },
  { icon: ListChecks, label: "Plan", seed: "Plan a weekend " },
  { icon: Compass, label: "Research", seed: "Research the latest on " },
];
const EXAMPLES = ["Plan a weekend hike", "Why do glaciers move?", "Write a mountain haiku"];

const titleFrom = (text: string) => (text || "New session").replace(/\s+/g, " ").trim().slice(0, 60) || "New session";
const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "session";

function AgentMenu({
  current,
  disabled,
  onPick,
  onClose,
}: {
  current: string;
  disabled?: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const selectedId = resolveAgent(current, state.agents).id;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        variants={pop}
        initial="hidden"
        animate="show"
        exit="exit"
        className="glass-shell absolute left-0 top-full z-50 mt-2 w-[min(300px,86vw)] overflow-hidden rounded-3xl p-1.5"
      >
        {AGENTS.map((definition) => {
          const agent = resolveAgent(definition.id, state.agents);
          const Icon = agent.Icon;
          const on = agent.id === selectedId;
          return (
            <button
              key={agent.id}
              disabled={disabled}
              onClick={() => {
                onPick(agent.id);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors disabled:opacity-50",
                on ? "bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,.24)]" : "hover:bg-white/[0.08]",
              )}
            >
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", on ? "sel-on" : "bg-white/[0.08]")}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{agent.name}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-white/45">{agent.desc}</span>
              </span>
              {on && <Check className="h-4 w-4 shrink-0 accent-text" strokeWidth={3} />}
            </button>
          );
        })}
      </motion.div>
    </>
  );
}

export function Harness() {
  const { state, set } = useStore();
  const { boot, saveSettings } = useServer();
  const models = boot?.models ?? [];
  const modelKey = models.some((m) => m.key === state.defaultModel)
    ? state.defaultModel
    : boot?.defaultModel && models.some((m) => m.key === boot.defaultModel)
      ? boot.defaultModel
      : models[0]?.key ?? "";
  const model = models.find((m) => m.key === modelKey);

  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [sidebar, setSidebar] = useState(() => window.innerWidth >= 1024);
  const [inspector, setInspector] = useState(false);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [palette, setPalette] = useState(false);
  const [agentMenu, setAgentMenu] = useState(false);
  const [exported, setExported] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [revertBusy, setRevertBusy] = useState(false);
  const [compactBusy, setCompactBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const agent = resolveAgent(active?.agent ?? DEFAULT_AGENT_ID, state.agents);
  const AgentIcon = agent.Icon;
  const empty = !active || active.messages.length === 0;

  const refreshSummaries = useCallback(async () => {
    try {
      setSummaries(await listSessions());
    } catch {
      /* the next interaction will retry */
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let list = await listSessions();
      if (!list.length) {
        const created = await createSession(DEFAULT_AGENT_ID);
        list = await listSessions();
        setSummaries(list);
        setActive(created);
      } else {
        setSummaries(list);
        setActive(await getSession(list[0].id));
      }
    } catch (caught) {
      setLoadError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** Undo the file changes made by one step and mark the card as reverted. */
  const revertToStep = useCallback(
    async (stepId: string) => {
      const sessionId = active?.id;
      if (!sessionId) return;
      setRevertBusy(true);
      setRunError(null);
      try {
        const result = await revertStep(sessionId, stepId);
        setActive((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((message) => ({
                  ...message,
                  steps: message.steps?.map((step) =>
                    step.id === stepId && step.tool?.changes
                      ? {
                          ...step,
                          tool: {
                            ...step.tool,
                            changes: step.tool.changes.map((change) => ({ ...change, reverted: true })),
                          },
                        }
                      : step,
                  ),
                })),
              }
            : prev,
        );
        setNotice(
          result.reverted.length
            ? `Reverted ${result.reverted.length} file${result.reverted.length === 1 ? "" : "s"}.`
            : "Nothing to revert.",
        );
      } catch (caught) {
        setRunError(errorText(caught));
      } finally {
        setRevertBusy(false);
      }
    },
    [active?.id],
  );

  /** Fold the older turns of this session into a digest. */
  const compactContext = useCallback(async () => {
    const sessionId = active?.id;
    if (!sessionId) return;
    setCompactBusy(true);
    setRunError(null);
    try {
      const result = await compactSession(sessionId);
      setNotice(
        `Compacted ${result.compactedMessages} earlier message${result.compactedMessages === 1 ? "" : "s"} · ~${result.savedTokens.toLocaleString()} tokens saved.`,
      );
    } catch (caught) {
      setRunError(errorText(caught));
    } finally {
      setCompactBusy(false);
    }
  }, [active?.id]);

  const lastRun = active ? [...active.messages].reverse().find((m) => m.role === "assistant") : undefined;
  const lastPrompt = lastRun && active ? active.messages[active.messages.indexOf(lastRun) - 1] : undefined;

  const tail = lastRun
    ? lastRun.text.length +
      (lastRun.steps?.length ?? 0) +
      (lastRun.subagents?.length ?? 0) +
      (lastRun.approval ? 1 : 0)
    : 0;
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [tail, active?.messages.length, active?.id]);

  const patchMessage = useCallback((id: string, fn: (m: Msg) => Msg) => {
    setActive((prev) =>
      prev ? { ...prev, messages: prev.messages.map((m) => (m.id === id ? fn(m) : m)) } : prev,
    );
  }, []);

  const startRun = useCallback(
    async (payload: RunRequest, truncateFrom?: number) => {
      setRunning(true);
      setRunError(null);
      setApprovalBusy(false);
      stick.current = true;
      if (truncateFrom !== undefined) {
        setActive((prev) => (prev ? { ...prev, messages: prev.messages.slice(0, truncateFrom) } : prev));
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let assistantId = "";
      let buffer = "";
      let timer = 0;
      let ended = false;

      const flush = () => {
        timer = 0;
        const chunk = buffer;
        buffer = "";
        if (!chunk || !assistantId) return;
        setActive((prev) =>
          prev && prev.id === payload.sessionId
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantId ? { ...m, text: m.text + chunk } : m,
                ),
              }
            : prev,
        );
      };

      try {
        for await (const event of streamRun(payload, controller.signal)) {
          switch (event.type) {
            case "ping":
              break;
            case "run.start": {
              assistantId = event.assistantMessage.id;
              runIdRef.current = event.runId;
              setActive((prev) =>
                prev && prev.id === payload.sessionId
                  ? {
                      ...prev,
                      title: prev.messages.length ? prev.title : titleFrom(event.userMessage.text),
                      messages: [...prev.messages, event.userMessage, event.assistantMessage],
                    }
                  : prev,
              );
              break;
            }
            case "step.start":
              if (!assistantId) break;
              patchMessage(assistantId, (m) => ({
                ...m,
                steps: [...(m.steps ?? []), event.step],
              }));
              break;
            case "step.done":
              if (!assistantId) break;
              patchMessage(assistantId, (m) => ({
                ...m,
                steps: (m.steps ?? []).map((s) =>
                  s.id === event.id
                    ? {
                        ...s,
                        state: "done" as const,
                        ms: event.ms,
                        detail: event.detail ?? s.detail,
                        summary: event.summary ?? s.summary,
                        sources: event.sources ?? s.sources,
                        tool: s.tool
                          ? {
                              ...s.tool,
                              output: event.output ?? s.tool.output,
                              ok: event.ok ?? s.tool.ok,
                              status: event.toolStatus ?? s.tool.status,
                              changes: event.changes ?? s.tool.changes,
                            }
                          : s.tool,
                      }
                    : s,
                ),
              }));
              break;
            case "research.phase":
              if (!assistantId) break;
              patchMessage(assistantId, (m) => (m.research ? m : { ...m, research: true }));
              break;
            case "subagent.start":
              if (!assistantId) break;
              patchMessage(assistantId, (m) => ({
                ...m,
                subagents: [...(m.subagents ?? []).filter((task) => task.id !== event.task.id), event.task],
              }));
              break;
            case "subagent.update":
              if (!assistantId) break;
              patchMessage(assistantId, (m) => {
                const tasks = m.subagents ?? [];
                const index = tasks.findIndex((task) => task.id === event.task.id);
                return {
                  ...m,
                  subagents:
                    index >= 0
                      ? tasks.map((task) => (task.id === event.task.id ? event.task : task))
                      : [...tasks, event.task],
                };
              });
              break;
            case "text.delta":
              buffer += event.delta;
              if (!timer) timer = window.setTimeout(flush, 45);
              break;
            case "tool.approval":
              if (!assistantId) break;
              setApprovalBusy(false);
              patchMessage(assistantId, (m) => ({ ...m, approval: event.request }));
              break;
            case "usage":
              if (!assistantId) break;
              patchMessage(assistantId, (m) => ({ ...m, usage: event.usage }));
              break;
            case "run.end":
              ended = true;
              if (timer) window.clearTimeout(timer);
              timer = 0;
              buffer = "";
              setActive((prev) =>
                prev && prev.id === payload.sessionId
                  ? {
                      ...prev,
                      messages: prev.messages.map((m) =>
                        m.id === event.message.id ? event.message : m,
                      ),
                    }
                  : prev,
              );
              if (event.error) setRunError(event.error);
              break;
            case "error":
              setRunError(event.message);
              if (assistantId) {
                patchMessage(assistantId, (m) => ({
                  ...m,
                  status: "error",
                  error: event.message,
                  approval: null,
                }));
              }
              break;
          }
        }

        if (timer) window.clearTimeout(timer);
        timer = 0;
        flush();

        if (!ended && assistantId) {
          patchMessage(assistantId, (m) =>
            m.status === "running"
              ? {
                  ...m,
                  status: "stopped",
                  error: "The connection ended before the run finished.",
                  approval: null,
                  steps: (m.steps ?? []).map((s) =>
                    s.state === "running" ? { ...s, state: "done" as const } : s,
                  ),
                  subagents: (m.subagents ?? []).map((task) =>
                    task.status === "running" ? { ...task, status: "error" as const, error: "Stopped" } : task,
                  ),
                }
              : m,
          );
        }
      } catch (caught) {
        const aborted = caught instanceof DOMException && caught.name === "AbortError";
        if (!aborted) {
          const message = errorText(caught);
          setRunError(message);
          if (assistantId) {
            patchMessage(assistantId, (m) => ({
              ...m,
              status: "error",
              error: message,
              approval: null,
              steps: (m.steps ?? []).map((s) =>
                s.state === "running" ? { ...s, state: "done" as const } : s,
              ),
            }));
          }
        } else if (assistantId) {
          patchMessage(assistantId, (m) =>
            m.status === "running" ? { ...m, status: "stopped", approval: null } : m,
          );
        }
      } finally {
        if (timer) window.clearTimeout(timer);
        setRunning(false);
        setApprovalBusy(false);
        abortRef.current = null;
        runIdRef.current = null;
        void refreshSummaries();
      }
    },
    [patchMessage, refreshSummaries],
  );

  const send = useCallback(
    (text: string, files: Attachment[]) => {
      if (!active || running || !model) return;
      const trimmed = text.trim();
      if (!trimmed && !files.length) return;
      const full =
        trimmed +
        files
          .map((f) =>
            f.text
              ? `\n\n[Attached file: ${f.name}]\n${f.text}`
              : `\n\n[Attached file: ${f.name} — binary, contents not readable]`,
          )
          .join("");
      setDraft("");
      const payload: RunRequest = {
        sessionId: active.id,
        text: trimmed || "(attachments)",
        full,
        files: files.map((f) => f.name),
        agentId: agent.id,
        agentName: agent.name,
        modelKey: model.key,
        tools: state.tools,
        autonomy: state.autonomy,
        profile: state.profile,
        mode: state.researchMode ? "research" : undefined,
      };
      void startRun(payload);
    },
    [active, running, model, agent.id, agent.name, state.tools, state.autonomy, state.profile, state.researchMode, startRun],
  );

  const regenerate = useCallback(() => {
    if (!active || running || !model || !lastRun || !lastPrompt) return;
    const index = active.messages.indexOf(lastPrompt);
    if (index < 0) return;
    const payload: RunRequest = {
      sessionId: active.id,
      text: lastPrompt.text,
      full: lastPrompt.full ?? lastPrompt.text,
      files: lastPrompt.files ?? [],
      agentId: agent.id,
      agentName: agent.name,
      modelKey: model.key,
      tools: state.tools,
      autonomy: state.autonomy,
      profile: state.profile,
      mode: lastRun.research ? "research" : state.researchMode ? "research" : undefined,
      retryOf: lastRun.id,
    };
    void startRun(payload, index);
  }, [active, running, model, agent.id, agent.name, lastRun, lastPrompt, state.tools, state.autonomy, state.profile, state.researchMode, startRun]);

  const newSession = useCallback(async () => {
    if (running) return;
    if (active && active.messages.length === 0) {
      setFocusSignal((n) => n + 1);
      return;
    }
    try {
      const created = await createSession(DEFAULT_AGENT_ID);
      setActive(created);
      await refreshSummaries();
      setDraft("");
      setFocusSignal((n) => n + 1);
      if (window.innerWidth < 1024) setSidebar(false);
    } catch (caught) {
      setRunError(errorText(caught));
    }
  }, [active, running, refreshSummaries]);

  const select = useCallback(
    async (id: string) => {
      if (running || switching || id === active?.id) {
        if (window.innerWidth < 1024) setSidebar(false);
        return;
      }
      setSwitching(true);
      try {
        const session = await getSession(id);
        setActive(session);
        stick.current = true;
        if (window.innerWidth < 1024) setSidebar(false);
      } catch (caught) {
        setRunError(errorText(caught));
      } finally {
        setSwitching(false);
      }
    },
    [running, switching, active?.id],
  );

  const remove = useCallback(
    async (id: string) => {
      if (running && active?.id === id) return;
      try {
        await deleteSession(id);
        const list = await listSessions();
        setSummaries(list);
        if (active?.id === id) {
          if (list.length) {
            setActive(await getSession(list[0].id));
          } else {
            setActive(await createSession(DEFAULT_AGENT_ID));
            await refreshSummaries();
          }
        }
      } catch (caught) {
        setRunError(errorText(caught));
      }
    },
    [active, running],
  );

  const exportSession = useCallback(
    async (id?: string) => {
      const sessionId = id ?? active?.id;
      if (!sessionId) return;
      try {
        const session = sessionId === active?.id && active ? active : await getSession(sessionId);
        const lines: string[] = [
          `# ${session.title}`,
          "",
          `- Agent: ${resolveAgent(session.agent, state.agents).name}`,
          `- Exported: ${new Date().toLocaleString()}`,
          `- Messages: ${session.messages.length}`,
          "",
        ];
        for (const message of session.messages) {
          lines.push(message.role === "user" ? "## You" : "## Assistant");
          if (message.role === "assistant") {
            const meta = [message.model, message.research ? "deep research" : ""].filter(Boolean).join(" · ");
            if (meta) lines.push(`_${meta}_`, "");
          }
          if (message.files?.length) lines.push(`_Attachments: ${message.files.join(", ")}_`, "");
          lines.push(message.text || "(no text)", "");
          const sources = [
            ...(message.steps ?? []).flatMap((step) => step.sources ?? []),
            ...(message.subagents ?? []).flatMap((task) => task.result?.sources ?? []),
          ];
          const seen = new Set<string>();
          const links = sources.filter((source) => {
            const key = source.url ?? source.title;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (links.length) {
            lines.push("### Sources", "");
            for (const source of links) lines.push(`- [${source.title}](${source.url ?? ""}) — ${source.host}`);
            lines.push("");
          }
        }
        const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${slug(session.title)}.md`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setExported(true);
        window.setTimeout(() => setExported(false), 1600);
      } catch (caught) {
        setRunError(errorText(caught));
      }
    },
    [active, state.agents],
  );

  const setAgent = useCallback(
    async (id: string) => {
      if (!active || running) return;
      const previous = active.agent;
      setActive({ ...active, agent: id });
      try {
        const summary = await patchSession(active.id, { agent: id });
        setSummaries((prev) => prev.map((s) => (s.id === summary.id ? summary : s)));
      } catch (caught) {
        setActive({ ...active, agent: previous });
        setRunError(errorText(caught));
      }
    },
    [active, running],
  );

  const approve = useCallback(async (callId: string, allow: boolean) => {
    const runId = runIdRef.current;
    setApprovalBusy(true);
    setActive((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((m) =>
              m.approval?.callId === callId
                ? {
                    ...m,
                    approval: null,
                    steps: (m.steps ?? []).map((s) =>
                      s.tool && s.id === callId
                        ? {
                            ...s,
                            tool: { ...s.tool, status: allow ? ("approved" as const) : ("denied" as const) },
                          }
                        : s,
                    ),
                  }
                : m,
            ),
          }
        : prev,
    );
    try {
      if (runId) await resolveApproval(runId, callId, allow);
    } catch (caught) {
      setRunError(errorText(caught));
    } finally {
      setApprovalBusy(false);
    }
  }, []);

  const stop = useCallback(() => {
    const runId = runIdRef.current;
    // Abort locally for an instant UI stop, then tell the server to kill the run.
    abortRef.current?.abort();
    if (runId) void cancelRun(runId).catch(() => undefined);
  }, []);

  const pickModel = useCallback(
    (key: string) => {
      set({ defaultModel: key });
      void saveSettings({ defaultModel: key }).catch(() => undefined);
    },
    [set, saveSettings],
  );

  const cycleScene = () => {
    const i = SCENES.findIndex((s) => s.id === state.scene);
    set({ scene: SCENES[(i + 1) % SCENES.length].id });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      } else if (key === "b") {
        event.preventDefault();
        setSidebar((value) => !value);
      } else if (key === "j") {
        event.preventDefault();
        setInspector((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const composer = (placement: "down" | "up") => (
    <Composer
      value={draft}
      onChange={setDraft}
      onSend={send}
      onStop={stop}
      running={running}
      models={models}
      modelKey={modelKey}
      onModel={pickModel}
      placement={placement}
      placeholder={empty ? "How can I help you today?" : `Message ${agent.name}…`}
      onOpenSettings={() => setSettings("models")}
      focusSignal={focusSignal}
    />
  );

  const name = state.profile.name || "friend";
  const subagentCount = lastRun?.subagents?.length ?? 0;
  // The folder name, not the whole path. The absolute path belongs in
  // Settings and in the inspector; on the welcome screen it is noise, and it
  // puts the user's home directory on screen for no reason.
  const workspaceName = (boot?.workspace ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";

  if (loading) {
    return (
      <div className="relative z-10 grid h-full place-items-center">
        <div className="flex items-center gap-2.5 text-[14px] text-white/70">
          <Spinner className="h-4 w-4" /> Loading sessions…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative z-10 grid h-full place-items-center p-6">
        <div className="glass-css max-w-[480px] rounded-3xl p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-amber-200" />
          <p className="font-serif text-[24px]">Could not load your sessions</p>
          <p className="mt-2 break-words text-[13.5px] text-white/60">{loadError}</p>
          <button onClick={() => void loadInitial()} className="btn-primary glass-hover mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium outline-none">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex h-full w-full gap-3 p-3">
      <AnimatePresence initial={false}>
        {sidebar && (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-30 bg-[#06041e]/40 lg:hidden"
            onClick={() => setSidebar(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {sidebar && (
          <motion.aside
            key="sidebar"
            initial={{ x: -26, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -26, opacity: 0 }}
            transition={spring.smooth}
            className="fixed inset-y-3 left-3 z-40 w-[min(300px,88vw)] sm:inset-y-4 sm:left-4 lg:static lg:z-auto lg:w-[290px] lg:inset-auto lg:shrink-0"
          >
            <Sidebar
              sessions={summaries}
              activeId={active?.id ?? ""}
              onSelect={(id) => void select(id)}
              onNew={() => void newSession()}
              onDelete={(id) => void remove(id)}
              onExport={(id) => void exportSession(id)}
              onClose={() => setSidebar(false)}
              onSettings={() => setSettings("general")}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2">
            {!sidebar && (
              <button onClick={() => setSidebar(true)} className="glass-css glass-hover grid h-11 w-11 place-items-center rounded-full outline-none" aria-label="Show sidebar"><PanelLeft className="h-[19px] w-[19px]" /></button>
            )}
            <div className="relative min-w-0">
              <div className="glass-css flex h-11 min-w-0 items-center gap-2.5 rounded-full pl-4 pr-3">
                <button
                  onClick={() => setAgentMenu((value) => !value)}
                  disabled={running}
                  className="flex min-w-0 items-center gap-2 rounded-full outline-none disabled:opacity-60"
                  aria-haspopup="listbox"
                  aria-expanded={agentMenu}
                  title="Switch agent"
                >
                  <AgentIcon className="h-4 w-4 shrink-0 accent-text" />
                  <span className="truncate text-[14px] font-medium">{empty ? "New session" : active?.title}</span>
                  <span className="hidden text-[12.5px] text-white/50 sm:inline">· {agent.name}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-white/45 transition-transform duration-300", agentMenu && "rotate-180")} />
                </button>
                {switching && <Spinner className="h-3.5 w-3.5 text-white/60" />}
              </div>
              <AnimatePresence>
                {agentMenu && (
                  <AgentMenu current={active?.agent ?? DEFAULT_AGENT_ID} disabled={running} onPick={(id) => void setAgent(id)} onClose={() => setAgentMenu(false)} />
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="glass-css pointer-events-auto flex h-11 shrink-0 items-center gap-0.5 rounded-full px-1.5">
            <button
              onClick={() => void compactContext()}
              disabled={compactBusy || running || empty}
              className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 disabled:opacity-35"
              aria-label="Compact context"
              title="Compact the earlier turns of this session"
            >
              {compactBusy ? <Spinner className="h-[18px] w-[18px]" /> : <Minimize2 className="h-[18px] w-[18px]" />}
            </button>
            <button onClick={() => void exportSession()} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15" aria-label="Export session" title={exported ? "Exported" : "Export as Markdown"}>
              {exported ? <Check className="h-[18px] w-[18px] text-emerald-300" /> : <Download className="h-[18px] w-[18px]" />}
            </button>
            <button onClick={() => setInspector((v) => !v)} className={cn("relative grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15", inspector && "bg-white/20")} aria-label="Toggle run inspector" title="Run inspector">
              <PanelRight className="h-[18px] w-[18px]" />
              {subagentCount > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
            </button>
            <button onClick={cycleScene} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15" aria-label="Change scene" title="Change scene"><Palette className="h-[18px] w-[18px]" /></button>
            <button onClick={() => setSettings("general")} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15" aria-label="Settings" title="Settings"><Settings2 className="h-[18px] w-[18px]" /></button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            {empty ? (
              <motion.div
                key={`hero-${active?.id ?? "none"}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease }}
                className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-[8vh] pt-16"
              >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
              className="mb-9 flex items-center gap-3.5 sm:gap-5"
            >
              <Burst className="h-9 w-9 sm:h-[52px] sm:w-[52px]" />
              <h1 className="font-serif text-[40px] leading-none tracking-tight sm:text-[64px]">Welcome, {name}</h1>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.soft, delay: 0.06 }}
              className="relative z-30 w-full max-w-[700px]"
            >
              {composer("down")}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.soft, delay: 0.12 }}
              className="mt-5 flex max-w-[700px] flex-wrap justify-center gap-2.5"
            >
              {CHIPS.map((c) => (
                <button key={c.label} onClick={() => { setDraft(c.seed); setFocusSignal((n) => n + 1); }} className="glass-css glass-hover inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] outline-none">
                  <c.icon className="h-4 w-4 text-white/75" />{c.label}
                </button>
              ))}
            </motion.div>
            <div className="mt-4 flex max-w-[700px] flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e, [])} className="rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[13px] text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)] transition hover:bg-white/15 hover:text-white">{e}</button>
              ))}
            </div>
            {boot && workspaceName && (
              <p className="mt-7 max-w-[560px] px-4 text-center text-[11.5px] leading-relaxed text-white/45" style={{ textShadow: "0 1px 14px rgba(5,3,22,.85)" }}>
                Tools act inside <span className="font-mono text-white/60">{workspaceName}</span>. Commands and file writes ask first in Balanced mode.
              </p>
            )}
              </motion.div>
            ) : (
              <motion.div
                key={`chat-${active?.id ?? "none"}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease }}
                className="flex min-h-0 flex-1 flex-col"
              >
            <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }} className="scroll-thin fade-top min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[760px] space-y-9 px-2 pb-8 pt-20 sm:px-4">
                {active?.messages.map((m) => (
                  <MessageView
                    key={m.id}
                    msg={m}
                    canRegenerate={!running && m.id === lastRun?.id}
                    onRegenerate={!running && m.id === lastRun?.id ? regenerate : undefined}
                    onApprove={approve}
                    approvalBusy={approvalBusy}
                    onRevertStep={revertToStep}
                    revertBusy={revertBusy}
                  />
                ))}
              </div>
            </div>
            <div className="mx-auto w-full max-w-[760px] px-1 pb-1 sm:px-3">
              <AnimatePresence>
                {notice && (
                  <motion.div
                    variants={pop}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className="mb-2 flex items-center gap-2 rounded-2xl bg-emerald-300/10 px-3.5 py-2.5 text-[12.5px] text-emerald-100 shadow-[inset_0_0_0_1px_rgba(120,255,200,.18)]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span className="min-w-0 flex-1 break-words">{notice}</span>
                    <button onClick={() => setNotice(null)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/15" aria-label="Dismiss"><X className="h-3 w-3" /></button>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {runError && (
                  <motion.div
                    variants={pop}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className="mb-2 flex items-start gap-2 rounded-2xl bg-amber-300/10 px-3.5 py-2.5 text-[12.5px] text-amber-100 shadow-[inset_0_0_0_1px_rgba(255,220,150,.18)]"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">{runError}</span>
                    <button onClick={() => setRunError(null)} className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-white/15" aria-label="Dismiss"><X className="h-3 w-3" /></button>
                  </motion.div>
                )}
              </AnimatePresence>
              {composer("up")}
              <p className="mt-2 truncate text-center text-[11.5px] text-white/45" style={{ textShadow: "0 1px 14px rgba(5,3,22,.85)" }}>
                {model ? `${model.name} via ${providerMeta(model.provider).name} · responses may be inaccurate` : "No model available"}
              </p>
            </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence initial={false}>
        {inspector && (
          <motion.div
            key="inspector-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-30 bg-[#06041e]/40 xl:hidden"
            onClick={() => setInspector(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {inspector && (
          <motion.aside
            key="inspector"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 30, opacity: 0 }}
            transition={spring.smooth}
            className="fixed inset-y-3 right-3 z-40 w-[min(340px,92vw)] sm:inset-y-4 sm:right-4 xl:static xl:z-auto xl:w-[320px] xl:inset-auto xl:shrink-0"
          >
            <Inspector run={lastRun} prompt={lastPrompt} session={active ?? undefined} onClose={() => setInspector(false)} />
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settings && <Settings key="settings" initialTab={settings} onClose={() => setSettings(null)} />}
      </AnimatePresence>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        sessions={summaries}
        onSelectSession={(id) => void select(id)}
        onNew={() => void newSession()}
        onSettings={(tab) => setSettings(tab)}
        onToggleResearch={() => set({ researchMode: !state.researchMode })}
        onToggleSidebar={() => setSidebar((value) => !value)}
        onToggleInspector={() => setInspector((value) => !value)}
        onExport={() => void exportSession()}
      />
    </div>
  );
}
