import { useEffect } from "react";
import { useStore } from "../store";
import { wallpaperCss } from "../lib/wallpaper";
import { Scene } from "./Scene";

/**
 * Two wallpaper elements share these variables: the real wallpaper behind the
 * shell and the refracted copy inside it. Keeping parallax on the document
 * root means both move in lockstep.
 */
const PARALLAX_X = "--wp-px";
const PARALLAX_Y = "--wp-py";

/**
 * The wallpaper itself, without its own positioning wrapper. Rendered behind
 * the shell and again inside the lens layer, so the copy must stay pixel
 * aligned with the original.
 */
export function WallpaperArt({ still = false }: { still?: boolean }) {
  const { state } = useStore();
  const wp = state.wallpaper;
  const alpine = wp.id === "alpine";
  const base = wallpaperCss(wp);
  const custom = wp.id === "custom";
  const motion = still ? false : state.motion;

  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          opacity: alpine ? wp.opacity / 100 : 0,
          filter: alpine && wp.blur > 0 ? `blur(${wp.blur}px)` : undefined,
          transform: "scale(1.04)",
          transition: "opacity 600ms ease, filter 400ms ease",
        }}
      >
        {/* The rim copy animates on the compositor too, so it needs the layers
            live even though it does not follow the pointer. */}
        <Scene
          motion={motion}
          animateLayers={still ? state.motion : motion}
          variant={still ? "rim" : "live"}
        />
      </div>

      {!alpine && (
        <div
          className="absolute inset-0"
          style={{
            background: custom
              ? wp.image
                ? `url("${wp.image}") center / ${wp.fit ?? "cover"} no-repeat`
                : "repeating-linear-gradient(135deg, rgba(255,255,255,.06) 0 18px, rgba(255,255,255,.015) 18px 36px), #120a2b"
              : base,
            backgroundColor: custom ? "#0b0b33" : undefined,
            backgroundSize:
              wp.id === "grid" ? "48px 48px, 48px 48px, cover, cover" : undefined,
            opacity: wp.opacity / 100,
            filter: wp.blur > 0 ? `blur(${wp.blur}px)` : undefined,
            transform:
              custom && wp.fit === "contain"
                ? "none"
                : `translate3d(var(${PARALLAX_X}, 0px), var(${PARALLAX_Y}, 0px), 0) scale(1.06)`,
            willChange: wp.parallax && !(custom && wp.fit === "contain") ? "transform" : undefined,
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{ background: `rgba(5,3,22,${wp.dim / 100})`, transition: "background-color 400ms ease" }}
      />
    </>
  );
}

/**
 * Wallpaper and ambient background. Always rendered behind the single
 * full-window glass shell, so the wallpaper shows through the margins.
 */
export function WallpaperLayer() {
  const { state } = useStore();
  const wp = state.wallpaper;

  useEffect(() => {
    if (!wp.parallax || !state.motion || wp.id === "alpine") return;
    const root = document.documentElement;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let running = false;
    const apply = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      root.style.setProperty(PARALLAX_X, `${(cx * 14).toFixed(2)}px`);
      root.style.setProperty(PARALLAX_Y, `${(cy * 14).toFixed(2)}px`);
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
      root.style.removeProperty(PARALLAX_X);
      root.style.removeProperty(PARALLAX_Y);
    };
  }, [wp.parallax, wp.id, state.motion]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <WallpaperArt />
    </div>
  );
}
