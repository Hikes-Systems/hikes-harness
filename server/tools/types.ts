import type { FileChange, Source, ToolRisk } from "../../shared/protocol.ts";
import type { Db } from "../db.ts";
import type { ToolSpec } from "../llm/types.ts";
import type { SpawnRequest } from "./subagent.ts";

export interface ToolContext {
  workspace: string;
  sessionId: string;
  db: Db;
  signal: AbortSignal;
  /** The step that triggered this call. File tools use it to key snapshots. */
  stepId?: string;
  /** Present when the run may delegate to an isolated sub-agent. */
  spawnSubagent?: (request: SpawnRequest, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  detail?: string;
  output?: string;
  sources?: Source[];
  /** Files this call changed, with diffs and revert handles. */
  changes?: FileChange[];
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
