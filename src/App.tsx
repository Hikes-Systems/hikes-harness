import { useEffect, useRef } from "react";
import { MotionConfig } from "framer-motion";
import { Wizard } from "./components/Wizard";
import { Harness } from "./components/Harness";
import { NeedsProvider, ServerGate, Splash } from "./components/Gate";
import { StoreProvider, useStore } from "./store";
import { ServerProvider, useServer } from "./lib/server";

function Shell() {
  const { state, set, setTools, restore } = useStore();
  const { boot, loading, error, unauthorized } = useServer();
  const hydrated = useRef(false);

  // The server is the source of truth for tools, autonomy and the default model.
  useEffect(() => {
    if (!boot || hydrated.current) return;
    hydrated.current = true;
    setTools(boot.tools);
    set({ autonomy: boot.autonomy, defaultModel: boot.defaultModel ?? "" });
  }, [boot, set, setTools]);

  // The server owns the onboarding flag and mirrors the interface state, so
  // neither is lost when the browser lands on a different origin.
  useEffect(() => {
    if (!boot) return;
    if (boot.onboarded) set({ onboarded: true });
    restore(boot.ui ?? undefined);
  }, [boot, set, restore]);

  let content;
  if (loading && !boot) content = <Splash />;
  else if (!boot) content = <ServerGate unauthorized={unauthorized} />;
  else if (!state.onboarded) content = <Wizard />;
  else if (boot.models.length === 0) content = <NeedsProvider />;
  else content = <Harness />;

  return (
    <div
      data-theme={state.theme}
      data-motion={state.motion ? "on" : "off"}
      className="relative h-dvh w-full overflow-hidden bg-app font-sans t-ink"
    >
      <MotionConfig reducedMotion={state.motion ? "never" : "always"}>
        {content}
        {boot && error && !unauthorized && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-3">
            <div className="pointer-events-auto flex max-w-[560px] items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-warn-soft px-3.5 py-2 text-[12.5px] t-warn shadow-[var(--shadow-md)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warn)]" />
              Lost contact with the local harness — {error}
            </div>
          </div>
        )}
      </MotionConfig>
    </div>
  );
}

export default function App() {
  return (
    <ServerProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ServerProvider>
  );
}
