import {
  Bird,
  Bot,
  Cloud,
  Compass,
  Feather,
  Flame,
  Hammer,
  Leaf,
  Map as MapIcon,
  Moon,
  Mountain,
  Rocket,
  Sparkles,
  Star,
  Tent,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  AGENTS,
  DEFAULT_AGENT_ID,
  agentById,
  type AgentDef,
  type AgentIdentity,
} from "@shared/agents";

export { AGENTS, DEFAULT_AGENT_ID };
export type { AgentIdentity };

/** Mascot choices. Lucide icons only — no emoji. */
export const MASCOTS = [
  { id: "mountain", label: "Mountain", Icon: Mountain },
  { id: "compass", label: "Compass", Icon: Compass },
  { id: "hammer", label: "Hammer", Icon: Hammer },
  { id: "feather", label: "Feather", Icon: Feather },
  { id: "sparkles", label: "Sparkles", Icon: Sparkles },
  { id: "rocket", label: "Rocket", Icon: Rocket },
  { id: "leaf", label: "Leaf", Icon: Leaf },
  { id: "flame", label: "Flame", Icon: Flame },
  { id: "star", label: "Star", Icon: Star },
  { id: "moon", label: "Moon", Icon: Moon },
  { id: "cloud", label: "Cloud", Icon: Cloud },
  { id: "waves", label: "Waves", Icon: Waves },
  { id: "tent", label: "Tent", Icon: Tent },
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "bird", label: "Bird", Icon: Bird },
  { id: "bot", label: "Bot", Icon: Bot },
] as const;

export type MascotId = (typeof MASCOTS)[number]["id"];

export const DEFAULT_MASCOT: Record<string, MascotId> = {
  hikes: "mountain",
  scout: "compass",
  forge: "hammer",
  quill: "feather",
};

const MASCOT_BY_ID = new Map<string, (typeof MASCOTS)[number]>(
  MASCOTS.map((mascot) => [mascot.id, mascot]),
);

export const isMascotId = (value: unknown): value is MascotId =>
  typeof value === "string" && MASCOT_BY_ID.has(value);

export const mascotIcon = (id: string): LucideIcon =>
  MASCOT_BY_ID.get(id)?.Icon ?? Mountain;

export const defaultIdentity = (id: string): AgentIdentity => {
  const agent = agentById(id);
  return {
    name: agent.name,
    mascot: DEFAULT_MASCOT[agent.id] ?? "mountain",
  };
};

/** A complete, default-filled identity map for every built-in agent. */
export const defaultIdentities = (): Record<string, AgentIdentity> =>
  Object.fromEntries(AGENTS.map((agent) => [agent.id, defaultIdentity(agent.id)]));

export interface ResolvedAgent extends AgentDef {
  Icon: LucideIcon;
  identity: AgentIdentity;
  /** True when the user changed the name or mascot. */
  customized: boolean;
}

/** Resolve a built-in agent id plus the user's identity overrides. */
export function resolveAgent(
  id: string,
  identities?: Record<string, AgentIdentity>,
): ResolvedAgent {
  const agent = agentById(id);
  const fallback = defaultIdentity(agent.id);
  const custom = identities?.[agent.id];
  const name = custom?.name?.trim().slice(0, 40) || fallback.name;
  const mascot = isMascotId(custom?.mascot) ? custom.mascot : fallback.mascot;
  return {
    ...agent,
    name,
    identity: { name, mascot },
    Icon: mascotIcon(mascot),
    customized: name !== fallback.name || mascot !== fallback.mascot,
  };
}
