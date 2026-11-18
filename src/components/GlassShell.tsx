import { useState, type ReactNode } from "react";
import { useStore } from "../store";
import { lensMap } from "../lib/lens";

const LENS_FILTER = "hikes-shell-lens";

/**
 * The single curved liquid-glass panel that holds the whole app. The wallpaper
 * stays visible in the margins; everything else lives inside this surface.
 *
 * The panel is not a plain backdrop blur: `lensMap` builds a rounded-rect
 * displacement map, and the SVG filter bends the wallpaper around the rim with
 * a touch of chromatic separation. Lite quality falls back to frosted blur.
 */
export function GlassShell({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const [map] = useState(() => lensMap());
  const liquid = state.quality === "full" && Boolean(map);

  return (
    <div className="fixed inset-0 z-10 p-3 sm:p-4">
      <div
        className="glass-shell shell-in relative flex h-full w-full flex-col overflow-hidden rounded-[30px] sm:rounded-[40px]"
        data-motion={state.motion ? "on" : "off"}
        data-quality={state.quality}
      >
        {liquid && (
          <svg aria-hidden focusable="false" className="pointer-events-none absolute h-0 w-0">
            <defs>
              <filter
                id={LENS_FILTER}
                x="0%"
                y="0%"
                width="100%"
                height="100%"
                colorInterpolationFilters="sRGB"
              >
                <feImage
                  href={map}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  preserveAspectRatio="none"
                  result="MAP"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="MAP"
                  scale="98"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="RED_SHIFT"
                />
                <feColorMatrix
                  in="RED_SHIFT"
                  type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="RED"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="MAP"
                  scale="88"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="CYAN_SHIFT"
                />
                <feColorMatrix
                  in="CYAN_SHIFT"
                  type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
                  result="CYAN"
                />
                <feBlend in="RED" in2="CYAN" mode="screen" result="LENSED" />
                <feGaussianBlur in="LENSED" stdDeviation="0.35" />
              </filter>
            </defs>
          </svg>
        )}
        <div
          aria-hidden
          className="glass-shell-lens"
          style={liquid ? { filter: `url(#${LENS_FILTER})` } : undefined}
        />
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
