import type { Autonomy } from "../../shared/protocol.ts";
import type { ToolDefinition } from "../tools/types.ts";
import { isDestructiveCommand } from "../tools/shell.ts";

export function approvalPolicy(
  autonomy: Autonomy,
  tool: ToolDefinition,
  args: Record<string, unknown>,
): boolean {
  if (autonomy === "ask") return true;
  if (autonomy === "balanced") return tool.risk !== "safe";
  if (tool.risk === "execute" && typeof args.command === "string" && isDestructiveCommand(args.command)) {
    return true;
  }
  return false;
}
