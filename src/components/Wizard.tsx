import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cpu, Layers, Rocket } from "lucide-react";
import { Glass } from "./Glass";
import { AgentPanel, AtmospherePanel, ProfilePanel, ProvidersPanel } from "./Panels";
import { Button, MountainMark } from "./ui";
import { useStore } from "../store";
import { useServer } from "../lib/server";
import { cn } from "../utils/cn";

type StepDef = { key: string; label?: string; title?: string; sub?: string };
const STEPS: StepDef[] = [
  { key: "welcome" },
  { key: "you", label: "You", title: "Let's get acquainted", sub: "A few quick questions so Ridgeline can tailor itself to you." },
  { key: "models", label: "Models", title: "Connect your models", sub: "Bring your own keys or a local endpoint. At least one provider is required — change it anytime." },
  { key: "agent", label: "Agent", title: "Set up your agent", sub: "Pick a default model, the tools it can reach for, and how independent it should be." },
  { key: "sky", label: "Sky", title: "Choose your sky", sub: "Make it yours. The mountains behind this card update live." },
];

const LAUNCH_LINES = ["Calibrating liquid glass", "Connecting your providers", "Loading your preferences", "Raising the peaks"];

function Launching({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const ids = LAUNCH_LINES.map((_, i) => window.setTimeout(() => setN(i + 1), 500 + i * 520));
    const end = window.setTimeout(() => done.current(), 500 + LAUNCH_LINES.length * 520 + 380);
    return () => { ids.forEach(clearTimeout); clearTimeout(end); };
  }, []);
  return (
    <div className="a-fade flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="glass-css mb-8 grid h-20 w-20 place-items-center rounded-full">
        <MountainMark className="accent-text h-10 w-10" />
        <span className="absolute inset-0 rounded-full" style={{ animation: "breathe 2.2s ease-in-out infinite", boxShadow: "0 0 50px color-mix(in oklab, var(--accent) 50%, transparent)" }} />
      </div>
      <h2 className="font-serif text-4xl">Preparing your harness</h2>
      <ul className="mt-8 space-y-3 text-left">
        {LAUNCH_LINES.map((l, i) => (
          <li key={l} className={cn("flex items-center gap-3 text-[15px] transition-all duration-500", i < n ? "text-white" : i === n ? "text-white/70" : "text-white/25")}>
            <span className={cn("grid h-6 w-6 place-items-center rounded-full transition-all duration-500", i < n ? "btn-primary" : "glass-css")}>
              {i < n ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i === n ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : null}
            </span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Wizard() {
  const { state, set } = useStore();
  const { boot, saveSettings } = useServer();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [launching, setLaunching] = useState(false);
  const models = boot?.models ?? [];

  const go = (n: number) => { setDir(n > step ? "fwd" : "back"); setStep(n); };
  const last = step === STEPS.length - 1;
  const canNext = (step !== 1 || state.profile.name.trim().length > 0) && (step !== 2 || models.length > 0);

  const next = () => {
    if (!canNext) return;
    if (last) {
      const modelKey =
        models.find((m) => m.key === state.defaultModel)?.key ??
        boot?.defaultModel ??
        models[0]?.key;
      if (!modelKey) return;
      if (modelKey !== state.defaultModel) set({ defaultModel: modelKey });
      if (modelKey !== boot?.defaultModel) void saveSettings({ defaultModel: modelKey }).catch(() => undefined);
      setLaunching(true);
    } else go(step + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !launching && (e.target as HTMLElement).tagName !== "BUTTON" && step > 0 && canNext) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cur = STEPS[step];

  return (
    <div className="relative z-10 grid h-full w-full place-items-center p-3 sm:p-6">
      <Glass radius={36} strength="lg" animate className="h-[min(680px,92dvh)] w-[min(96vw,780px)]" contentClassName="h-full">
        {launching ? (
          <Launching onDone={() => set({ onboarded: true })} />
        ) : step === 0 ? (
          <div key="welcome" className="a-step flex h-full flex-col items-center justify-center px-6 text-center sm:px-14">
            <div className="glass-css relative mb-8 grid h-24 w-24 place-items-center rounded-full">
              <MountainMark className="accent-text h-12 w-12 drop-shadow-[0_4px_14px_rgba(0,0,0,.3)]" />
              <span className="pointer-events-none absolute -inset-3 rounded-full" style={{ animation: "breathe 4s ease-in-out infinite", boxShadow: "0 0 70px color-mix(in oklab, var(--accent) 45%, transparent)" }} />
            </div>
            <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.3em] text-white/60">Agent harness</p>
            <h1 className="font-serif text-[56px] leading-[0.98] sm:text-[80px]">
              Meet <span className="italic accent-text">Ridgeline</span>
            </h1>
            <p className="mt-6 max-w-md text-[16.5px] leading-relaxed text-white/75">
              Bring any model, hand it tools, and watch it work — all beneath a sky of liquid glass. Setup takes about a minute.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2.5 text-[13px] text-white/80">
              {[[Cpu, "Any model"], [Layers, "Real tools"], [Rocket, "Runs locally"]].map(([I, t]) => {
                const Icon = I as typeof Cpu;
                return <span key={t as string} className="glass-css inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"><Icon className="h-3.5 w-3.5" />{t as string}</span>;
              })}
            </div>
            <Button variant="primary" size="lg" className="mt-10 min-w-[200px]" onClick={() => go(1)}>
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="px-6 pb-2 pt-6 sm:px-9 sm:pt-8">
              <div className="mb-5 flex items-center gap-2">
                {STEPS.slice(1).map((s, i) => {
                  const idx = i + 1;
                  return (
                    <button key={s.key} onClick={() => idx < step && go(idx)} className="group flex-1 text-left outline-none" disabled={idx >= step} aria-label={s.label}>
                      <div className="h-[5px] overflow-hidden rounded-full bg-white/15">
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: idx <= step ? "100%" : "0%", background: "linear-gradient(90deg, color-mix(in oklab, var(--accent) 60%, white), var(--accent))" }} />
                      </div>
                      <span className={cn("mt-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] transition-colors", idx === step ? "text-white" : idx < step ? "text-white/60 group-hover:text-white" : "text-white/30")}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              {cur.title && (
                <div key={cur.key + "h"} className={dir === "fwd" ? "a-step" : "a-step-back"}>
                  <h2 className="font-serif text-[38px] leading-[1.05] sm:text-[44px]">{cur.title}</h2>
                  <p className="mt-1.5 text-[14.5px] text-white/65">{cur.sub}</p>
                </div>
              )}
            </div>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-9">
              <div key={cur.key} className={dir === "fwd" ? "a-step" : "a-step-back"}>
                {step === 1 && <ProfilePanel autoFocus />}
                {step === 2 && <ProvidersPanel />}
                {step === 3 && <AgentPanel />}
                {step === 4 && <AtmospherePanel />}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-3 sm:px-9 sm:pb-8">
              <Button variant="ghost" onClick={() => go(step - 1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <div className="flex items-center gap-3">
                {step === 2 && models.length === 0 && (
                  <span className="hidden text-[12.5px] text-amber-100/80 sm:block">Connect a provider to continue</span>
                )}
                <Button variant="primary" size="lg" disabled={!canNext || (last && models.length === 0)} onClick={next}>
                  {last ? "Launch Ridgeline" : "Continue"} {last ? <Rocket className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Glass>
    </div>
  );
}
