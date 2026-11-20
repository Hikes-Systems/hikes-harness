import { z } from "zod";
import type { ToolDefinition, ToolResult } from "./types.ts";
import { ToolError } from "./types.ts";

const rememberSchema = z.object({
  content: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(32)).max(8).optional(),
});

const recallSchema = z.object({
  query: z.string().min(1).max(200),
});

export function memoryTools(): ToolDefinition[] {
  return [
    {
      risk: "safe",
      spec: {
        name: "remember",
        description: "Save a durable fact or preference about the user to long-term memory.",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "The fact to remember, written as a complete sentence." },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags for later recall." },
          },
          required: ["content"],
        },
      },
      run: async (args, ctx): Promise<ToolResult> => {
        const parsed = rememberSchema.safeParse(args);
        if (!parsed.success) throw new ToolError("remember needs content up to 2000 characters.");
        const row = ctx.db.addMemory("global", parsed.data.content.trim(), parsed.data.tags ?? []);
        return {
          ok: true,
          summary: "Saved to memory",
          detail: parsed.data.content.slice(0, 120),
          output: `Remembered (${row.id.slice(0, 8)}): ${row.content}`,
        };
      },
    },
    {
      risk: "safe",
      spec: {
        name: "recall",
        description:
          "Search long-term memory for facts or preferences relevant to the current request. Matches every word in the query, including partial words and tags, so a differently phrased fact can still surface.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Words to look for in saved memories." },
          },
          required: ["query"],
        },
      },
      run: async (args, ctx): Promise<ToolResult> => {
        const parsed = recallSchema.safeParse(args);
        if (!parsed.success) throw new ToolError("recall needs a query.");
        const rows = ctx.db.searchMemories(parsed.data.query, 5);
        if (!rows.length) {
          return {
            ok: true,
            summary: "No matching memories",
            detail: parsed.data.query,
            output: "No matching memories.",
          };
        }
        return {
          ok: true,
          summary: `Recalled ${rows.length} memories`,
          detail: parsed.data.query,
          output: rows
            .map((row) => `- ${row.content}${row.tags ? ` [${row.tags}]` : ""}`)
            .join("\n"),
        };
      },
    },
  ];
}
