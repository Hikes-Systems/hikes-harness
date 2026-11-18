import type { Source, ToolRisk } from "../../shared/protocol.ts";
import type { Db } from "../db.ts";
import type { ToolSpec } from "../llm/types.ts";
import type { SpawnRequest } from "./subagent.ts";

export interface ToolContext {
  workspace: string;
  sessionId: string;
  db: Db;
  signal: AbortSignal;
  /** Present when the run may delegate to an isolated sub-agent. */
  spawnSubagent?: (request: SpawnRequest, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  detail?: string;
  output?: string;
  sources?: Source[];
}

export interface ToolDefinition {
  spec: ToolSpec;
  risk: ToolRisk;
  run: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}
