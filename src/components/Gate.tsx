import { AlertTriangle, ArrowRight, KeyRound, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { ProvidersPanel } from "./Panels";
import { Button, MountainMark, Spinner } from "./ui";
import { useServer } from "../lib/server";

export function Splash() {
  return (
    <div className="grid h-full w-full place-items-center bg-app p-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-[6px] border border-[var(--line)] bg-surface">
          <MountainMark className="h-[34px] w-[34px] t-accent" />
        </div>
        <div className="flex items-center gap-2.5 text-[13px] t-muted">
          <Spinner className="h-4 w-4" /> Waking the local harness…
        </div>
      </div>
    </div>
  );
}

export function ServerGate({ unauthorized }: { unauthorized: boolean }) {
  const { error, refresh, loading } = useServer();
  return (
    <div className="grid h-full w-full place-items-center overflow-y-auto bg-app p-4 sm:p-8">
      <div className="w-[min(94vw,540px)] rounded-[6px] border border-[var(--line)] bg-surface p-7 sm:p-9">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] border border-[var(--line)] bg-surface2">
            {unauthorized ? <KeyRound className="h-4 w-4 t-accent" /> : <Plug className="h-4 w-4 t-accent" />}
          </span>
          <div>
            <p className="text-[10.5px] t-faint">Hikes</p>
            <h2 className="text-[21px] font-medium leading-tight tracking-[-0.02em] t-ink">
              {unauthorized ? "Launch token required" : "Backend not reachable"}
            </h2>
          </div>
        </div>

        <p className="text-[13px] leading-relaxed t-ink2">{error}</p>

        {unauthorized ? (
          <div className="mt-5 space-y-3 text-[13px] leading-relaxed t-muted">
            <p>Every launch prints a fresh token. Open the exact link from the terminal, or pass the token in the URL:</p>
            <pre className="overflow-x-auto rounded-[4px] border border-[var(--line)] bg-[var(--code-bg)] px-3.5 py-2.5 font-mono text-[11.5px] t-ink2">
http://127.0.0.1:5173/?hikes_token=YOUR_TOKEN
            </pre>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 t-ok" />
              The token stays in this browser&apos;s local storage. Restarting <span className="font-mono t-ink2">hikes</span> creates a new one.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-[4px] border border-[var(--line)] bg-surface2 px-3.5 py-2.5 text-[13px] leading-relaxed t-ink2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 t-warn" />
              <div>
                Run <span className="font-mono t-ink">hikes</span> in the folder you want the agent to work in. It starts the API, opens this page and prints the session token.
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          <Button variant="primary" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NeedsProvider() {
  return (
    <div className="h-full w-full overflow-y-auto bg-app p-3 sm:p-6">
      <div className="mx-auto w-full max-w-[980px] rounded-[6px] border border-[var(--line)] bg-surface p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] t-faint">One last step</p>
            <h1 className="text-[26px] font-medium leading-tight tracking-[-0.02em] t-ink sm:text-[30px]">Connect a model</h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed t-muted">
              Hikes runs real models and real tools. Add at least one provider — a cloud key or a local Ollama / OpenAI-compatible endpoint both work.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 text-[11.5px] t-muted">
            <ShieldCheck className="h-3.5 w-3.5 t-ok" /> Keys stay on this machine
          </span>
        </div>
        <ProvidersPanel />
        <p className="mt-5 flex items-center gap-2 text-[11.5px] t-faint">
          <ArrowRight className="h-3.5 w-3.5" /> This screen disappears as soon as a provider is connected.
        </p>
      </div>
    </div>
  );
}
