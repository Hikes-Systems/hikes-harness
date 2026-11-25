import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cpu, Layers, Rocket } from "lucide-react";
import { AgentPanel, AppearancePanel, ProfilePanel, ProvidersPanel } from "./Panels";
import { Button, MountainMark } from "./ui";
import { useStore } from "../store";
import { useServer } from "../lib/server";
import { cn } from "../utils/cn";

type StepDef = { key: string; label?: string; title?: string; sub?: string };
const STEPS: StepDef[] = [
  { key: "welcome" },
  { key: "you", label: "You", title: "Let's get acquainted", sub: "A few quick questions so Hikes can tailor itself to you." },
  { key: "models", label: "Models", title: "Connect your models", sub: "Bring your own keys or a local endpoint. At least one provider is required — change it anytime." },
  { key: "agent", label: "Agent", title: "Set up your agent", sub: "Pick a default model, the tools it can reach for, and how independent it should be." },
  { key: "appearance", label: "Appearance", title: "Choose your workspace", sub: "Six curated palettes and three session layouts. You can change these anytime." },
];

const LAUNCH_LINES = ["Preparing your workspace", "Connecting your providers", "Loading your preferences", "Ready when you are"];

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
      <div className="mb-7 grid h-12 w-12 place-items-center rounded-[6px] border border-[var(--line)] bg-surface2">
        <MountainMark className="h-[34px] w-[34px] t-accent" />
      </div>
      <h2 className="text-[24px] font-medium leading-tight tracking-[-0.02em] t-ink">Preparing your harness</h2>
      <ul className="mt-8 space-y-3 text-left">
        {LAUNCH_LINES.map((l, i) => (
          <li
            key={l}
            className={cn(
              "flex items-center gap-3 text-[13px] transition-all duration-500",
              i < n ? "t-ink" : i === n ? "t-ink2" : "t-faint",
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border transition-all duration-500",
                i < n
                  ? "border-[var(--accent)] bg-accent text-[var(--on-accent)]"
                  : i === n
                    ? "border-[var(--accent-line)] bg-accent-soft"
                    : "border-[var(--line)] bg-surface2",
              )}
            >
              {i < n ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : i === n ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              ) : null}
            </span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Wizard() {
  const { state, set, completeSetup } = useStore();
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
    <div className="grid h-full w-full place-items-center bg-app p-3 sm:p-6">
      <div className="flex h-[min(680px,92dvh)] w-[min(96vw,780px)] flex-col overflow-hidden rounded-[6px] border border-[var(--line)] bg-surface shadow-[var(--shadow-lg)]">
        {launching ? (
          <Launching onDone={completeSetup} />
        ) : step === 0 ? (
          <div key="welcome" className="a-step flex h-full flex-col items-center justify-center px-6 text-center sm:px-14">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-[6px] border border-[var(--line)] bg-surface2">
              <MountainMark className="h-[34px] w-[34px] t-accent" />
            </div>
            <p className="mb-3 text-[11px] t-faint">Hikes · local agent harness</p>
            <h1 className="text-[30px] font-medium leading-[1.1] tracking-[-0.025em] t-ink sm:text-[36px]">
              A workbench for agents that touch your files
            </h1>
            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed t-muted">
              Bring any model, hand it tools, and watch it work. A quiet workspace that runs entirely on
              your machine. Setup takes about a minute.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[12px] t-muted">
              {[[Cpu, "Any model"], [Layers, "Real tools"], [Rocket, "Runs locally"]].map(([I, t]) => {
                const Icon = I as typeof Cpu;
                return (
                  <span key={t as string} className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 t-faint" />{t as string}
                  </span>
                );
              })}
            </div>
            <Button variant="primary" size="lg" className="mt-8 min-w-[200px] rounded-[4px]" onClick={() => go(1)}>
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="px-6 pb-2 pt-6 sm:px-9 sm:pt-7">
              <div className="mb-5 flex items-center gap-2">
                {STEPS.slice(1).map((s, i) => {
                  const idx = i + 1;
                  return (
                    <button key={s.key} onClick={() => idx < step && go(idx)} className="group flex-1 text-left outline-none" disabled={idx >= step} aria-label={s.label}>
                      <div className="h-[2px] overflow-hidden bg-[var(--surface-3)]">
                        <div
                          className="h-full bg-accent transition-[width] duration-700 ease-out"
                          style={{ width: idx <= step ? "100%" : "0%" }}
                        />
                      </div>
                      <span
                        className={cn(
                          "mt-1.5 block text-[10.5px] transition-colors",
                          idx === step ? "t-ink" : idx < step ? "t-muted group-hover:t-ink" : "t-faint",
                        )}
                      >
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {cur.title && (
                <div key={cur.key + "h"} className={dir === "fwd" ? "a-step" : "a-step-back"}>
                  <h2 className="text-[24px] font-medium leading-[1.15] tracking-[-0.02em] t-ink">{cur.title}</h2>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed t-muted">{cur.sub}</p>
                </div>
              )}
            </div>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-9">
              <div key={cur.key} className={dir === "fwd" ? "a-step" : "a-step-back"}>
                {step === 1 && <ProfilePanel autoFocus />}
                {step === 2 && <ProvidersPanel />}
                {step === 3 && <AgentPanel />}
                {step === 4 && <AppearancePanel />}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] bg-soft px-6 pb-5 pt-3 sm:px-9">
              <Button variant="ghost" onClick={() => go(step - 1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <div className="flex items-center gap-3">
                {step === 2 && models.length === 0 && (
                  <span className="hidden text-[12px] t-warn sm:block">Connect a provider to continue</span>
                )}
                <Button variant="primary" size="lg" disabled={!canNext || (last && models.length === 0)} onClick={next}>
                  {last ? "Launch Hikes" : "Continue"} {last ? <Rocket className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
