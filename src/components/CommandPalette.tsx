import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  CornerDownLeft,
  Image,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Telescope,
  User,
  Wrench,
  Cpu,
} from "lucide-react";
import type { SessionSummary } from "../lib/types";
import { cn } from "../utils/cn";
import { pop } from "../lib/motion";

export type SettingsTab = "profile" | "models" | "agent" | "look";

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
      { id: "sidebar", label: "Toggle sidebar", hint: "Show or hide sessions", icon: PanelLeft, run: onToggleSidebar },
      { id: "inspector", label: "Toggle run inspector", hint: "Timeline, tokens, sub-agents", icon: PanelRight, run: onToggleInspector },
      { id: "profile", label: "Settings: Profile", hint: "Name, role and response style", icon: User, run: () => onSettings("profile") },
      { id: "models", label: "Settings: Providers", hint: "API keys and model catalog", icon: Cpu, run: () => onSettings("models") },
      { id: "agent", label: "Settings: Agent", hint: "Tools, autonomy and workspace", icon: Wrench, run: () => onSettings("agent") },
      { id: "look", label: "Settings: Appearance", hint: "Wallpaper and glass quality", icon: Image, run: () => onSettings("look") },
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
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] bg-[#05031c]/65 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-0 z-[71] flex justify-center px-3 pt-[12vh]">
            <motion.div
              variants={pop}
              initial="hidden"
              animate="show"
              exit="exit"
              className="glass-shell pointer-events-auto h-fit max-h-[70vh] w-[min(600px,94vw)] overflow-hidden rounded-[26px]"
              style={{ backgroundColor: "rgba(17,11,47,.82)" }}
            >
              <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                <Search className="h-4.5 w-4.5 shrink-0 text-white/45" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setIndex(0);
                  }}
                  placeholder="Search sessions and actions"
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-white/35"
                />
                <span className="hidden rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-white/40 sm:inline">Esc</span>
              </div>
              <div className="scroll-thin max-h-[54vh] overflow-y-auto p-2">
                {rows.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-white/45">Nothing matches that search.</p>}
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
                        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left outline-none transition-colors",
                        on ? "bg-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,.22)]" : "hover:bg-white/[0.07]",
                      )}
                    >
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", on ? "sel-on" : "bg-white/[0.07]")}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px]">{row.label}</span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-white/40">{row.hint}</span>
                      </span>
                      <CornerDownLeft className={cn("h-3.5 w-3.5 shrink-0", on ? "text-white/55" : "text-white/20")} />
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 border-t border-white/10 px-5 py-2.5 text-[10.5px] text-white/35">
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono">↑↓</span> move
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Enter</span> run
                <span className="ml-auto">Ctrl K toggles this palette</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
