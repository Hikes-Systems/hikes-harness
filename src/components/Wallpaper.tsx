import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { wallpaperCss } from "../lib/wallpaper";
import { Scene } from "./Scene";

/**
 * Wallpaper and ambient background. Always rendered behind the single
 * full-window glass shell, so the wallpaper shows through the margins.
 */
export function WallpaperLayer() {
  const { state } = useStore();
  const wp = state.wallpaper;
  const art = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wp.parallax || !state.motion || wp.id === "alpine") return;
    const el = art.current;
    if (!el) return;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let running = false;
    const apply = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.style.transform = `translate3d(${(cx * 14).toFixed(2)}px, ${(cy * 14).toFixed(2)}px, 0) scale(1.06)`;
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) raf = requestAnimationFrame(apply);
      else running = false;
    };
    const onMove = (event: PointerEvent) => {
      tx = (event.clientX / window.innerWidth - 0.5) * 2;
      ty = (event.clientY / window.innerHeight - 0.5) * 2;
      if (!running) {
        running = true;
        raf = requestAnimationFrame(apply);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [wp.parallax, wp.id, state.motion]);

  const alpine = wp.id === "alpine";
  const base = wallpaperCss(wp);
  const custom = wp.id === "custom";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          opacity: alpine ? wp.opacity / 100 : 0,
          filter: alpine && wp.blur > 0 ? `blur(${wp.blur}px)` : undefined,
          transform: "scale(1.04)",
          transition: "opacity 600ms ease, filter 400ms ease",
        }}
      >
        <Scene motion={state.motion} />
      </div>

      {!alpine && (
        <div
          ref={art}
          className="absolute inset-0"
          style={{
            background: custom
              ? wp.image
                ? `url("${wp.image}") center / cover no-repeat`
                : "repeating-linear-gradient(135deg, rgba(255,255,255,.06) 0 18px, rgba(255,255,255,.015) 18px 36px), #120a2b"
              : base,
            backgroundSize:
              wp.id === "grid" ? "48px 48px, 48px 48px, cover, cover" : undefined,
            opacity: wp.opacity / 100,
            filter: wp.blur > 0 ? `blur(${wp.blur}px)` : undefined,
            transform: "scale(1.06)",
            willChange: wp.parallax ? "transform" : undefined,
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{ background: `rgba(5,3,22,${wp.dim / 100})`, transition: "background-color 400ms ease" }}
      />
    </div>
  );
}
