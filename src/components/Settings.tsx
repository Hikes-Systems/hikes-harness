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
import { Glass } from "./Glass";
import {
  AboutPanel,
  AgentPanel,
  AtmospherePanel,
  GeneralPanel,
  McpPanel,
  MemoryPanel,
  ProvidersPanel,
} from "./Panels";
import { Button } from "./ui";
import { ease, spring } from "../lib/motion";
import { cn } from "../utils/cn";

export type SettingsTab = "general" | "models" | "agent" | "look" | "mcp" | "memory" | "about";

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "models", label: "Providers", icon: Cpu },
  { id: "agent", label: "Agent", icon: Wrench },
  { id: "look", label: "Appearance", icon: Palette },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "about", label: "About", icon: Info },
];

export function Settings({ onClose, initialTab = "general" }: { onClose: () => void; initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

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
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60]"
    >
      <div className="absolute inset-0 bg-[#06041e]/60" onClick={onClose} />
      <div className="pointer-events-none relative grid h-full place-items-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.985 }}
          transition={spring.smooth}
          className="pointer-events-auto h-[min(720px,92dvh)] w-[min(96vw,860px)]"
        >
          <Glass
            radius={34}
            strength="lg"
            blur={0.3}
            backdropBlur={26}
            solid="rgba(20,12,60,.92)"
            tint="linear-gradient(160deg, rgba(58,38,128,.9), rgba(16,9,50,.94))"
            animate
            className="h-full w-full"
            contentClassName="h-full"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 px-6 pb-3 pt-6 sm:px-8">
                <h2 className="font-serif text-[34px] leading-none">Settings</h2>
                <button onClick={onClose} className="glass-css glass-hover grid h-10 w-10 place-items-center rounded-full outline-none" aria-label="Close"><X className="h-[18px] w-[18px]" /></button>
              </div>

              <div className="scroll-thin flex gap-1.5 overflow-x-auto px-6 pb-3 sm:px-8">
                {TABS.map((t) => {
                  const on = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "relative inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13.5px] outline-none transition-colors",
                        on ? "text-white" : "text-white/70 hover:text-white",
                      )}
                    >
                      {on && (
                        <motion.span
                          layoutId="settings-tab-pill"
                          className="sel-on absolute inset-0 rounded-full"
                          transition={spring.snappy}
                        />
                      )}
                      <t.icon className="relative h-4 w-4" />
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-3 sm:px-8">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.22, ease }}
                  >
                    {tab === "general" && <GeneralPanel />}
                    {tab === "models" && <ProvidersPanel />}
                    {tab === "agent" && <AgentPanel />}
                    {tab === "look" && <AtmospherePanel />}
                    {tab === "mcp" && <McpPanel />}
                    {tab === "memory" && <MemoryPanel />}
                    {tab === "about" && <AboutPanel />}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
                <span className="hidden text-[11.5px] text-white/40 sm:block">Setup runs once. Changes save automatically.</span>
                <Button variant="primary" onClick={onClose}>Done</Button>
              </div>
            </div>
          </Glass>
        </motion.div>
      </div>
    </motion.div>
  );
}
