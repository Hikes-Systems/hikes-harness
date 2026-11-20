import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { lensMask, type LensGeometry } from "../lib/lens";
import { QUALITY } from "../lib/quality";
import { WallpaperArt } from "./Wallpaper";

/**
 * The rim lens.
 *
 * A full-panel frosted copy would force Chromium to re-rasterise a filter on
 * every frame of the animated wallpaper, which is far too slow. Instead the
 * live wallpaper shows through the clear shell untouched, and this layer
 * renders one extra copy clipped to a soft ring around the edge. The copy is
 * magnified a few percent, producing the visible rim refraction.
 *
 * The rim copy runs the same CSS animations as the live scene, phase-locked
 * to it once through the Web Animations API. Both are then driven by the
 * compositor, which is far cheaper than copying computed styles across at a
 * low frame rate: reading them forced a style recalc and a re-raster of the
 * mountain layers every time it ran, and the animation visibly stuttered.
 */
export function GlassLens() {
  const { state } = useStore();
  const layerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<LensGeometry | null>(null);

  const measure = useCallback(() => {
    const layer = layerRef.current;
    const shell = layer?.parentElement;
    if (!layer || !shell) return;
    const radius = Number.parseFloat(getComputedStyle(shell).borderTopLeftRadius) || 40;
    const next: LensGeometry = {
      width: layer.offsetWidth,
      height: layer.offsetHeight,
      panel: {
        x: Math.max(0, -layer.offsetLeft),
        y: Math.max(0, -layer.offsetTop),
        width: shell.clientWidth,
        height: shell.clientHeight,
        radius,
      },
    };
    setGeometry((prev) =>
      prev &&
      prev.width === next.width &&
      prev.height === next.height &&
      prev.panel.x === next.panel.x &&
      prev.panel.y === next.panel.y &&
      prev.panel.width === next.panel.width &&
      prev.panel.height === next.panel.height &&
      prev.panel.radius === next.panel.radius
        ? prev
        : next,
    );
  }, []);

  // The rim refraction renders a second copy of the scene, and that second
  // copy is the single most expensive thing on screen — five more full-width
  // mountain layers. It is parked with the liquid path until both are
  // reworked; the shell still reads as glass without it, and the mountains
  // run at full speed.
  const enabled = QUALITY.liquidAvailable;

  useLayoutEffect(() => {
    if (!enabled) return;
    measure();
    const layer = layerRef.current;
    const shell = layer?.parentElement;
    const observer = new ResizeObserver(measure);
    if (layer) observer.observe(layer);
    if (shell) observer.observe(shell);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, enabled]);

  const mask = enabled && geometry ? lensMask(geometry) : "";
  // Lock the rim copy's animations to the live scene's phase. Both sets have
  // the same durations and delays, so one alignment keeps them in step for
  // as long as they run.
  useEffect(() => {
    if (!enabled || state.wallpaper.id !== "alpine") return;
    const live = document.querySelector('[data-scene="live"]');
    const rim = document.querySelector('[data-scene="rim"]');
    if (!live || !rim) return;
    const from = live.getAnimations({ subtree: true });
    const to = rim.getAnimations({ subtree: true });
    const count = Math.min(from.length, to.length);
    for (let i = 0; i < count; i++) {
      const time = from[i].currentTime;
      if (typeof time === "number") to[i].currentTime = time;
    }
  }, [enabled, state.wallpaper.id, state.motion]);

  // The pointer parallax is written to inline styles by the scene, so copying
  // it is a cheap read and a write only when the value actually changed.
  useEffect(() => {
    if (!enabled || state.wallpaper.id !== "alpine") return;
    const live = document.querySelector('[data-scene="live"]');
    const rim = document.querySelector('[data-scene="rim"]');
    if (!live || !rim) return;
    const from = live.querySelectorAll<HTMLElement>("[data-parallax]");
    const to = rim.querySelectorAll<HTMLElement>("[data-parallax]");
    if (!from.length || from.length !== to.length) return;
    let raf = 0;
    const tick = () => {
      for (let i = 0; i < from.length; i++) {
        const transform = from[i].style.transform;
        if (transform && transform !== to[i].style.transform) to[i].style.transform = transform;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, state.wallpaper.id]);

  return (
    <div
      ref={layerRef}
      aria-hidden
      data-glass-lens
      className="pointer-events-none absolute -inset-3 z-0 overflow-hidden sm:-inset-4"
      style={{
        maskImage: mask || "linear-gradient(transparent, transparent)",
        WebkitMaskImage: mask || "linear-gradient(transparent, transparent)",
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        opacity: mask ? 1 : 0,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: "scale(1.06)",
          transformOrigin: "50% 50%",
          willChange: "transform",
        }}
      >
        {mask && <WallpaperArt still />}
      </div>
    </div>
  );
}
