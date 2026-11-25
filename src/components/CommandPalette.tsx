import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  CornerDownLeft,
  Cpu,
  Download,
  Gauge,
  Info,
  MessageSquare,
  Palette,
  Plus,
  ScrollText,
  Search,
  SlidersHorizontal,
  Telescope,
  Wrench,
} from "lucide-react";
import type { SessionSummary } from "../lib/types";
import { cn } from "../utils/cn";
import { pop } from "../lib/motion";
import type { SettingsTab } from "./Settings";

export type { SettingsTab };

interface Action {
  id: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  onNew: () => void;
  onSettings: (tab: SettingsTab) => void;
  onToggleResearch: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onExport: () => void;
}

export function CommandPalette({
  open,
  onClose,
  sessions,
  onSelectSession,
  onNew,
  onSettings,
  onToggleResearch,
  onToggleSidebar,
  onToggleInspector,
  onExport,
}: Props) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  const actions = useMemo<Action[]>(
    () => [
      { id: "new", label: "New session", hint: "Start a clean conversation", icon: Plus, run: onNew },
      { id: "research", label: "Toggle deep research", hint: "Research before answering", icon: Telescope, run: onToggleResearch },
      { id: "export", label: "Export current session", hint: "Download as Markdown", icon: Download, run: onExport },
      { id: "sidebar", label: "Toggle session index", hint: "Show or hide sessions", icon: ScrollText, run: onToggleSidebar },
      { id: "inspector", label: "Toggle activity ledger", hint: "Timeline, tokens, sub-agents", icon: Gauge, run: onToggleInspector },
      { id: "general", label: "Settings: General", hint: "Name, role, style and research mode", icon: SlidersHorizontal, run: () => onSettings("general") },
      { id: "models", label: "Settings: Providers", hint: "API keys and model catalog", icon: Cpu, run: () => onSettings("models") },
      { id: "agent", label: "Settings: Agent", hint: "Tools, autonomy and workspace", icon: Wrench, run: () => onSettings("agent") },
      { id: "appearance", label: "Settings: Appearance", hint: "Six palettes, session layout and motion", icon: Palette, run: () => onSettings("appearance") },
      { id: "memory", label: "Settings: Memory", hint: "Review and delete saved facts", icon: Brain, run: () => onSettings("memory") },
      { id: "about", label: "Settings: About", hint: "Version, paths, auth and shortcuts", icon: Info, run: () => onSettings("about") },
    ],
    [onNew, onToggleResearch, onExport, onToggleSidebar, onToggleInspector, onSettings],
  );

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const sessionRows = sessions
      .filter((session) => session.messageCount > 0 && session.title.toLowerCase().includes(query))
      .slice(0, 8)
      .map<Action>((session) => ({
        id: `session-${session.id}`,
        label: session.title,
        hint: `${session.messageCount} messages`,
        icon: MessageSquare,
        run: () => onSelectSession(session.id),
      }));
    const actionRows = actions.filter(
      (action) =>
        !query ||
        action.label.toLowerCase().includes(query) ||
        action.hint.toLowerCase().includes(query),
    );
    return query ? [...sessionRows, ...actionRows] : [...actionRows, ...sessionRows];
  }, [actions, sessions, q, onSelectSession]);

  useEffect(() => {
    if (index >= rows.length) setIndex(Math.max(0, rows.length - 1));
  }, [rows.length, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((value) => (rows.length ? (value + 1) % rows.length : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => (rows.length ? (value - 1 + rows.length) % rows.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const row = rows[index];
        if (row) {
          onClose();
          row.run();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rows, index, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[70] bg-[var(--overlay)]"
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-0 z-[71] flex justify-center px-3 pt-[12vh]">
            <motion.div
              variants={pop}
              initial="hidden"
              animate="show"
              exit="exit"
              className="pointer-events-auto h-fit max-h-[70vh] w-[min(600px,94vw)] overflow-hidden rounded-[6px] border border-[var(--line)] bg-surface shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
                <Search className="h-4 w-4 shrink-0 t-faint" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setIndex(0);
                  }}
                  placeholder="Search sessions and actions"
                  className="min-w-0 flex-1 bg-transparent text-[14px] t-ink outline-none placeholder:text-[var(--faint)]"
                />
                <span className="kbd hidden sm:inline-flex">Esc</span>
              </div>
              <div className="scroll-thin max-h-[54vh] overflow-y-auto p-1.5">
                {rows.length === 0 && <p className="px-4 py-8 text-center text-[12.5px] t-faint">Nothing matches that search.</p>}
                {rows.map((row, rowIndex) => {
                  const Icon = row.icon;
                  const on = rowIndex === index;
                  return (
                    <button
                      key={row.id}
                      onPointerEnter={() => setIndex(rowIndex)}
                      onClick={() => {
                        onClose();
                        row.run();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-2 text-left outline-none transition-colors",
                        on ? "bg-surface2" : "hover-s2",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                          on ? "border-[var(--line)] bg-surface t-accent" : "border-[var(--line)] bg-surface2 t-muted",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] t-ink">{row.label}</span>
                        <span className="mt-0.5 block truncate text-[11px] t-faint">{row.hint}</span>
                      </span>
                      <CornerDownLeft className={cn("h-3 w-3 shrink-0", on ? "t-muted" : "t-faint opacity-40")} />
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 border-t border-[var(--line)] bg-soft px-4 py-2 text-[10px] t-faint">
                <span className="kbd">↑↓</span> move
                <span className="kbd">Enter</span> run
                <span className="ml-auto">Ctrl K toggles this palette</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
