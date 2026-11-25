/* Interface palettes. A palette is a light/dark pair that shares a hue and an
   accent, so the same family stays recognisable after dark. Keep ids stable:
   they are persisted in localStorage and mirrored to the server. */
export const PALETTE_IDS = [
  "daylight",
  "porcelain",
  "sage",
  "cinema",
  "graphite",
  "plum",
] as const;
export type Palette = (typeof PALETTE_IDS)[number];
export type ColorScheme = "light" | "dark";

/** Where the session index lives. The top panel keeps the workspace full width. */
export type SessionNav = "sidebar" | "top" | "hidden";

export const SESSION_NAVS: readonly SessionNav[] = ["sidebar", "top", "hidden"];

export interface PaletteInfo {
  id: Palette;
  label: string;
  note: string;
  scheme: ColorScheme;
  /** Browser chrome colour, sampled from the canvas. */
  chrome: string;
  canvas: string;
  surface: string;
  line: string;
  accent: string;
  ink: string;
}

export const PALETTES: readonly PaletteInfo[] = [
  {
    id: "daylight",
    label: "Daylight",
    note: "Glacier white, iris accent",
    scheme: "light",
    chrome: "#eef1f6",
    canvas: "#eef1f6",
    surface: "#ffffff",
    line: "#dfe4ec",
    accent: "#5b55d6",
    ink: "#171923",
  },
  {
    id: "porcelain",
    label: "Porcelain",
    note: "Warm ivory, ink blue",
    scheme: "light",
    chrome: "#f6f2ec",
    canvas: "#f6f2ec",
    surface: "#fffdf9",
    line: "#e6dfd4",
    accent: "#3f5c9e",
    ink: "#201d1a",
  },
  {
    id: "sage",
    label: "Sage",
    note: "Green-grey, deep moss",
    scheme: "light",
    chrome: "#eff2ec",
    canvas: "#eff2ec",
    surface: "#fcfdf9",
    line: "#dde3d8",
    accent: "#3f6b46",
    ink: "#1a2018",
  },
  {
    id: "cinema",
    label: "Cinema",
    note: "Deep navy, luminous iris",
    scheme: "dark",
    chrome: "#080d15",
    canvas: "#080d15",
    surface: "#111925",
    line: "#263448",
    accent: "#9b9dff",
    ink: "#eff4ff",
  },
  {
    id: "graphite",
    label: "Graphite",
    note: "Neutral charcoal, warm sand",
    scheme: "dark",
    chrome: "#141518",
    canvas: "#141518",
    surface: "#1c1e22",
    line: "#31353c",
    accent: "#dcc19b",
    ink: "#f3f3f1",
  },
  {
    id: "plum",
    label: "Plum",
    note: "Aubergine black, rose quartz",
    scheme: "dark",
    chrome: "#161016",
    canvas: "#161016",
    surface: "#211722",
    line: "#3a283c",
    accent: "#e8a8c4",
    ink: "#f8eef5",
  },
];

export const DEFAULT_PALETTE: Palette = "daylight";

export function paletteInfo(id: Palette): PaletteInfo {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);
}

export function isSessionNav(value: unknown): value is SessionNav {
  return typeof value === "string" && (SESSION_NAVS as readonly string[]).includes(value);
}

/** The old two-theme store mapped onto the new families. */
export function migrateTheme(value: unknown): Palette | undefined {
  if (isPalette(value)) return value;
  if (value === "paper") return "daylight";
  if (value === "ink") return "cinema";
  return undefined;
}

const COUNTERPART: Record<Palette, Palette> = {
  daylight: "cinema",
  cinema: "daylight",
  porcelain: "graphite",
  graphite: "porcelain",
  sage: "plum",
  plum: "sage",
};

export function nextScheme(id: Palette): Palette {
  return COUNTERPART[id];
}
