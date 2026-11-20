import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Autonomy, Tone } from "@shared/protocol";
import { AGENTS, agentById, type AgentIdentity } from "@shared/agents";
import type { SceneId } from "./lib/scenes";
import { DEFAULT_WALLPAPER, isWallpaperId, type WallpaperSettings } from "./lib/wallpaper";
import { defaultIdentities, defaultIdentity, isMascotId } from "./lib/mascots";
import { saveSettings } from "./lib/api";

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
  /** Per-agent display names and mascots. */
  agents: Record<string, AgentIdentity>;
  /** Composer defaults to the sequential deep-research pre-pass. */
  researchMode: boolean;
}

const initial = (): AppState => ({
  onboarded: false,
  profile: { name: "", role: "", goals: [], tone: "balanced" },
  tools: { web: true, code: true, files: true, memory: true },
  autonomy: "balanced",
  defaultModel: "",
  scene: "dusk",
  // Lite is the standard. The liquid refraction is parked behind a flag in
  // src/lib/quality.ts until it is reworked — see the changelog.
  quality: "lite",
  motion: true,
  wallpaper: { ...DEFAULT_WALLPAPER },
  agents: defaultIdentities(),
  researchMode: false,
});

const KEY = "hikes:v2";
/** Written exactly once, when the setup wizard is completed. Never cleared by the app. */
const SETUP_KEY = "hikes:setup-complete";

/**
 * The parts of the state that only ever existed in the browser.
 *
 * They are mirrored to the server so a launch on a different port — a
 * different origin, with an empty browser profile — does not lose the user's
 * wallpaper, agents and profile.
 */
const MIRRORED_FIELDS = [
  "profile",
  "scene",
  "quality",
  "motion",
  "wallpaper",
  "agents",
  "researchMode",
] as const;

/** True when this browser origin has never stored any Hikes state. */
function hasLocalState(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

const isAutonomy = (value: unknown): value is Autonomy =>
  value === "ask" || value === "balanced" || value === "auto";
const isTone = (value: unknown): value is Tone =>
  value === "concise" || value === "balanced" || value === "thorough";
const isScene = (value: unknown): value is SceneId =>
  value === "dusk" || value === "aurora" || value === "dawn" || value === "ember";

function mergeAgents(raw: unknown, base: Record<string, AgentIdentity>): Record<string, AgentIdentity> {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, Partial<AgentIdentity>>) : {};
  const out: Record<string, AgentIdentity> = {};
  for (const agent of AGENTS) {
    const fallback = base[agent.id] ?? defaultIdentity(agent.id);
    const identity = source[agent.id];
    out[agent.id] = {
      name:
        typeof identity?.name === "string" && identity.name.trim()
          ? identity.name.trim().slice(0, 40)
          : fallback.name,
      mascot: isMascotId(identity?.mascot) ? identity.mascot : fallback.mascot,
    };
  }
  return out;
}

function merge(base: AppState, raw: Partial<AppState>, legacy = false): AppState {
  const profile: Partial<Profile> = raw.profile ?? {};
  const wallpaper = (raw.wallpaper ?? {}) as Partial<WallpaperSettings>;
  const num = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    ...base,
    onboarded: raw.onboarded === undefined ? base.onboarded : Boolean(raw.onboarded),
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
    // The liquid refraction is not stable yet, so the stored quality is
    // ignored and lite is used everywhere.
    quality: "lite",
    motion: typeof raw.motion === "boolean" ? raw.motion : base.motion,
    wallpaper: {
      id: isWallpaperId(wallpaper.id) ? wallpaper.id : base.wallpaper.id,
      image: typeof wallpaper.image === "string" ? wallpaper.image : base.wallpaper.image,
      color: typeof wallpaper.color === "string" ? wallpaper.color : base.wallpaper.color,
      opacity: num(wallpaper.opacity, base.wallpaper.opacity, 0, 100),
      blur: num(wallpaper.blur, base.wallpaper.blur, 0, 40),
      dim: num(wallpaper.dim, base.wallpaper.dim, 0, 80),
      fit: wallpaper.fit === "contain" ? "contain" : "cover",
      parallax: typeof wallpaper.parallax === "boolean" ? wallpaper.parallax : base.wallpaper.parallax,
    },
    agents: mergeAgents(raw.agents, base.agents),
    researchMode: typeof raw.researchMode === "boolean" ? raw.researchMode : base.researchMode,
  };
}

