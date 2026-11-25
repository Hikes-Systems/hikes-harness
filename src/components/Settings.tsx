import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Cpu,
  Info,
  Palette,
  Plug,
  SlidersHorizontal,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AboutPanel,
  AgentPanel,
  AppearancePanel,
  GeneralPanel,
  McpPanel,
  MemoryPanel,
  ProvidersPanel,
} from "./Panels";
import { Button, IconButton } from "./ui";
import { ease, spring } from "../lib/motion";
import { cn } from "../utils/cn";

export type SettingsTab = "general" | "models" | "agent" | "appearance" | "mcp" | "memory" | "about";

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "models", label: "Providers", icon: Cpu },
  { id: "agent", label: "Agent", icon: Wrench },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "about", label: "About", icon: Info },
];

export function Settings({ onClose, initialTab = "general" }: { onClose: () => void; initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.995 }}
        transition={spring.smooth}
        className="relative flex h-[min(700px,92dvh)] w-[min(96vw,920px)] overflow-hidden rounded-[18px] border border-[var(--line)] bg-surface shadow-[var(--shadow-lg)]"
      >
        <aside className="hidden w-[224px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface-2)] p-3 sm:flex">
          <div className="px-2 pb-5 pt-1.5">
            <div className="text-[10px] t-faint">Hikes</div>
            <h2 className="mt-1 text-[20px] font-medium leading-none tracking-[-0.02em] t-ink">
              Settings
            </h2>
          </div>
          <nav className="space-y-0.5" aria-label="Settings sections">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 rounded-[9px] border px-3 text-left text-[13px] outline-none transition-[background-color,border-color,color,transform] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]",
                    on
                      ? "border-[var(--line)] bg-surface t-ink"
                      : "border-transparent t-muted hover:bg-[var(--surface-2)] hover:t-ink",
                  )}
                >
                  <t.icon
                    className={cn("h-3.5 w-3.5 shrink-0", on && "t-accent")}
                    strokeWidth={1.8}
                  />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </nav>
          <p className="mt-auto px-2 pb-1 text-[10px] leading-relaxed t-faint">
            Changes save automatically to this machine.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 sm:px-6">
            <div className="min-w-0">
              <div className="text-[10px] t-faint">Hikes</div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <current.icon className="h-3.5 w-3.5 shrink-0 t-accent sm:hidden" />
                <span className="truncate text-[18px] font-semibold leading-none tracking-[-0.015em] t-ink">
                  {current.label}
                </span>
              </div>
            </div>
            <IconButton onClick={onClose} aria-label="Close settings" title="Close">
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-[var(--line)] px-3 py-2 sm:hidden">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11.5px] outline-none transition-colors",
                    on
                      ? "border-[var(--accent-line)] bg-accent-soft t-accent"
                      : "border-transparent t-muted hover-s2",
                  )}
                >
                  <t.icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease }}
              >
                {tab === "general" && <GeneralPanel />}
                {tab === "models" && <ProvidersPanel />}
                {tab === "agent" && <AgentPanel />}
                {tab === "appearance" && <AppearancePanel />}
                {tab === "mcp" && <McpPanel />}
                {tab === "memory" && <MemoryPanel />}
                {tab === "about" && <AboutPanel />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center justify-end border-t border-[var(--line)] bg-surface px-4 py-3 sm:px-6">
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
