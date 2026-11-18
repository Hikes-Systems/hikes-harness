import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import LiquidGlass from "liquid-glass-react";
import { useStore } from "../store";
import { cn } from "../utils/cn";

/* Constant objects => liquid-glass-react skips its per-instance mousemove listeners (no re-renders, smoother) */
const STILL = { x: 0, y: 0 };

const PRESETS = {
  sm: { displacement: 38, blur: 0.05, aberration: 1.2, saturation: 150 },
  md: { displacement: 58, blur: 0.06, aberration: 1.8, saturation: 155 },
  lg: { displacement: 72, blur: 0.07, aberration: 2.2, saturation: 160 },
} as const;

interface GlassProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  radius?: number;
  strength?: keyof typeof PRESETS;
  /** force the cheap CSS version */
  css?: boolean;
  tint?: string;
  style?: CSSProperties;
  animate?: boolean;
  /** blur override for liquid mode (0–1) and solid bg colour for lite mode */
  blur?: number;
  solid?: string;
  /** extra explicit backdrop blur (px) drawn under the lens — for surfaces over busy content */
  backdropBlur?: number;
}

/**
 * Real SVG-refraction liquid glass (liquid-glass-react) drawn *behind* normally-flowing content,
 * so layout stays natural. The lens is resized via ResizeObserver.
 * NB: never put opacity/filter on an ancestor — that would create a backdrop root and flatten the effect.
 */
export function Glass({
  children, className, contentClassName, radius = 28, strength = "md", css, tint, style, animate, blur, solid, backdropBlur,
}: GlassProps) {
  const { state } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const liquid = state.quality === "full" && !css;

  useLayoutEffect(() => {
    if (!liquid) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const box = e.borderBoxSize?.[0];
      const w = Math.round(box ? box.inlineSize : e.contentRect.width);
      const h = Math.round(box ? box.blockSize : e.contentRect.height);
      if (w < 2 || h < 2) return;
      setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [liquid]);

  // liquid-glass-react only re-measures on window resize
  useEffect(() => {
    if (!size) return;
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [size?.w, size?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!liquid) return;
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 1000);
    return () => clearTimeout(t);
  }, [liquid]);

  const p = PRESETS[strength];
  const base = tint ?? "linear-gradient(160deg, rgba(255,255,255,.13), rgba(255,255,255,.02) 45%, rgba(20,12,70,.16))";

  return (
    <div
      ref={ref}
      className={cn("relative", !liquid && "glass-css", animate && "a-rise", className)}
      style={{ borderRadius: radius, ...(!liquid && solid ? { backgroundColor: solid } : null), ...style }}
    >
      {liquid && (
        <>
          {backdropBlur ? (
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ borderRadius: radius, backdropFilter: `blur(${backdropBlur}px) saturate(1.4)`, WebkitBackdropFilter: `blur(${backdropBlur}px) saturate(1.4)` }} />
          ) : null}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ borderRadius: radius }}>
            {size && (
              <LiquidGlass
                style={{ position: "absolute", top: "50%", left: "50%" }}
                cornerRadius={radius}
                padding="0px"
                displacementScale={p.displacement}
                blurAmount={blur ?? p.blur}
                saturation={p.saturation}
                aberrationIntensity={p.aberration}
                elasticity={0}
                globalMousePos={STILL}
                mouseOffset={STILL}
              >
                <div style={{ width: size.w, height: size.h }} />
              </LiquidGlass>
            )}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ borderRadius: radius, background: base, boxShadow: "inset 0 0 40px rgba(255,255,255,.05)" }} />
        </>
      )}
      <div className={cn("relative z-10", contentClassName)} style={{ borderRadius: radius }}>{children}</div>
    </div>
  );
}
