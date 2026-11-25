export interface AgentDef {
  id: string;
  name: string;
  desc: string;
  prompt: string;
}

/** The built-in generalist. */
export const DEFAULT_AGENT_ID = "hikes";

export const AGENTS: AgentDef[] = [
  {
    id: "hikes",
    name: "Hikes",
    desc: "Your workspace agent",
    prompt:
      "Be practical, clear and resourceful. Inspect the real workspace before changing it, decide when a tool will materially improve the answer, and verify important facts instead of guessing.",
  },
];

/** True when the id names a built-in agent. */
export const isAgentId = (id: string): boolean => AGENTS.some((agent) => agent.id === id);

/** Resolve an id to a built-in agent, falling back to the generalist. */
export const agentById = (id: string): AgentDef =>
  AGENTS.find((agent) => agent.id === id) ?? AGENTS[0];

export type SubAgentType = "researcher" | "coder" | "analyst" | "writer" | "planner";

export interface SubAgentDef {
  id: SubAgentType;
  name: string;
  desc: string;
  prompt: string;
  /** Tool names this specialist may use. Empty means every enabled tool. */
  tools: string[];
}

export const SUBAGENTS: SubAgentDef[] = [
  {
    id: "researcher",
    name: "Researcher",
    desc: "Web and workspace research",
    prompt:
      "You are a research sub-agent. Investigate the assigned question using search and page reads, prefer primary sources, cross-check claims, and return a structured evidence brief with links. State uncertainty instead of guessing.",
    tools: ["web_search", "fetch_url", "list_files", "read_file", "search_files", "recall"],
  },
  {
    id: "coder",
    name: "Coder",
    desc: "Implementation and debugging",
    prompt:
      "You are a coding sub-agent. Inspect the real workspace, make the smallest correct change, run focused checks, and report exactly what changed, which files were touched and what still needs attention.",
    tools: ["list_files", "read_file", "search_files", "write_file", "edit_file", "run_command"],
  },
  {
    id: "analyst",
    name: "Analyst",
    desc: "Data and evidence analysis",
    prompt:
      "You are an analysis sub-agent. Read the relevant material, extract the numbers and evidence that matter, compare options, and return a compact findings report with concrete recommendations.",
    tools: ["web_search", "fetch_url", "list_files", "read_file", "search_files", "run_command", "recall"],
  },
  {
    id: "writer",
    name: "Writer",
    desc: "Drafting and editing",
    prompt:
      "You are a writing sub-agent. Read the source material, draft or edit the requested copy, and return the finished text plus a short note on the choices you made. Keep the user's voice.",
    tools: ["list_files", "read_file", "search_files", "fetch_url", "web_search"],
  },
  {
    id: "planner",
    name: "Planner",
    desc: "Task breakdown and sequencing",
    prompt:
      "You are a planning sub-agent. Inspect what exists, break the objective into ordered concrete steps, flag dependencies and risks, and return a plan another agent can execute without follow-up questions.",
    tools: [],
  },
];

export const subagentById = (id: SubAgentType): SubAgentDef =>
  SUBAGENTS.find((agent) => agent.id === id) ?? SUBAGENTS[0];
