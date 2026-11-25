import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CornerDownLeft,
  Download,
  FileText,
  FolderOpen,
  Minimize2,
  Moon,
  PanelLeft,
  PanelRight,
  PanelTop,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Terminal,
  X,
} from "lucide-react";
import { Composer, type Attachment } from "./Composer";
import { MessageView } from "./Chat";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { Settings, type SettingsTab } from "./Settings";
import { CommandPalette } from "./CommandPalette";
import { IconButton, MountainMark, Spinner } from "./ui";
import { useStore } from "../store";
import { useServer } from "../lib/server";
import { DEFAULT_AGENT_ID } from "@shared/agents";
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
  resolveApproval,
  revertStep,
  streamRun,
} from "../lib/api";
import { ease, listItem, listStagger, pop, spring } from "../lib/motion";
import { nextScheme, paletteInfo, PALETTES, type Palette } from "../lib/palettes";

const SUGGESTIONS = [
  {
    icon: FileText,
    label: "Review the current diff",
    desc: "See what changed and what needs attention",
    seed: "Review the current diff and summarise what changed.",
  },
  {
    icon: Terminal,
    label: "Trace a failing test",
    desc: "Follow the error back to its cause",
    seed: "Trace why this test is failing: ",
  },
  {
    icon: FolderOpen,
    label: "Explain this folder",
    desc: "Map the structure and important entry points",
    seed: "Explain the structure of this folder and what each part does.",
  },
] as const;

const titleFrom = (text: string) => (text || "New session").replace(/\s+/g, " ").trim().slice(0, 60) || "New session";
const compact = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value));
const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "session";

