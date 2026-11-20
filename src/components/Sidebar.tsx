import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { MountainMark } from "./ui";
import { useStore } from "../store";
import { resolveAgent } from "../lib/mascots";
import type { SessionSummary } from "../lib/types";
import { cn } from "../utils/cn";
import { listItem, listStagger, spring } from "../lib/motion";

interface Props {
  sessions: SessionSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onClose: () => void;
  onSettings: () => void;
}

export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onExport, onClose, onSettings }: Props) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (s.messageCount > 0 || s.id === activeId) &&
          (s.title.toLowerCase().includes(q.toLowerCase()) ||
            resolveAgent(s.agent, state.agents).name.toLowerCase().includes(q.toLowerCase())),
      ),
    [sessions, activeId, q, state.agents],
  );
  const name = state.profile.name || "You";

  return (
    <div className="glass-css flex h-full w-full flex-col rounded-[26px] p-3">
      <div className="flex items-center justify-between px-2 pb-3 pt-1.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "linear-gradient(145deg, rgba(255,255,255,.28), rgba(255,255,255,.06))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)" }}>
            <MountainMark className="accent-text h-5 w-5" />
          </span>
          <div className="leading-none">
            <span className="font-serif text-[24px] leading-none">Hikes</span>
            <span className="mt-0.5 block text-[10.5px] uppercase tracking-[0.2em] text-white/40">agent harness</span>
          </div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/12 hover:text-white" aria-label="Hide sidebar"><PanelLeftClose className="h-[18px] w-[18px]" /></button>
      </div>

      <button onClick={onNew} className="btn-primary glass-hover mb-3 flex h-11 items-center justify-center gap-2 rounded-full text-[14px] font-medium outline-none">
        <Plus className="h-4 w-4" strokeWidth={2.6} /> New session
      </button>

      <div className="glass-inset mb-3 flex h-10 items-center gap-2 rounded-full px-3.5">
        <Search className="h-4 w-4 text-white/45" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-white/40" />
        {q && (
          <button onClick={() => setQ("")} className="rounded-full px-1 text-[11px] text-white/50 hover:text-white" aria-label="Clear search">Clear</button>
        )}
      </div>

      <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/40">Sessions</span>
          <span className="font-mono text-[10.5px] text-white/30">{list.length}</span>
        </div>
        {list.length === 0 && <p className="px-3 py-4 text-[13px] text-white/45">{q ? "No matches." : "Your sessions will appear here."}</p>}
        <motion.div variants={listStagger} initial="hidden" animate="show" className="space-y-0.5">
          {list.map((s) => {
            const { Icon } = resolveAgent(s.agent, state.agents);
            return (
              <motion.div
                key={s.id}
                variants={listItem}
                layout
                className={cn(
                  "group relative flex items-center rounded-2xl transition-colors",
                  s.id !== activeId && "hover:bg-white/[0.09]",
                )}
              >
                {s.id === activeId && (
                  <motion.span
                    layoutId="session-active-pill"
                    transition={spring.smooth}
                    className="absolute inset-0 rounded-2xl bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,.3)]"
                  />
                )}
                <button onClick={() => onSelect(s.id)} className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left outline-none">
                  <Icon className={cn("h-4 w-4 shrink-0", s.id === activeId ? "accent-text" : "text-white/50")} />
                  <span className="truncate text-[13.5px]">{s.title}</span>
                  {s.messageCount > 0 && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-white/30">{s.messageCount}</span>}
                </button>
                <div className="relative z-10 mr-1.5 hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                  <button onClick={() => onExport(s.id)} className="grid h-7 w-7 place-items-center rounded-full text-white/50 transition hover:bg-white/15 hover:text-white" aria-label={`Export ${s.title}`} title="Export as Markdown"><Download className="h-3.5 w-3.5" /></button>
                  <button onClick={() => onDelete(s.id)} className="grid h-7 w-7 place-items-center rounded-full text-white/50 transition hover:bg-white/15 hover:text-white" aria-label={`Delete ${s.title}`} title="Delete session"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 px-2 text-[10.5px] text-white/30">
        <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono">Ctrl K</span>
        <span>command palette</span>
      </div>

      <button onClick={onSettings} className="glass-hover mt-2 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-2.5 text-left outline-none hover:bg-white/[0.13]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-[#1b1038]" style={{ background: "linear-gradient(145deg, color-mix(in oklab, var(--accent) 50%, white), var(--accent))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.8)" }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-tight">{name}</span>
          <span className="block truncate text-[12px] text-white/50">{state.profile.role || "Explorer"}</span>
        </span>
        <Settings2 className="h-[18px] w-[18px] text-white/60" />
      </button>
    </div>
  );
}
