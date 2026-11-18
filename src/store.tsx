import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Autonomy, Tone } from "@shared/protocol";
import type { SceneId } from "./lib/scenes";
import { DEFAULT_WALLPAPER, isWallpaperId, type WallpaperSettings } from "./lib/wallpaper";

export type { Autonomy, Tone } from "@shared/protocol";

export interface Profile {
  name: string;
  role: string;
  goals: string[];
  tone: Tone;
}

export interface Tools {
  web: boolean;
  code: boolean;
  files: boolean;
  memory: boolean;
}

export interface AppState {
  onboarded: boolean;
  profile: Profile;
  tools: Tools;
  autonomy: Autonomy;
  defaultModel: string;
  scene: SceneId;
  quality: "full" | "lite";
  motion: boolean;
  wallpaper: WallpaperSettings;
  /** Composer defaults to the sequential deep-research pre-pass. */
  researchMode: boolean;
}

const isChromium =
  typeof navigator !== "undefined" &&
  /Chrome|Chromium|Edg\//.test(navigator.userAgent) &&
  !/Firefox/.test(navigator.userAgent);

const initial = (): AppState => ({
  onboarded: false,
  profile: { name: "", role: "", goals: [], tone: "balanced" },
  tools: { web: true, code: true, files: true, memory: true },
  autonomy: "balanced",
  defaultModel: "",
  scene: "dusk",
  quality: isChromium ? "full" : "lite",
  motion: true,
  wallpaper: { ...DEFAULT_WALLPAPER },
  researchMode: false,
});

const KEY = "hikes:v2";
const LEGACY_KEY = "ridgeline:v1";

const isAutonomy = (value: unknown): value is Autonomy =>
  value === "ask" || value === "balanced" || value === "auto";
const isTone = (value: unknown): value is Tone =>
  value === "concise" || value === "balanced" || value === "thorough";
const isScene = (value: unknown): value is SceneId =>
  value === "dusk" || value === "aurora" || value === "dawn" || value === "ember";

function merge(base: AppState, raw: Partial<AppState>, legacy = false): AppState {
  const profile: Partial<Profile> = raw.profile ?? {};
  const wallpaper = (raw.wallpaper ?? {}) as Partial<WallpaperSettings>;
  const num = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    ...base,
    onboarded: Boolean(raw.onboarded),
    profile: {
      name: typeof profile.name === "string" ? profile.name : base.profile.name,
      role: typeof profile.role === "string" ? profile.role : base.profile.role,
      goals: Array.isArray(profile.goals) ? profile.goals.filter((g): g is string => typeof g === "string") : base.profile.goals,
      tone: isTone(profile.tone) ? profile.tone : base.profile.tone,
    },
    tools: {
      web: raw.tools?.web !== undefined ? Boolean(raw.tools.web) : base.tools.web,
      code: raw.tools?.code !== undefined ? Boolean(raw.tools.code) : base.tools.code,
      files: raw.tools?.files !== undefined ? Boolean(raw.tools.files) : base.tools.files,
      memory: raw.tools?.memory !== undefined ? Boolean(raw.tools.memory) : base.tools.memory,
    },
    autonomy: isAutonomy(raw.autonomy) ? raw.autonomy : base.autonomy,
    defaultModel: typeof raw.defaultModel === "string" && !legacy && !raw.defaultModel.startsWith("demo:") ? raw.defaultModel : base.defaultModel,
    scene: isScene(raw.scene) ? raw.scene : base.scene,
    quality: raw.quality === "full" || raw.quality === "lite" ? raw.quality : base.quality,
    motion: typeof raw.motion === "boolean" ? raw.motion : base.motion,
    wallpaper: {
      id: isWallpaperId(wallpaper.id) ? wallpaper.id : base.wallpaper.id,
      image: typeof wallpaper.image === "string" ? wallpaper.image : base.wallpaper.image,
      color: typeof wallpaper.color === "string" ? wallpaper.color : base.wallpaper.color,
      opacity: num(wallpaper.opacity, base.wallpaper.opacity, 0, 100),
      blur: num(wallpaper.blur, base.wallpaper.blur, 0, 40),
      dim: num(wallpaper.dim, base.wallpaper.dim, 0, 80),
      parallax: typeof wallpaper.parallax === "boolean" ? wallpaper.parallax : base.wallpaper.parallax,
    },
    researchMode: typeof raw.researchMode === "boolean" ? raw.researchMode : base.researchMode,
  };
}

function load(): AppState {
  const base = initial();
  try {
    const current = localStorage.getItem(KEY);
    if (current) return merge(base, JSON.parse(current) as Partial<AppState>);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return merge(base, JSON.parse(legacy) as Partial<AppState>, true);
    return base;
  } catch {
    return base;
  }
}

interface Ctx {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setTools: (patch: Partial<Tools>) => void;
  reset: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* quota */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state]);

  const set = useCallback((patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })), []);
  const setProfile = useCallback(
    (patch: Partial<Profile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
    [],
  );
  const setTools = useCallback(
    (patch: Partial<Tools>) => setState((s) => ({ ...s, tools: { ...s.tools, ...patch } })),
    [],
  );
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setState({ ...initial(), scene: "dusk" });
  }, []);

  const value = useMemo(
    () => ({ state, set, setProfile, setTools, reset }),
    [state, set, setProfile, setTools, reset],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
