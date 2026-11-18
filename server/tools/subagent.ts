import { z } from "zod";
import type { SubAgentType } from "../../shared/agents.ts";
import { SUBAGENTS } from "../../shared/agents.ts";
import type { ToolDefinition, ToolResult } from "./types.ts";
import { ToolError } from "./types.ts";

export interface SpawnRequest {
  type: SubAgentType;
  title: string;
  instruction: string;
  context?: string;
}

const spawnSchema = z.object({
  type: z.enum(["researcher", "coder", "analyst", "writer", "planner"]),
  title: z.string().min(3).max(120),
  instruction: z.string().min(3).max(8000),
  context: z.string().max(8000).optional(),
});

export const subagentLabels = Object.fromEntries(SUBAGENTS.map((agent) => [agent.id, agent.name]));

export function spawnSubagentTool(): ToolDefinition {
  return {
    risk: "safe",
    spec: {
      name: "spawn_subagent",
      description:
        "Delegate a self-contained task to an isolated specialist sub-agent. Use it for hard research, coding, analysis or drafting that benefits from a focused context. The sub-agent has its own tool budget and returns a summary you can build on.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: SUBAGENTS.map((agent) => agent.id),
            description: "Which specialist to spawn.",
          },
          title: { type: "string", description: "Short task title shown to the user." },
          instruction: {
            type: "string",
            description: "Complete, self-contained instructions. The sub-agent cannot see this conversation.",
          },
          context: {
            type: "string",
            description: "Optional background the sub-agent needs (existing findings, file paths, constraints).",
          },
        },
        required: ["type", "title", "instruction"],
      },
    },
    run: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.spawnSubagent) throw new ToolError("Sub-agents are not available in this run.");
      const parsed = spawnSchema.safeParse(args);
      if (!parsed.success) throw new ToolError("spawn_subagent needs a type, a title and an instruction.");
      return ctx.spawnSubagent(parsed.data, ctx);
    },
  };
}