function load(): AppState {
  const base = initial();
  try {
    const setupDone = localStorage.getItem(SETUP_KEY) === "1";
    const current = localStorage.getItem(KEY);
    if (current) {
      const raw = JSON.parse(current) as Partial<AppState>;
      // Users who finished setup before the guard existed keep their completed state.
      if (raw.onboarded && !setupDone) localStorage.setItem(SETUP_KEY, "1");
      return { ...merge(base, raw), onboarded: setupDone || Boolean(raw.onboarded) };
    }
    return { ...base, onboarded: setupDone };
  } catch {
    return base;
  }
}

interface Ctx {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setTools: (patch: Partial<Tools>) => void;
  /** Rename an agent or choose its mascot. */
  setAgentIdentity: (id: string, patch: Partial<AgentIdentity>) => void;
  resetAgentIdentity: (id: string) => void;
  /** Marks onboarding complete permanently for this browser profile. */
  completeSetup: () => void;
  /** Restores the server's mirror of the interface state for a fresh origin. */
  restore: (ui: Record<string, unknown> | null | undefined) => void;
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
  const setAgentIdentity = useCallback(
    (id: string, patch: Partial<AgentIdentity>) =>
      setState((s) => {
        const key = agentById(id).id;
        const current = s.agents[key] ?? defaultIdentity(key);
        return {
          ...s,
          agents: {
            ...s.agents,
            [key]: {
              ...current,
              ...patch,
              name:
                typeof patch.name === "string"
                  ? patch.name.slice(0, 40)
                  : current.name,
            },
          },
        };
      }),
    [],
  );
  const resetAgentIdentity = useCallback(
    (id: string) =>
      setState((s) => {
        const key = agentById(id).id;
        return { ...s, agents: { ...s.agents, [key]: defaultIdentity(key) } };
      }),
    [],
  );
  const completeSetup = useCallback(() => {
    try {
      localStorage.setItem(SETUP_KEY, "1");
    } catch {
      /* storage may be unavailable; the in-memory state still advances */
    }
    setState((s) => ({ ...s, onboarded: true }));
    // Record it on the server as well, so the wizard does not come back when
    // the browser lands on a different origin.
    void saveSettings({ onboarded: true }).catch(() => undefined);
  }, []);

  const restore = useCallback((ui: Record<string, unknown> | null | undefined) => {
    if (!ui) return;
    // Local state always wins: the mirror only fills a gap on a new origin.
    if (hasLocalState()) return;
    setState((s) => merge(s, ui as Partial<AppState>));
  }, []);

  // Mirror the browser-only state to the server, so it survives a change of
  // origin. Debounced, and skipped entirely when nothing relevant changed.
  const lastMirror = useRef("");
  useEffect(() => {
    const payload: Record<string, unknown> = {};
    for (const field of MIRRORED_FIELDS) payload[field] = state[field];
    const serialized = JSON.stringify(payload);
    if (serialized === lastMirror.current) return;
    const timer = setTimeout(() => {
      lastMirror.current = serialized;
      void saveSettings({ ui: payload }).catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [state]);

  const value = useMemo(
    () => ({ state, set, setProfile, setTools, setAgentIdentity, resetAgentIdentity, completeSetup, restore }),
    [state, set, setProfile, setTools, setAgentIdentity, resetAgentIdentity, completeSetup, restore],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
