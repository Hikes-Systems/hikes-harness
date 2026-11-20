import type { McpServerConfig, McpServerStatus } from "../../shared/protocol.ts";
import type { ToolDefinition } from "../tools/types.ts";
import { McpClient, McpError, type McpToolDefinition } from "./client.ts";

/**
 * Keeps one live client per configured MCP server and exposes their tools to
 * the agent registry under a namespaced name: `mcp__<server>__<tool>`.
 *
 * Every MCP tool is treated as an `execute` risk, so the existing
 * Ask first / Balanced / Autonomous approval policy decides whether the user
 * has to confirm the call.
 */

const nameSafe = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "tool";

export interface McpToolBinding {
  serverId: string;
  toolName: string;
  definition: McpToolDefinition;
}

export class McpManager {
  private readonly servers: () => McpServerConfig[];
  private readonly clients = new Map<string, McpClient>();
  private readonly errors = new Map<string, string>();
  private readonly bindings = new Map<string, McpToolBinding>();

  constructor(servers: () => McpServerConfig[]) {
    this.servers = servers;
  }

  list(): McpServerStatus[] {
    return this.servers().map((server) => {
      const client = this.clients.get(server.id);
      return {
        ...server,
        connected: Boolean(client?.connected),
        tools: (client?.toolList ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
        error: this.errors.get(server.id),
      };
    });
  }

  async connect(id: string): Promise<McpServerStatus> {
    const server = this.servers().find((entry) => entry.id === id);
    if (!server) throw new McpError("Unknown MCP server.");
    const existing = this.clients.get(id);
    if (existing?.connected) {
      this.errors.delete(id);
      return this.list().find((entry) => entry.id === id)!;
    }
    const client = new McpClient(server);
    try {
      await client.start();
      this.clients.set(id, client);
      this.errors.delete(id);
    } catch (error) {
      this.errors.set(id, error instanceof Error ? error.message : String(error));
      client.stop();
    }
    return this.list().find((entry) => entry.id === id)!;
  }

  async disconnect(id: string): Promise<void> {
    this.clients.get(id)?.stop();
    this.clients.delete(id);
    this.errors.delete(id);
  }

  stopAll(): void {
    for (const client of this.clients.values()) client.stop();
    this.clients.clear();
  }

  /**
   * Connect every enabled server and turn their tools into agent tools.
   * Servers that fail to start are skipped: a broken MCP server must not
   * stop the harness from working.
   */
  async toolDefinitions(): Promise<ToolDefinition[]> {
    this.bindings.clear();
    const enabled = this.servers().filter((server) => server.enabled);
    await Promise.all(enabled.map((server) => this.connect(server.id)));

    const definitions: ToolDefinition[] = [];
    for (const server of enabled) {
      const client = this.clients.get(server.id);
      if (!client?.connected) continue;
      for (const tool of client.toolList) {
        const binding: McpToolBinding = { serverId: server.id, toolName: tool.name, definition: tool };
        const exposed = `mcp__${nameSafe(server.id)}__${nameSafe(tool.name)}`;
        this.bindings.set(exposed, binding);
        definitions.push({
          risk: "execute",
          spec: {
            name: exposed,
            description: `${server.name} · ${tool.description ?? tool.name}`,
            parameters: normaliseSchema(tool.inputSchema),
          },
          run: async (args) => {
            const live = this.clients.get(server.id);
            if (!live?.connected) {
              return { ok: false, summary: `${server.name} is not running.` };
            }
            try {
              const result = await live.callTool(tool.name, args);
              return {
                ok: result.ok,
                summary: result.ok
                  ? `${server.name} · ${tool.name}`
                  : `${server.name} · ${tool.name} failed`,
                output: result.text.slice(0, 20_000),
              };
            } catch (error) {
              return {
                ok: false,
                summary: `${server.name} · ${tool.name} failed`,
                output: error instanceof Error ? error.message : String(error),
              };
            }
          },
        });
      }
    }
    return definitions;
  }
}

/** MCP schemas are JSON Schema; the agent needs a plain object schema. */
function normaliseSchema(schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return { type: "object", properties: {} };
  const type = typeof schema.type === "string" ? schema.type : "object";
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    type,
    properties,
    ...(required.length ? { required } : {}),
  };
}
