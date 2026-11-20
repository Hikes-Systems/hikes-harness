import type { ReactNode } from "react";
import { useStore } from "../store";
import { GlassLens } from "./GlassLens";

/**
 * The single curved liquid-glass panel that holds the whole app. The wallpaper
 * stays visible in the margins; everything else lives inside this surface.
 *
 * GlassLens renders a refracted copy of the wallpaper clipped to this panel.
 * The surface itself stays transparent so the real wallpaper can show through
 * the tint without being frosted twice.
 */
export function GlassShell({ children }: { children: ReactNode }) {
  const { state } = useStore();

  return (
    <div className="fixed inset-0 z-10 p-3 sm:p-4">
      <div
        className="glass-shell shell-in relative flex h-full w-full flex-col overflow-hidden rounded-[30px] sm:rounded-[40px]"
        data-motion={state.motion ? "on" : "off"}
        data-quality={state.quality}
      >
        <GlassLens />
        <div aria-hidden className="glass-shell-tint" />
        <div aria-hidden className="glass-shell-glow" />
        <div aria-hidden className="glass-noise" />
        <div aria-hidden className="glass-shell-sheen" />
        <div aria-hidden className="glass-shell-rim" />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
