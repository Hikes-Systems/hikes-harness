import { memo, useEffect, useMemo, useRef } from "react";

/* Seeded RNG so the mountain range is identical every load */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LayerCfg {
  seed: number; base: number; amp: number; freq: number; oct: number;
  h: number; dur: number; px: number; fog: number; snow: number; sharp: number;
}

const LAYERS: LayerCfg[] = [
  { seed: 11, base: 120, amp: 215, freq: 3, oct: 4, h: 58, dur: 260, px: -5, fog: 48, snow: 34, sharp: 1.15 },
  { seed: 23, base: 100, amp: 215, freq: 4, oct: 4, h: 47, dur: 180, px: -11, fog: 40, snow: 26, sharp: 1.25 },
  { seed: 37, base: 80, amp: 215, freq: 4, oct: 5, h: 38, dur: 120, px: -19, fog: 30, snow: 18, sharp: 1.3 },
  { seed: 53, base: 60, amp: 200, freq: 5, oct: 5, h: 29, dur: 80, px: -30, fog: 20, snow: 10, sharp: 1.2 },
  { seed: 71, base: 36, amp: 170, freq: 6, oct: 5, h: 20, dur: 52, px: -46, fog: 8, snow: 6, sharp: 1.1 },
];

const W = 1600;
const H = 400;

function ridge(cfg: LayerCfg) {
  const rnd = mulberry32(cfg.seed);
  const lattices = Array.from({ length: cfg.oct }, (_, o) => {
    const n = cfg.freq * 2 ** o;
    return { n, v: Array.from({ length: n }, rnd) };
  });
  const sample = (x: number) => {
    let sum = 0, amp = 1, norm = 0;
    for (const { n, v } of lattices) {
      const t = x * n;
      const i = Math.floor(t);
      const f = t - i;
      const a = v[i % n], b = v[(i + 1) % n];
      const s = f * f * (3 - 2 * f);
      const val = a + (b - a) * s;
      sum += (1 - Math.abs(2 * val - 1)) * amp; // ridged -> pointed summits
      norm += amp;
      amp *= 0.52;
    }
    return Math.pow(sum / norm, cfg.sharp);
  };
  const steps = 420;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W;
    const y = H - (cfg.base + cfg.amp * sample(i / steps) * 0.78);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const top = "M" + pts.join(" L");
  const first = `${W},${H} 0,${H}`;
  return { fill: `${top} L${first} Z`, top, topShift: top };
}

function stars(n: number, seed: number) {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => `${(r() * 100).toFixed(1)}vw ${(r() * 52).toFixed(1)}vh 0 0 rgba(255,255,255,${(0.5 + r() * 0.5).toFixed(2)})`).join(",");
}

