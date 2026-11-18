import { AlertTriangle, ArrowRight, KeyRound, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { Glass } from "./Glass";
import { ProvidersPanel } from "./Panels";
import { Button, MountainMark, Spinner } from "./ui";
import { useServer } from "../lib/server";

export function Splash() {
  return (
    <div className="relative z-10 grid h-full w-full place-items-center p-6">
      <div className="flex flex-col items-center text-center">
        <div className="glass-css relative mb-6 grid h-20 w-20 place-items-center rounded-full">
          <MountainMark className="accent-text h-10 w-10" />
          <span className="pointer-events-none absolute -inset-2 rounded-full" style={{ animation: "breathe 3s ease-in-out infinite", boxShadow: "0 0 60px color-mix(in oklab, var(--accent) 45%, transparent)" }} />
        </div>
        <div className="flex items-center gap-2.5 text-[14px] text-white/70">
          <Spinner className="h-4 w-4" /> Waking the local harness…
        </div>
      </div>
    </div>
  );
}

export function ServerGate({ unauthorized }: { unauthorized: boolean }) {
  const { error, refresh, loading } = useServer();
  return (
    <div className="relative z-10 grid h-full w-full place-items-center p-4 sm:p-8">
      <Glass radius={34} strength="lg" animate className="w-[min(94vw,560px)]" contentClassName="p-8 sm:p-10">
        <div className="mb-5 flex items-center gap-3">
          <span className="glass-css grid h-12 w-12 place-items-center rounded-2xl">
            {unauthorized ? <KeyRound className="h-5 w-5 accent-text" /> : <Plug className="h-5 w-5 accent-text" />}
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/50">Hikes harness</p>
            <h2 className="font-serif text-[30px] leading-tight">{unauthorized ? "Launch token required" : "Backend not reachable"}</h2>
          </div>
        </div>

        <p className="text-[14.5px] leading-relaxed text-white/75">{error}</p>

        {unauthorized ? (
          <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-white/65">
            <p>Every launch prints a fresh token. Open the exact link from the terminal, or pass the token in the URL:</p>
            <pre className="glass-inset overflow-x-auto rounded-2xl px-4 py-3 font-mono text-[12px] text-white/85">http://127.0.0.1:5173/#hikes_token=YOUR_TOKEN</pre>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
              The token stays in this browser's local storage. Restarting <span className="font-mono text-white/85">hikes</span> creates a new one.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-white/[0.06] px-4 py-3 text-[13.5px] leading-relaxed text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
              <div>
                Run <span className="font-mono text-white/90">hikes</span> in the folder you want the agent to work in. It starts the API, opens this page and prints the session token.
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          <Button variant="primary" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Try again
          </Button>
        </div>
      </Glass>
    </div>
  );
}

export function NeedsProvider() {
  return (
    <div className="relative z-10 h-full w-full overflow-y-auto p-3 sm:p-6">
      <div className="mx-auto w-full max-w-[980px]">
        <Glass radius={36} strength="lg" animate contentClassName="p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.26em] text-white/55">One last step</p>
              <h1 className="font-serif text-[36px] leading-none sm:text-[44px]">Connect a model</h1>
              <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/70">
                Hikes runs real models and real tools. Add at least one provider — a cloud key or a local Ollama / OpenAI-compatible endpoint both work.
              </p>
            </div>
            <span className="glass-css inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] text-white/70">
              <ShieldCheck className="h-3.5 w-3.5" /> Keys stay on this machine
            </span>
          </div>
          <ProvidersPanel />
          <p className="mt-5 flex items-center gap-2 text-[12.5px] text-white/45">
            <ArrowRight className="h-3.5 w-3.5" /> This screen disappears as soon as a provider is connected.
          </p>
        </Glass>
      </div>
    </div>
  );
}