function ThemeMenu({
  current,
  onPick,
  onScheme,
  onClose,
}: {
  current: Palette;
  onPick: (id: Palette) => void;
  onScheme: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        variants={pop}
        initial="hidden"
        animate="show"
        exit="exit"
        className="absolute right-0 top-[calc(100%+10px)] z-50 w-[292px] overflow-hidden rounded-[16px] border border-[var(--line)] bg-surface p-2 shadow-[var(--shadow-lg)]"
        role="menu"
        aria-label="Choose a palette"
      >
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span className="text-[12px] font-semibold t-ink">Palette</span>
          <button
            onClick={onScheme}
            className="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[11px] t-muted outline-none transition-colors hover-s2 hover-ink focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
          >
            {paletteInfo(current).scheme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            {paletteInfo(nextScheme(current)).label}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTES.map((palette) => {
            const active = palette.id === current;
            return (
              <button
                key={palette.id}
                onClick={() => onPick(palette.id)}
                aria-pressed={active}
                className={`flex items-center gap-2.5 rounded-[10px] border p-2 text-left outline-none transition-[background-color,border-color,transform] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] ${active ? "border-[var(--accent-line)] bg-accent-soft" : "border-transparent hover:bg-[var(--surface-2)]"}`}
              >
                <span
                  className="relative h-8 w-8 shrink-0 rounded-[9px] border"
                  style={{ background: palette.canvas, borderColor: palette.line }}
                >
                  <span className="absolute inset-x-1.5 top-1.5 h-1.5 rounded-full" style={{ background: palette.accent }} />
                  <span className="absolute inset-x-1.5 bottom-1.5 h-2.5 rounded-[3px]" style={{ background: palette.surface, border: `1px solid ${palette.line}` }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium t-ink">{palette.label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 t-accent" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
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
  const [topSessions, setTopSessions] = useState(false);
  const [inspector, setInspector] = useState(() => window.innerWidth >= 1280);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [palette, setPalette] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const [exported, setExported] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [revertBusy, setRevertBusy] = useState(false);
  const [compactBusy, setCompactBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const agent = resolveAgent(active?.agent ?? DEFAULT_AGENT_ID);
  const empty = !active || active.messages.length === 0;
  const railOpen = state.sessionNav === "sidebar" && sidebar;
  const sessionsOpen = state.sessionNav === "sidebar" ? sidebar : topSessions;

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
        modelKey: model.key,
        tools: state.tools,
        autonomy: state.autonomy,
        profile: state.profile,
        mode: state.researchMode ? "research" : undefined,
      };
      void startRun(payload);
    },
    [active, running, model, agent.id, state.tools, state.autonomy, state.profile, state.researchMode, startRun],
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
      modelKey: model.key,
      tools: state.tools,
      autonomy: state.autonomy,
      profile: state.profile,
      mode: lastRun.research ? "research" : state.researchMode ? "research" : undefined,
      retryOf: lastRun.id,
    };
    void startRun(payload, index);
  }, [active, running, model, agent.id, lastRun, lastPrompt, state.tools, state.autonomy, state.profile, state.researchMode, startRun]);

  const newSession = useCallback(async () => {
    setTopSessions(false);
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
      setTopSessions(false);
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
          `- Agent: ${resolveAgent(session.agent).name}`,
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
    [active],
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

  // The log and the deck can share the screen on a wide window. Below that
  // they are both overlays, so opening one dismisses the other.
  const toggleLog = () => {
    if (state.sessionNav !== "sidebar") {
      const next = !topSessions;
      setTopSessions(next);
      if (next) setInspector(false);
      return;
    }
    const next = !sidebar;
    setSidebar(next);
    if (next && window.innerWidth < 1280) setInspector(false);
  };
  const toggleDeck = () => {
    const next = !inspector;
    setInspector(next);
    if (next) setTopSessions(false);
    if (next && window.innerWidth < 1024) setSidebar(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThemeMenu(false);
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      } else if (key === "b") {
        event.preventDefault();
        if (state.sessionNav !== "sidebar") {
          const next = !topSessions;
          setTopSessions(next);
          if (next) setInspector(false);
        } else {
          const next = !sidebar;
          setSidebar(next);
          if (next && window.innerWidth < 1280) setInspector(false);
        }
      } else if (key === "j") {
        event.preventDefault();
        const next = !inspector;
        setInspector(next);
        if (next && window.innerWidth < 1024) setSidebar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebar, topSessions, inspector, state.sessionNav]);

  // A layout change dismisses the temporary sheet, including Hidden chosen
  // from Settings while that sheet is open.
  useEffect(() => {
    setTopSessions(false);
  }, [state.sessionNav]);

  // The session index and the activity ledger are docked on a wide window and
  // overlays on a narrow one. Close them when the window shrinks so the two
  // never stack over the work area.
  useEffect(() => {
    let last = window.innerWidth;
    const onResize = () => {
      const next = window.innerWidth;
      if (last >= 1024 && next < 1024) setSidebar(false);
      if (last >= 1280 && next < 1280) setInspector(false);
      last = next;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
      placeholder={empty ? "Message the harness…" : `Message ${agent.name}…`}
      onOpenSettings={() => setSettings("models")}
      focusSignal={focusSignal}
    />
  );

  const subagentCount = lastRun?.subagents?.length ?? 0;
  // The folder name, not the whole path. The absolute path belongs in
  // Settings and in the activity ledger; on the empty screen it is noise,
  // and it puts the user's home directory on screen for no reason.
  const workspaceName = (boot?.workspace ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-app">
        <div className="flex items-center gap-2.5 text-[13px] t-muted">
          <Spinner className="h-4 w-4" /> Loading sessions…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid h-full place-items-center bg-app p-6">
        <div className="w-full max-w-[480px] border border-[var(--line)] bg-surface p-7 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 t-warn" />
          <p className="text-[22px] font-medium leading-tight tracking-[-0.02em] t-ink">Could not load your sessions</p>
          <p className="mt-2 break-words text-[13px] t-muted">{loadError}</p>
          <button
            onClick={() => void loadInitial()}
            className="btn-secondary mt-5 inline-flex h-9 items-center gap-2 rounded-[4px] px-3.5 text-[13px] font-medium outline-none"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const runTokens = (lastRun?.usage?.inputTokens ?? 0) + (lastRun?.usage?.outputTokens ?? 0);

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden bg-app p-3 sm:gap-4 sm:p-4">
      <header className="topbar relative z-50 flex h-14 shrink-0 items-center gap-1.5 rounded-[16px] border border-[var(--line)] px-2.5 shadow-[var(--shadow-sm)] sm:gap-2 sm:px-4">
        <IconButton
          onClick={toggleLog}
          active={sessionsOpen}
          aria-label={sessionsOpen ? "Hide sessions" : "Show sessions"}
          title={`${sessionsOpen ? "Hide" : "Show"} sessions${state.sessionNav === "top" ? " in top panel" : ""} (Ctrl B)`}
          aria-expanded={state.sessionNav === "sidebar" ? undefined : sessionsOpen}
        >
          {state.sessionNav === "sidebar" ? <PanelLeft className="h-4 w-4" /> : <PanelTop className="h-4 w-4" />}
        </IconButton>

        <button
          type="button"
          onClick={() => setSettings("about")}
          title="About Hikes"
          className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
        >
          <MountainMark className="h-[38px] w-[38px]" />
          <span className="font-mono text-[13px] font-semibold tracking-[0.18em] t-ink">HIKES</span>
        </button>

        <span className="mx-0.5 hidden h-4 w-px bg-[var(--line)] sm:block" />
        <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 t-faint" />
          <span className="max-w-[180px] truncate text-[12px] t-muted">{workspaceName || "No workspace"}</span>
        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex h-9 items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[12px] t-faint outline-none transition-colors hover:border-[var(--accent-line)] hover-ink focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
            aria-label="Search sessions and actions"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search</span>
            <span className="ml-3 hidden md:block">
              <span className="kbd normal-case tracking-normal">Ctrl K</span>
            </span>
          </button>

          <IconButton
            onClick={toggleDeck}
            active={inspector}
            aria-label={inspector ? "Hide activity" : "Show activity"}
            title={inspector ? "Hide activity" : "Show activity"}
            className="relative"
          >
            <PanelRight className="h-4 w-4" />
            {subagentCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </IconButton>

          <div className="relative">
            <button
              onClick={() => setThemeMenu((value) => !value)}
              className="flex h-9 items-center gap-2 rounded-[10px] border border-transparent px-2.5 text-[12px] font-medium t-muted outline-none transition-[background-color,border-color,color] hover:bg-[var(--surface-2)] hover:t-ink focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
              aria-label={`Palette: ${paletteInfo(state.theme).label}`}
              aria-expanded={themeMenu}
              aria-haspopup="menu"
              title="Choose a palette"
            >
              <span className="h-3.5 w-3.5 rounded-full border border-[var(--line)]" style={{ background: paletteInfo(state.theme).accent }} />
              <span className="hidden xl:inline">{paletteInfo(state.theme).label}</span>
              <ChevronDown className={`h-3.5 w-3.5 t-faint transition-transform duration-200 ${themeMenu ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {themeMenu && (
                <ThemeMenu
                  current={state.theme}
                  onPick={(theme) => {
                    set({ theme });
                    setThemeMenu(false);
                  }}
                  onScheme={() => {
                    set({ theme: nextScheme(state.theme) });
                    setThemeMenu(false);
                  }}
                  onClose={() => setThemeMenu(false)}
                />
              )}
            </AnimatePresence>
          </div>

          <IconButton onClick={() => { setThemeMenu(false); setSettings("general"); }} aria-label="Settings" title="Settings">
            <Settings2 className="h-4 w-4" />
          </IconButton>

          <button
            type="button"
            onClick={() => setSettings("general")}
            title={state.profile.name || "Profile"}
            className="ml-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] text-[10.5px] font-semibold t-ink outline-none transition-colors hover:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
          >
            {(state.profile.name || "H").slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {topSessions && state.sessionNav !== "sidebar" && (
          <>
            <motion.div
              key="top-sessions-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-30 bg-[var(--overlay)]"
              onClick={() => setTopSessions(false)}
            />
            <motion.aside
              key="top-sessions"
              initial={{ opacity: 0, y: -10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={spring.smooth}
              className="session-index fixed left-3 top-[84px] z-40 h-[min(620px,calc(100dvh-104px))] w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-[16px] border border-[var(--line)] shadow-[var(--shadow-lg)] sm:left-4 sm:top-[88px]"
              aria-label="Sessions panel"
            >
              <Sidebar
                sessions={summaries}
                activeId={active?.id ?? ""}
                onSelect={(id) => void select(id)}
                onNew={() => void newSession()}
                onDelete={(id) => void remove(id)}
                onExport={(id) => void exportSession(id)}
                onSettings={() => {
                  setTopSessions(false);
                  setSettings("general");
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-h-0 flex-1 gap-3 sm:gap-4">
        <AnimatePresence initial={false}>
          {railOpen && (
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-30 bg-[var(--overlay)] lg:hidden"
              onClick={() => setSidebar(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {railOpen && (
            <motion.aside
              key="sidebar"
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={spring.smooth}
              className="session-index fixed bottom-3 left-3 top-[84px] z-40 w-[272px] shrink-0 overflow-hidden rounded-[16px] border border-[var(--line)] shadow-[var(--shadow-lg)] sm:bottom-4 sm:left-4 sm:top-[88px] lg:static lg:z-auto lg:w-[268px] lg:shadow-[var(--shadow-sm)]"
            >
              <Sidebar
                sessions={summaries}
                activeId={active?.id ?? ""}
                onSelect={(id) => void select(id)}
                onNew={() => void newSession()}
                onDelete={(id) => void remove(id)}
                onExport={(id) => void exportSession(id)}
                onSettings={() => setSettings("general")}
              />
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[var(--line)] bg-surface shadow-[var(--shadow-md)]">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex h-10 min-w-0 items-center gap-3 px-1.5">
                <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[var(--line)] bg-surface2 t-accent sm:grid">
                  <MountainMark className="h-[30px] w-[30px]" />
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[46vw] truncate text-[13px] font-semibold leading-tight t-ink sm:max-w-[440px]">
                    {empty ? "New session" : active?.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight t-muted">
                    {agent.name}
                  </span>
                </span>
              </div>
              {switching && <Spinner className="h-3.5 w-3.5 t-muted" />}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {runTokens > 0 && (
                <div className="mr-1 hidden items-baseline gap-1.5 border-r border-[var(--line)] pr-3 sm:flex">
                  <span className="text-[10.5px] t-faint">tokens</span>
                  <span className="font-mono text-[11px] t-ink2">{compact(runTokens)}</span>
                </div>
              )}
              <IconButton
                onClick={() => void compactContext()}
                disabled={compactBusy || running || empty}
                aria-label="Compact context"
                title="Compact the earlier turns of this session"
              >
                {compactBusy ? <Spinner className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </IconButton>
              <IconButton
                onClick={() => void exportSession()}
                aria-label="Export session"
                title={exported ? "Exported" : "Export as Markdown"}
              >
                {exported ? <Check className="h-4 w-4 t-ok" /> : <Download className="h-4 w-4" />}
              </IconButton>
            </div>
          </header>

        <div className="relative flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <AnimatePresence mode="wait" initial={false}>
              {empty ? (
                <motion.div
                  key={`empty-${active?.id ?? "none"}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease }}
                  className="scroll-thin min-h-0 flex-1 overflow-y-auto"
                >
                  <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col px-5 pb-6 pt-10 sm:px-10 sm:pt-12">
                    <div className="flex flex-1 flex-col justify-center pb-6">
                      <MountainMark className="mb-5 h-[58px] w-[58px]" />
                      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-[11.5px] t-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
                        {agent.name} in {workspaceName || "this workspace"}
                      </div>
                      <h1 className="mt-4 max-w-[620px] text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] t-ink sm:text-[44px]">
                        What should Hikes do?
                      </h1>
                      <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed t-muted">
                        Real tools in your workspace. Every step is logged, diffable and reversible.
                      </p>

                      <div className="mt-7 w-full">{composer("down")}</div>

                      <motion.div variants={listStagger} initial="hidden" animate="show" className="mt-6 grid gap-2.5 sm:grid-cols-3">
                        {SUGGESTIONS.map((s) => (
                          <motion.button
                            key={s.label}
                            variants={listItem}
                            onClick={() => {
                              setDraft(s.seed);
                              setFocusSignal((n) => n + 1);
                            }}
                            className="group flex min-h-[108px] flex-col items-start rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-left outline-none transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-[var(--accent-line)] hover:bg-surface hover:shadow-[var(--shadow-sm)] focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
                          >
                            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent-soft t-accent transition-transform duration-150 group-hover:scale-105">
                              <s.icon className="h-4 w-4" />
                            </span>
                            <span className="mt-3 text-[12.5px] font-semibold leading-snug t-ink">{s.label}</span>
                            <span className="mt-1 text-[11px] leading-relaxed t-muted">{s.desc}</span>
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] pb-1 pt-3 text-[11px] t-faint">
                      {workspaceName && (
                        <span>
                          Workspace <span className="t-muted">{workspaceName}</span>
                        </span>
                      )}
                      <span>{state.autonomy === "ask" ? "Ask before every tool" : state.autonomy === "auto" ? "Autonomous tools, guarded commands" : "Balanced, asks before writes"}</span>
                      <span className="ml-auto hidden items-center gap-1.5 sm:flex">
                        <CornerDownLeft className="h-3 w-3" /> Enter to send
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
              <motion.div
                key={`chat-${active?.id ?? "none"}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div
                  ref={scroller}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
                  }}
                  className="scroll-thin min-h-0 flex-1 overflow-y-auto"
                >
                  <div className="mx-auto w-full max-w-[780px] px-4 pb-8 pt-2 sm:px-8">
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

                <div className="shrink-0 border-t border-[var(--line)] bg-surface px-3 pb-3 pt-3 sm:px-6">
                  <div className="mx-auto w-full max-w-[780px]">
                    <AnimatePresence>
                      {notice && (
                        <motion.div
                          variants={pop}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          className="mb-2 flex items-center gap-2 border-l-2 border-[var(--ok)] bg-ok-soft px-3 py-2 text-[12.5px] t-ok"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{notice}</span>
                          <button
                            onClick={() => setNotice(null)}
                            className="grid h-5 w-5 place-items-center rounded-[3px] transition-colors hover-s3"
                            aria-label="Dismiss"
                          >
                            <X className="h-3 w-3" />
                          </button>
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
                          className="mb-2 flex items-start gap-2 border-l-2 border-[var(--warn)] bg-warn-soft px-3 py-2 text-[12.5px] t-warn"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{runError}</span>
                          <button
                            onClick={() => setRunError(null)}
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-[3px] transition-colors hover-s3"
                            aria-label="Dismiss"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {composer("up")}
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10.5px] t-faint">
                      <span className="truncate">
                        {model ? `${model.name} via ${providerMeta(model.provider).name}` : "No model available"}
                      </span>
                      <span className="hidden shrink-0 sm:inline">Responses may be inaccurate</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          <AnimatePresence initial={false}>
            {inspector && (
              <motion.div
                key="deck-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 z-30 bg-[var(--overlay)] xl:hidden"
                onClick={() => setInspector(false)}
              />
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {inspector && (
              <motion.aside
                key="deck"
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 24, opacity: 0 }}
                transition={spring.smooth}
                className="ledger fixed bottom-3 right-3 top-[84px] z-40 w-[min(320px,92vw)] overflow-hidden rounded-[16px] border border-[var(--line)] shadow-[var(--shadow-lg)] sm:bottom-4 sm:right-4 sm:top-[88px] xl:static xl:z-auto xl:w-[310px] xl:shrink-0 xl:shadow-[var(--shadow-sm)]"
              >
                <Inspector
                  run={lastRun}
                  prompt={lastPrompt}
                  session={active ?? undefined}
                  onClose={() => setInspector(false)}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </main>
      </div>

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
        onToggleSidebar={toggleLog}
        onToggleInspector={toggleDeck}
        onExport={() => void exportSession()}
      />
    </div>
  );
}
