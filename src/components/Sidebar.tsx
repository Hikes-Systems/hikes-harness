import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { useServer } from "../lib/server";
import type { SessionSummary } from "../lib/types";
import { cn } from "../utils/cn";
import { listItem, listStagger } from "../lib/motion";

interface Props {
  sessions: SessionSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onSettings: () => void;
}

const DAY = 86_400_000;

// The index is read in trail order, so dates stay short and relative.
const when = (ts: number) => {
  const age = Date.now() - ts;
  if (age < 60_000) return "now";
  if (age < 3_600_000) return `${Math.round(age / 60_000)}m`;
  if (age < DAY) return `${Math.round(age / 3_600_000)}h`;
  if (age < 7 * DAY) return `${Math.round(age / DAY)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onExport, onSettings }: Props) {
  const { state } = useStore();
  const { boot } = useServer();
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (s.messageCount > 0 || s.id === activeId) &&
          s.title.toLowerCase().includes(q.toLowerCase()),
      ),
    [sessions, activeId, q],
  );

  // Sessions are grouped by recency so long histories stay scannable.
  const groups = useMemo(() => {
    const now = Date.now();
    const buckets = [
      { label: "Today", items: [] as SessionSummary[] },
      { label: "This week", items: [] as SessionSummary[] },
      { label: "Earlier", items: [] as SessionSummary[] },
    ];
    for (const session of list) {
      const age = now - session.updatedAt;
      buckets[age < DAY ? 0 : age < 7 * DAY ? 1 : 2].items.push(session);
    }
    return buckets.filter((bucket) => bucket.items.length > 0);
  }, [list]);

  const name = state.profile.name || "You";

  return (
    <div className="flex h-full w-full flex-col">
      <header className="shrink-0 px-4 pb-4 pt-5">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] t-ink">Sessions</h2>
          <span className="font-mono text-[9.5px] t-faint">{list.length}</span>
        </div>

        <div className="field mt-3 flex h-9 items-center gap-2 rounded-[10px] px-3">
          <Search className="h-3.5 w-3.5 shrink-0 t-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
            className="min-w-0 flex-1 bg-transparent text-[12px] t-ink outline-none placeholder:text-[var(--faint)]"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="rounded-[2px] px-1 text-[10px] t-faint hover-ink"
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNew}
          className="btn-primary mt-2.5 h-9 w-full gap-1.5 rounded-[10px] text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} /> New session
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {list.length === 0 && (
          <p className="px-3 py-3 text-[12px] leading-relaxed t-faint">
            {q ? "No sessions match that search." : "Your first session will appear here."}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} className="mb-1">
            <div className="flex items-center gap-2 px-3.5 pb-0.5 pt-2.5">
              <span className="text-[11px] font-medium t-faint">{group.label}</span>
              <span className="ml-auto font-mono text-[10px] t-faint">{group.items.length}</span>
            </div>
            <motion.div variants={listStagger} initial="hidden" animate="show">
              {group.items.map((session) => {
                const on = session.id === activeId;
                return (
                  <motion.div key={session.id} variants={listItem} layout className="group relative mx-2 mb-0.5">
                    <button
                      onClick={() => onSelect(session.id)}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center rounded-[10px] border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]",
                        on
                          ? "border-[var(--accent-line)] bg-accent-soft"
                          : "border-transparent hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)]",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("min-w-0 flex-1 truncate text-[13.5px] leading-5", on ? "font-semibold t-ink" : "font-medium t-ink2")}>
                            {session.title}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] t-faint">{when(session.updatedAt)}</span>
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] t-faint">
                          <span className="truncate">{session.messageCount} {session.messageCount === 1 ? "message" : "messages"}</span>
                        </span>
                      </span>
                    </button>
                    <div className="absolute right-2 top-2 hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
                      <button
                        onClick={() => onExport(session.id)}
                        className="grid h-7 w-7 place-items-center rounded-[6px] bg-[var(--surface)] t-faint hover-s3 hover-ink"
                        aria-label={`Export ${session.title}`}
                        title="Export as Markdown"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDelete(session.id)}
                        className="grid h-7 w-7 place-items-center rounded-[6px] bg-[var(--surface)] t-faint hover-s3 hover-ink"
                        aria-label={`Delete ${session.title}`}
                        title="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        ))}
      </div>

      <footer className="shrink-0 border-t border-[var(--line)] p-4">
        <button
          onClick={onSettings}
          className="flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left outline-none transition-colors hover:bg-[var(--surface-2)]"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--accent-soft)] text-[10.5px] font-semibold t-accent">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium leading-tight t-ink">{name}</span>
            <span className="mt-0.5 block truncate text-[10.5px] t-faint">{state.profile.role || "Explorer"}</span>
          </span>
          <Settings2 className="h-3.5 w-3.5 shrink-0 t-faint" />
        </button>
        <div className="mt-1 flex items-center justify-between px-1.5 font-mono text-[11px] t-muted">
          <span>Hikes v{boot?.version ?? "1.0.2"}</span>
          <span>MIT</span>
        </div>
      </footer>
    </div>
  );
}
