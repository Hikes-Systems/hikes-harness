import { Mountain, type LucideIcon } from "lucide-react";
import { AGENTS, DEFAULT_AGENT_ID, agentById, type AgentDef } from "@shared/agents";

export { AGENTS, DEFAULT_AGENT_ID };

export interface ResolvedAgent extends AgentDef {
  Icon: LucideIcon;
}

/** Hikes is the only primary identity. Legacy session agent ids resolve to it. */
export function resolveAgent(id: string): ResolvedAgent {
  return { ...agentById(id), Icon: Mountain };
}
