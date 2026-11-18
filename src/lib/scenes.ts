import type { CSSProperties } from "react";

export type SceneId = "dusk" | "aurora" | "dawn" | "ember";

export interface SceneDef {
  id: SceneId;
  name: string;
  blurb: string;
  sky: [string, string, string, string, string];
  peaks: [string, string, string, string, string];
  fog: string;
  sun: string;
  accent: string;
  stars: number;
  aurora: number;
  au1: string;
  au2: string;
}

export const SCENES: SceneDef[] = [
  {
    id: "dusk",
    name: "Alpine Dusk",
    blurb: "Violet ridges, rose horizon",
    sky: ["#0b0b33", "#2a1a63", "#6d3b95", "#e5688a", "#ffb58e"],
    peaks: ["#9a63a8", "#6a4399", "#46308a", "#2a2068", "#150f3b"],
    fog: "#ff9e9a",
    sun: "#ffd9a8",
    accent: "#ffb18c",
    stars: 0.45,
    aurora: 0,
    au1: "#7df0d0",
    au2: "#a78bfa",
  },
  {
    id: "aurora",
    name: "Polar Night",
    blurb: "Aurora over glacial blue",
    sky: ["#030515", "#071a3a", "#0b3b5c", "#136b7a", "#2a9a94"],
    peaks: ["#2f6f8f", "#225077", "#173761", "#0e2447", "#06122b"],
    fog: "#5fd8c8",
    sun: "#e9f6ff",
    accent: "#7ff0d2",
    stars: 1,
    aurora: 0.9,
    au1: "#4ff5b5",
    au2: "#7b6bff",
  },
  {
    id: "dawn",
    name: "First Light",
    blurb: "Lilac peaks, peach sunrise",
    sky: ["#1d2a63", "#5058ad", "#b184d6", "#ffa8b8", "#ffe0b0"],
    peaks: ["#b49ad8", "#8c7cc4", "#6a60ae", "#46438c", "#29286a"],
    fog: "#ffd2c0",
    sun: "#fff1cf",
    accent: "#ffd6a0",
    stars: 0.12,
    aurora: 0,
    au1: "#ffd6a0",
    au2: "#ff9ec4",
  },
  {
    id: "ember",
    name: "Ember Ridge",
    blurb: "Molten sky, charcoal summits",
    sky: ["#12051d", "#38103c", "#7c1f4c", "#d9482f", "#ffa94d"],
    peaks: ["#9b3a5c", "#702a58", "#4b1d4e", "#2d1240", "#160824"],
    fog: "#ff8a4a",
    sun: "#ffd08a",
    accent: "#ffbf7a",
    stars: 0.35,
    aurora: 0,
    au1: "#ff9a5a",
    au2: "#ff5a8a",
  },
];

export const sceneById = (id: SceneId) => SCENES.find((s) => s.id === id) ?? SCENES[0];

export function sceneVars(id: SceneId): CSSProperties {
  const s = sceneById(id);
  const v: Record<string, string | number> = {};
  s.sky.forEach((c, i) => (v[`--s${i + 1}`] = c));
  s.peaks.forEach((c, i) => (v[`--m${i + 1}`] = c));
  v["--fog"] = s.fog;
  v["--sun"] = s.sun;
  v["--accent"] = s.accent;
  v["--stars"] = s.stars;
  v["--aurora"] = s.aurora;
  v["--au1"] = s.au1;
  v["--au2"] = s.au2;
  return v as CSSProperties;
}
