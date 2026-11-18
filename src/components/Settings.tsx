import { useEffect, useState } from "react";
import { Cpu, Palette, RotateCcw, User, Wrench, X } from "lucide-react";
import { Glass } from "./Glass";
import { AgentPanel, AtmospherePanel, ProfilePanel, ProvidersPanel } from "./Panels";
import { Button } from "./ui";
import { useStore } from "../store";
import { cn } from "../utils/cn";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "models", label: "Providers", icon: Cpu },
  { id: "agent", label: "Agent", icon: Wrench },
  { id: "look", label: "Appearance", icon: Palette },
] as const;

export function Settings({ onClose, initialTab = "profile" }: { onClose: () => void; initialTab?: (typeof TABS)[number]["id"] }) {
  const { reset } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(initialTab);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <>
      <div className="a-fade fixed inset-0 z-[60] bg-[#06041e]/60" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[61] grid place-items-center p-3 sm:p-6">
        <Glass radius={34} strength="lg" blur={0.3} backdropBlur={26} solid="rgba(20,12,60,.92)" tint="linear-gradient(160deg, rgba(58,38,128,.9), rgba(16,9,50,.94))" animate className="pointer-events-auto h-[min(720px,92dvh)] w-[min(96vw,860px)]" contentClassName="h-full">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 px-6 pb-3 pt-6 sm:px-8">
              <h2 className="font-serif text-[34px] leading-none">Settings</h2>
              <button onClick={onClose} className="glass-css glass-hover grid h-10 w-10 place-items-center rounded-full outline-none" aria-label="Close"><X className="h-[18px] w-[18px]" /></button>
            </div>
            <div className="scroll-thin flex gap-1.5 overflow-x-auto px-6 pb-3 sm:px-8">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={cn("glass-hover inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13.5px] outline-none", tab === t.id ? "sel-on" : "glass-css text-white/75 hover:text-white")}>
                  <t.icon className="h-4 w-4" />{t.label}
                </button>
              ))}
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-3 sm:px-8">
              <div key={tab} className="a-step">
                {tab === "profile" && <ProfilePanel />}
                {tab === "models" && <ProvidersPanel />}
                {tab === "agent" && <AgentPanel />}
                {tab === "look" && <AtmospherePanel />}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-3 sm:px-8">
              {confirm ? (
                <div className="a-pop flex items-center gap-2 text-[13px]">
                  <span className="text-white/70">Clear everything and restart setup?</span>
                  <Button size="sm" variant="primary" onClick={reset}>Yes, restart</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}><RotateCcw className="h-3.5 w-3.5" /> Restart onboarding</Button>
              )}
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </div>
        </Glass>
      </div>
    </>
  );
}
