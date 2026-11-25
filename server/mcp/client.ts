import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { McpServerConfig, McpToolInfo } from "../../shared/protocol.ts";
import { VERSION } from "../version.ts";

/**
 * A tiny Model Context Protocol client.
 *
 * MCP servers speak newline-delimited JSON-RPC 2.0 over stdio: one JSON
 * object per line on stdout, requests written as one JSON object per line on
 * stdin. That is all this client implements — no transports, no batching.
 */

/**
 * The MCP revision this client speaks.
 *
 * MCP protocol versions are dated revisions of the specification
 * (`YYYY-MM-DD`), not package versions. `2024-11-05` is the baseline revision
 * that introduced the current JSON-RPC `initialize` handshake and the
 * tools/resources/prompts surface. Servers that implement a later revision
 * still accept this handshake and answer with their own version.
 */
export const MCP_PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "hikes", version: VERSION };

export interface McpToolDefinition extends McpToolInfo {
  inputSchema?: Record<string, unknown>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

const quoteArg = (value: string): string =>
  /[\s"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Launch a child process in a way that also works with .cmd shims on Windows. */
function launch(command: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string): ChildProcess {
  const resolvedEnv = Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      const placeholder = typeof value === "string" ? value.match(/^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/) : null;
      return [key, placeholder ? process.env[placeholder[1]] ?? "" : value];
    }),
  );
  const options: SpawnOptions = {
    env: { ...process.env, ...resolvedEnv },
    ...(cwd ? { cwd } : {}),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  };
  if (process.platform !== "win32") return spawn(command, args, options);
  // Windows: go through cmd.exe so .cmd shims (npx, pnpm) work too. The
  // arguments are passed verbatim, because Node would otherwise re-quote the
  // quotes that cmd.exe needs.
  const comspec = process.env.ComSpec || "cmd.exe";
  const inner = [command, ...args].map(quoteArg).join(" ");
  return spawn(comspec, ["/d", "/s", "/c", `"${inner}"`], {
    ...options,
    windowsVerbatimArguments: true,
  });
}

export class McpClient {
  private readonly config: McpServerConfig;
  private child: ChildProcess | null = null;
  private buffer = "";
  private stderr = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private tools: McpToolDefinition[] = [];

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return Boolean(this.child);
  }

  get toolList(): McpToolDefinition[] {
    return this.tools;
  }

  async start(timeoutMs = 20_000): Promise<McpToolDefinition[]> {
    if (this.child) return this.tools;

    const child = launch(this.config.command, this.config.args, this.config.env, this.config.cwd);
    this.child = child;
    this.stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.onData(chunk));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4000);
    });
    child.on("exit", (code) => {
      this.failAll(new McpError(`${this.config.name} exited (code ${code ?? "?"}).`));
      this.child = null;
    });
    child.on("error", (error) => {
      this.failAll(new McpError(`${this.config.name}: ${error.message}`));
      this.child = null;
    });

    try {
      await this.request(
        "initialize",
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          clientInfo: CLIENT_INFO,
        },
        timeoutMs,
      );
      this.notify("notifications/initialized", {});
      const listed = (await this.request("tools/list", {}, timeoutMs)) as {
        tools?: McpToolDefinition[];
      };
      this.tools = Array.isArray(listed?.tools) ? listed.tools : [];
      return this.tools;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async callTool(
    name: string,
    args: unknown,
    timeoutMs = 120_000,
  ): Promise<{ ok: boolean; text: string }> {
    const result = (await this.request(
      "tools/call",
      { name, arguments: args && typeof args === "object" ? args : {} },
      timeoutMs,
    )) as { content?: { type?: string; text?: string }[]; isError?: boolean };
    const text = (result?.content ?? [])
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
    return { ok: !result?.isError, text: text || "(no output)" };
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (!child) return;
    try {
      child.stdin?.end();
    } catch {
      /* already closed */
    }
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    this.failAll(new McpError("The MCP server was stopped."));
  }

  private failAll(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return; // servers sometimes print stray logs
    }
    if (parsed.id === undefined || parsed.id === null) return;
    const id = Number(parsed.id);
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (parsed.error) {
      entry.reject(new McpError(parsed.error.message || `MCP ${entry.method} failed.`));
      return;
    }
    entry.resolve(parsed.result);
  }

  private notify(method: string, params: unknown): void {
    const child = this.child;
    const stdin = child?.stdin;
    if (!stdin) return;
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
    try {
      stdin.write(`${payload}\n`);
    } catch {
      /* the process may have exited between checks */
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const child = this.child;
    const stdin = child?.stdin;
    if (!stdin) return Promise.reject(new McpError(`${this.config.name} is not running.`));
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new McpError(`${this.config.name} timed out during ${method}.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        stdin.write(`${payload}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new McpError(String(error)));
      }
    });
  }

  get errorText(): string {
    return this.stderr.trim().slice(-500);
  }
}
