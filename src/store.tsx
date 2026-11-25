import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Autonomy, Tone } from "@shared/protocol";
import { saveSettings } from "./lib/api";
import { DEFAULT_PALETTE, isSessionNav, migrateTheme, paletteInfo, type Palette, type SessionNav } from "./lib/palettes";

export type { Autonomy, Tone } from "@shared/protocol";
export type { Palette, SessionNav } from "./lib/palettes";

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
  /** Interface palette: six families, each a light or dark scheme. */
  theme: Palette;
  /** Session index placement: docked rail, drop-down panel, or hidden. */
  sessionNav: SessionNav;
  /** Interface motion. Off pauses every transition and animation. */
  motion: boolean;
  /** Composer defaults to the sequential deep-research pre-pass. */
  researchMode: boolean;
}

const initial = (): AppState => ({
  onboarded: false,
  profile: { name: "", role: "", goals: [], tone: "balanced" },
  tools: { web: true, code: true, files: true, memory: true },
  autonomy: "balanced",
  defaultModel: "",
  theme: DEFAULT_PALETTE,
  sessionNav: "sidebar",
  motion: true,
  researchMode: false,
});

const KEY = "hikes:v3";
/** Written exactly once, when the setup wizard is completed. Never cleared by the app. */
const SETUP_KEY = "hikes:setup-complete";

/**
 * The parts of the state that only ever existed in the browser.
 *
 * They are mirrored to the server so a launch on a different port — a
 * different origin, with an empty browser profile — does not lose the user's
 * theme, session layout and profile.
 */
const MIRRORED_FIELDS = ["profile", "theme", "sessionNav", "motion", "researchMode"] as const;

/** True when this origin already holds state from an earlier visit. */
function hasLocalState(): boolean {
  try {
    return localStorage.getItem(KEY) !== null || localStorage.getItem("hikes:v2") !== null;
  } catch {
    return false;
  }
}

/**
 * Captured once, before the persistence effect has a chance to write the
 * untouched initial state. `restore` must not consult localStorage later: by
 * then every origin looks "local" and the server mirror would never apply.
 */
const HAD_LOCAL_AT_BOOT = hasLocalState();

const isAutonomy = (value: unknown): value is Autonomy =>
  value === "ask" || value === "balanced" || value === "auto";
const isTone = (value: unknown): value is Tone =>
  value === "concise" || value === "balanced" || value === "thorough";

function merge(base: AppState, raw: Partial<AppState>, legacy = false): AppState {
  const profile: Partial<Profile> = raw.profile ?? {};
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
    theme: migrateTheme(raw.theme) ?? base.theme,
    sessionNav: isSessionNav(raw.sessionNav) ? raw.sessionNav : base.sessionNav,
    motion: typeof raw.motion === "boolean" ? raw.motion : base.motion,
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
    // Carry the profile and research preference over from the previous store
    // version. Old agent identities are intentionally retired.
    const previous = localStorage.getItem("hikes:v2");
    if (previous) {
      const raw = JSON.parse(previous) as Partial<AppState>;
      if (raw.onboarded && !setupDone) localStorage.setItem(SETUP_KEY, "1");
      return { ...merge(base, { profile: raw.profile, researchMode: raw.researchMode }), onboarded: setupDone || Boolean(raw.onboarded) };
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
  /** Marks onboarding complete permanently for this browser profile. */
  completeSetup: () => void;
  /** Restores the server's mirror of the interface state for a fresh origin. */
  restore: (ui: Record<string, unknown> | null | undefined) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  /** The server mirror is applied once, not on every bootstrap refresh. */
  const restored = useRef(false);

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

  // Keep the browser chrome colour in step with the palette.
  useEffect(() => {
    const palette = paletteInfo(state.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", palette.chrome);
    // The page background is painted by `html`, outside the app's themed
    // subtree, so the attribute has to reach the document element too.
    document.documentElement.setAttribute("data-theme", state.theme);
    document.documentElement.setAttribute("data-scheme", palette.scheme);
  }, [state.theme]);

  const set = useCallback((patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })), []);
  const setProfile = useCallback(
    (patch: Partial<Profile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
    [],
  );
  const setTools = useCallback(
    (patch: Partial<Tools>) => setState((s) => ({ ...s, tools: { ...s.tools, ...patch } })),
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
    if (HAD_LOCAL_AT_BOOT || restored.current) return;
    restored.current = true;
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
    () => ({ state, set, setProfile, setTools, completeSetup, restore }),
    [state, set, setProfile, setTools, completeSetup, restore],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