function SceneImpl({ motion }: { motion: boolean }) {
  const paths = useMemo(() => LAYERS.map(ridge), []);
  const starsA = useMemo(() => stars(46, 5), []);
  const starsB = useMemo(() => stars(64, 9), []);
  const parRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sunRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!motion) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, running = false;
    const apply = () => {
      cx += (tx - cx) * 0.055;
      cy += (ty - cy) * 0.055;
      parRefs.current.forEach((el, i) => {
        if (el) el.style.transform = `translate3d(${(cx * LAYERS[i].px).toFixed(2)}px, ${(cy * LAYERS[i].px * 0.35).toFixed(2)}px, 0)`;
      });
      if (sunRef.current) sunRef.current.style.transform = `translate3d(${(cx * 3).toFixed(2)}px, ${(cy * 2).toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) raf = requestAnimationFrame(apply);
      else running = false;
    };
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!running) { running = true; raf = requestAnimationFrame(apply); }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, [motion]);

  return (
    <div aria-hidden data-motion={motion ? "on" : "off"} className="pointer-events-none fixed inset-0 overflow-hidden sky">
      {/* stars */}
      <div className="absolute left-0 top-0 h-[55%] w-full">
        <div className="stars-a scene-anim" style={{ boxShadow: starsA }} />
        <div className="stars-b scene-anim" style={{ boxShadow: starsB }} />
      </div>

      {/* aurora */}
      <div className="absolute inset-x-[-10%] top-[2%] h-[55%]">
        <div className="aurora-band scene-anim absolute inset-0" style={{
          background: "radial-gradient(ellipse 38% 46% at 28% 42%, var(--au1), transparent 70%), radial-gradient(ellipse 30% 40% at 68% 30%, var(--au2), transparent 70%)",
          animation: "aurora-a 22s ease-in-out infinite alternate",
        }} />
        <div className="aurora-band scene-anim absolute inset-0" style={{
          background: "radial-gradient(ellipse 34% 36% at 52% 52%, var(--au1), transparent 70%), radial-gradient(ellipse 26% 42% at 84% 44%, var(--au2), transparent 70%)",
          animation: "aurora-b 28s ease-in-out infinite alternate", opacity: "calc(var(--aurora) * .7)",
        }} />
      </div>

      {/* sun / moon */}
      <div ref={sunRef} className="absolute left-[60%] bottom-[33%] aspect-square w-[min(30vw,380px)] -translate-x-1/2" style={{ willChange: "transform" }}>
        <div className="scene-anim h-full w-full" style={{ animation: "sun-float 140s ease-in-out infinite alternate", willChange: "transform" }}>
          <div className="sun-glow absolute left-1/2 top-1/2 aspect-square w-[320%] -translate-x-1/2 -translate-y-1/2" />
          <div className="sun-core absolute inset-[18%] rounded-full" />
        </div>
      </div>

      {/* mountain layers */}
      {LAYERS.map((cfg, i) => (
        <div key={i} className="absolute" style={{ left: -70, right: -70, bottom: "-1vh", height: `${cfg.h}vh` }}>
          <div ref={(el) => { parRefs.current[i] = el; }} className="absolute inset-0" style={{ willChange: "transform" }}>
            <div className="scroll-layer absolute left-0 top-0 h-full w-[200%]" style={{ ["--dur" as string]: `${cfg.dur}s` }}>
              <svg className="h-full w-full" viewBox={`0 0 ${W * 2} ${H}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`mg${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: `color-mix(in oklab, var(--m${i + 1}), white ${cfg.snow}%)` }} />
                    <stop offset="0.24" style={{ stopColor: `var(--m${i + 1})` }} />
                    <stop offset="1" style={{ stopColor: `color-mix(in oklab, var(--m${i + 1}) ${100 - cfg.fog}%, var(--fog))` }} />
                  </linearGradient>
                </defs>
                {[0, W].map((dx) => (
                  <g key={dx} transform={`translate(${dx} 0)`}>
                    <path d={paths[i].fill} fill={`url(#mg${i})`} />
                    <path d={paths[i].top} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.1" vectorEffect="non-scaling-stroke" style={{ opacity: 0.55 - i * 0.08 }} />
                  </g>
                ))}
              </svg>
            </div>
          </div>
          {/* mist drifting in front of each layer except the last */}
          {i < 4 && (
            <div className="scene-anim absolute left-[-20%] w-[140%]" style={{
              bottom: "6%", height: "46%", willChange: "transform",
              background: "radial-gradient(ellipse 50% 50% at 50% 60%, color-mix(in oklab, var(--fog) 34%, transparent), transparent 72%)",
              animation: `mist ${44 + i * 9}s ease-in-out ${-i * 11}s infinite alternate`,
            }} />
          )}
        </div>
      ))}

      {/* readability vignettes + grain */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(6,4,30,.34) 0%, rgba(6,4,30,0) 34%, rgba(6,4,30,0) 62%, rgba(6,4,30,.5) 100%)" }} />
      <div className="grain absolute inset-0" />
    </div>
  );
}

export const Scene = memo(SceneImpl);
