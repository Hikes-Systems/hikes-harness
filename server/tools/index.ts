import type { StepKind, ToolFlags } from "../../shared/protocol.ts";
import type { SearchConfig } from "../config.ts";
import type { Db } from "../db.ts";
import { fileTools } from "./files.ts";
import { memoryTools } from "./memory.ts";
import { shellTools } from "./shell.ts";
import { spawnSubagentTool } from "./subagent.ts";
import type { ToolDefinition } from "./types.ts";
import { webTools } from "./web.ts";

export interface ToolDeps {
  workspace: string;
  db: Db;
  search: SearchConfig;
  /** Include the delegation tool. Sub-agent runs turn this off. */
  subagents?: boolean;
}

export function buildToolRegistry(flags: ToolFlags, deps: ToolDeps): Map<string, ToolDefinition> {
  const definitions: ToolDefinition[] = [
    ...(flags.web ? webTools(deps.search) : []),
    ...(flags.files ? fileTools(deps.workspace) : []),
    ...(flags.code ? shellTools(deps.workspace) : []),
    ...(flags.memory ? memoryTools() : []),
    ...(deps.subagents ? [spawnSubagentTool()] : []),
  ];
  return new Map(definitions.map((definition) => [definition.spec.name, definition]));
}

export const toolKind = (name: string): StepKind => {
  if (name === "web_search" || name === "fetch_url") return "search";
  if (name === "run_command") return "code";
  if (name === "remember" || name === "recall") return "memory";
  if (name === "spawn_subagent") return "agent";
  if (name.startsWith("mcp__")) return "code";
  return "file";
};

export const toolLabel = (name: string): string => {
  switch (name) {
    case "web_search":
      return "Searching the web";
    case "fetch_url":
      return "Reading a web page";
    case "list_files":
      return "Listing workspace files";
    case "read_file":
      return "Reading a file";
    case "write_file":
      return "Writing a file";
    case "edit_file":
      return "Editing a file";
    case "search_files":
      return "Searching the workspace";
    case "run_command":
      return "Running a command";
    case "remember":
      return "Saving a memory";
    case "recall":
      return "Recalling memories";
    case "spawn_subagent":
      return "Delegating to a sub-agent";
    default:
      if (name.startsWith("mcp__")) return "Calling an MCP tool";
      return name;
  }
};

export function toolDetail(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "web_search":
      return typeof args.query === "string" ? `“${args.query}”` : "";
    case "fetch_url":
      return typeof args.url === "string" ? args.url : "";
    case "list_files":
      return typeof args.path === "string" && args.path ? args.path : "workspace root";
    case "read_file":
    case "write_file":
    case "edit_file":
      return typeof args.path === "string" ? args.path : "";
    case "search_files":
      return typeof args.query === "string" ? `“${args.query}”` : "";
    case "run_command":
      return typeof args.command === "string" ? args.command : "";
    case "remember":
      return typeof args.content === "string" ? args.content.slice(0, 100) : "";
    case "recall":
      return typeof args.query === "string" ? `“${args.query}”` : "";
    case "spawn_subagent":
      return typeof args.title === "string" ? args.title : typeof args.type === "string" ? args.type : "";
    default:
      return "";
  }
}

export function describeToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "run_command":
      return `Run command: ${String(args.command ?? "").slice(0, 180)}`;
    case "write_file":
      return `Write file: ${String(args.path ?? "")}`;
    case "edit_file":
      return `Edit file: ${String(args.path ?? "")}`;
    case "web_search":
      return `Search the web: ${String(args.query ?? "").slice(0, 140)}`;
    case "fetch_url":
      return `Fetch page: ${String(args.url ?? "").slice(0, 140)}`;
    case "read_file":
      return `Read file: ${String(args.path ?? "")}`;
    case "remember":
      return `Remember: ${String(args.content ?? "").slice(0, 140)}`;
    case "spawn_subagent":
      return `Spawn ${String(args.type ?? "sub-agent")}: ${String(args.title ?? "").slice(0, 140)}`;
    default:
      return `${toolLabel(name)} ${toolDetail(name, args)}`.trim();
  }
}
