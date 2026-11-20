import { useEffect, useRef } from "react";
import { MotionConfig } from "framer-motion";
import { WallpaperLayer } from "./components/Wallpaper";
import { GlassShell } from "./components/GlassShell";
import { Wizard } from "./components/Wizard";
import { Harness } from "./components/Harness";
import { NeedsProvider, ServerGate, Splash } from "./components/Gate";
import { StoreProvider, useStore } from "./store";
import { ServerProvider, useServer } from "./lib/server";
import { sceneVars } from "./lib/scenes";

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
    <div data-scene={state.scene} style={sceneVars(state.scene)} className="themed relative h-dvh w-full overflow-hidden font-sans text-white">
      <MotionConfig reducedMotion={state.motion ? "never" : "always"}>
        <WallpaperLayer />
        <GlassShell>
          <div className="relative flex min-h-0 flex-1 flex-col">{content}</div>
          {boot && error && !unauthorized && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center px-3">
              <div className="pointer-events-auto glass-css max-w-[520px] rounded-full px-4 py-2 text-[12px] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
                Lost contact with the local harness — {error}
              </div>
            </div>
          )}
        </GlassShell>
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
