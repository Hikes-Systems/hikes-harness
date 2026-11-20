#!/usr/bin/env node
import "./quiet.ts";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import {
  isProviderId,
  type ApprovalRequest,
  type RunEvent,
  type RunRequest,
} from "../shared/protocol.ts";
import { runAgent, resolveModel } from "./agent/loop.ts";
import { planContext } from "./agent/compaction.ts";
import { DEFAULT_AGENT_ID } from "../shared/agents.ts";
import { loopbackOnly, tokenAuth } from "./auth.ts";
import { ConfigStore } from "./config.ts";
import { Db } from "./db.ts";
import { testProvider } from "./llm/index.ts";
import { McpManager } from "./mcp/manager.ts";
import { resolveInWorkspace } from "./tools/paths.ts";
import { VERSION } from "./version.ts";

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  onAbort: () => void;
  signal: AbortSignal;
}

interface ActiveRun {
  controller: AbortController;
  sessionId: string;
  approvals: Map<string, PendingApproval>;
}

export interface ServerOptions {
  port?: number;
  hostname?: string;
  token: string;
  dataDir?: string;
  workspace?: string;
  defaultModel?: string;
  staticDir?: string;
  noAuth?: boolean;
}

export interface RunningServer {
  port: number;
  close: () => Promise<void>;
}

const providerPatchSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().max(500).optional(),
  clearKey: z.boolean().optional(),
  baseUrl: z.string().max(500).optional(),
  customModel: z.string().max(200).optional(),
});

const providerTestSchema = z.object({
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().max(500).optional(),
  customModel: z.string().max(200).optional(),
});

const sessionCreateSchema = z.object({ agent: z.string().max(40).optional() });
const sessionPatchSchema = z.object({ title: z.string().max(200).optional(), agent: z.string().max(40).optional() });

const mcpServerSchema = z.object({
  id: z.string().max(60).optional(),
  name: z.string().max(80).optional(),
  command: z.string().min(1).max(400),
  args: z.array(z.string().max(400)).max(40).optional(),
  env: z.record(z.string().max(200), z.string().max(2000)).optional(),
  enabled: z.boolean().optional(),
});

const settingsSchema = z.object({
  search: z
    .object({
      tavilyKey: z.string().max(500).optional(),
      braveKey: z.string().max(500).optional(),
      clearTavily: z.boolean().optional(),
      clearBrave: z.boolean().optional(),
    })
    .optional(),
  defaultModel: z.string().max(200).optional(),
  workspace: z.string().min(1).max(4000).optional(),
  tools: z
    .object({
      web: z.boolean(),
      code: z.boolean(),
      files: z.boolean(),
      memory: z.boolean(),
    })
    .optional(),
  autonomy: z.enum(["ask", "balanced", "auto"]).optional(),
  onboarded: z.boolean().optional(),
  ui: z.record(z.string(), z.unknown()).optional(),
});

const runSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().default(""),
  full: z.string().default(""),
  files: z.array(z.string()).default([]),
  agentId: z.string().max(40).default(DEFAULT_AGENT_ID),
  agentName: z.string().max(40).optional(),
  modelKey: z.string().default(""),
  tools: z.object({
    web: z.boolean(),
    code: z.boolean(),
    files: z.boolean(),
    memory: z.boolean(),
  }),
  autonomy: z.enum(["ask", "balanced", "auto"]),
  profile: z.object({
    name: z.string().default(""),
    role: z.string().default(""),
    goals: z.array(z.string()).default([]),
    tone: z.enum(["concise", "balanced", "thorough"]).default("balanced"),
  }),
  mode: z.enum(["chat", "research"]).optional(),
  retryOf: z.string().optional(),
});

function fail(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "server";

export function createApp(options: ServerOptions): { app: Hono; config: ConfigStore; db: Db } {
  const config = new ConfigStore({ dataDir: options.dataDir, workspace: options.workspace });
  if (options.defaultModel) config.setDefaultModel(options.defaultModel, false);
  const db = new Db(path.join(config.dataDir, "hikes.db"));
  const app = new Hono();
  const activeRuns = new Map<string, ActiveRun>();
  const sessionRuns = new Map<string, string>();
  const mcp = new McpManager(() => config.mcpServers());

  app.use("*", loopbackOnly());
  app.get("/health", (c) => c.json({ ok: true, version: VERSION }));

  app.use("/api/*", tokenAuth(options.token, options.noAuth));

  app.get("/api/bootstrap", (c) => {
    const models = config.availableModels();
    return c.json({
      version: VERSION,
      node: process.version,
      dataDir: config.dataDir,
      workspace: config.workspace,
      providers: config.publicProviders(),
      models,
      defaultModel: config.resolvedDefaultModel(),
      tools: config.config.tools,
      autonomy: config.config.autonomy,
      search: {
        tavily: Boolean(config.config.search.tavilyKey),
        brave: Boolean(config.config.search.braveKey),
      },
      memoryCount: db.memoryCount(),
      tokenRequired: !options.noAuth,
      // The server owns the onboarding flag, so the wizard does not come back
      // when the browser lands on a different origin.
      onboarded: config.config.onboarded,
      ui: config.config.ui ?? null,
    });
  });

  /* ───────────── sessions ───────────── */

  app.get("/api/sessions", (c) => c.json({ sessions: db.listSessions() }));

  app.post("/api/sessions", async (c) => {
    const body = sessionCreateSchema.safeParse(await c.req.json().catch(() => ({})));
    const session = db.createSession(body.success && body.data.agent ? body.data.agent : DEFAULT_AGENT_ID);
    return c.json({ session });
  });

  app.get("/api/sessions/:id", (c) => {
    const session = db.getSession(c.req.param("id"));
    if (!session) return fail("Session not found.", 404);
    return c.json({ session });
  });

  app.patch("/api/sessions/:id", async (c) => {
    const body = sessionPatchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return fail("Invalid session update.");
    const summary = db.updateSession(c.req.param("id"), body.data);
    if (!summary) return fail("Session not found.", 404);
    return c.json({ session: summary });
  });

  app.delete("/api/sessions/:id", (c) => {
    const id = c.req.param("id");
    const runId = sessionRuns.get(id);
    if (runId) activeRuns.get(runId)?.controller.abort();
    db.deleteSession(id);
    return c.json({ ok: true });
  });

  /* ───────────── snapshots & compaction ───────────── */

  /**
   * Undo the file changes made by one step. Every file is checked against the
   * content the step produced: if anything changed since, nothing is written
   * and the conflicting paths come back to the client.
   */
  app.post("/api/sessions/:id/steps/:stepId/revert", (c) => {
    const sessionId = c.req.param("id");
    const stepId = c.req.param("stepId");
    const snapshots = db.listFileSnapshots(sessionId, stepId);
    if (!snapshots.length) return fail("There is no file snapshot for that step.", 404);

    const conflicts: { path: string; reason: string }[] = [];
    const prepared: { path: string; absolute: string; before: string; beforeMissing: boolean }[] = [];
    // One step can touch the same file more than once. The expected content is
    // the result of the last change; the restored content is the state before
    // the first change.
    const grouped = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const list = grouped.get(snapshot.path) ?? [];
      list.push(snapshot);
      grouped.set(snapshot.path, list);
    }
    for (const [filePath, list] of grouped) {
      const first = list[0];
      const last = list[list.length - 1];
      let absolute: string;
      try {
        absolute = resolveInWorkspace(config.workspace, filePath);
      } catch {
        conflicts.push({ path: filePath, reason: "the path is outside the workspace" });
        continue;
      }
      let current: string | null = null;
      try {
        current = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
      } catch {
        current = null;
      }
      if (current !== last.after) {
        conflicts.push({
          path: filePath,
          reason: current === null ? "the file was removed" : "the file changed after this step",
        });
        continue;
      }
      prepared.push({
        path: filePath,
        absolute,
        before: first.before,
        beforeMissing: Boolean(first.before_missing),
      });
    }

    if (conflicts.length) {
      return c.json(
        {
          error: "Some files changed after this step, so nothing was reverted.",
          conflicts,
        },
        409,
      );
    }

    const reverted: string[] = [];
    for (const item of prepared) {
      try {
        if (item.beforeMissing) {
          if (fs.existsSync(item.absolute)) fs.unlinkSync(item.absolute);
        } else {
          fs.mkdirSync(path.dirname(item.absolute), { recursive: true });
          fs.writeFileSync(item.absolute, item.before, "utf8");
        }
        reverted.push(item.path);
      } catch (error) {
        return fail(
          `Could not revert ${item.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return c.json({ ok: true, reverted });
  });

  /** Compact the stored transcript into a digest so later runs stay small. */
  app.post("/api/sessions/:id/compact", (c) => {
    const session = db.getSession(c.req.param("id"));
    if (!session) return fail("Session not found.", 404);
    const plan = planContext({
      db,
      sessionId: session.id,
      sessionMessages: session.messages,
      system: "",
      force: true,
      keepRecent: 2,
    });
    if (!plan.compacted) {
      return fail("There is not enough conversation yet to compact.");
    }
    return c.json({
      ok: true,
      compactedMessages: plan.olderMessages,
      savedTokens: plan.savedTokens,
      digest: plan.digest,
    });
  });

  /* ───────────── MCP servers ───────────── */

  app.get("/api/mcp/servers", (c) => c.json({ servers: mcp.list() }));

  app.post("/api/mcp/servers", async (c) => {
    const body = mcpServerSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return fail("Invalid MCP server settings.");
    const command = body.data.command.trim();
    if (!command) return fail("An MCP server needs a command.");
    const id = (body.data.id ?? "").trim() || slugify(body.data.name ?? command);
    const server = {
      id,
      name: (body.data.name ?? "").trim() || command,
      command,
      args: body.data.args ?? [],
      env: body.data.env ?? {},
      enabled: body.data.enabled ?? true,
    };
    config.upsertMcpServer(server);
    await mcp.disconnect(id);
    return c.json({ ok: true, servers: mcp.list() });
  });

  app.delete("/api/mcp/servers/:id", async (c) => {
    const id = c.req.param("id");
    await mcp.disconnect(id);
    config.removeMcpServer(id);
    return c.json({ ok: true, servers: mcp.list() });
  });

  app.post("/api/mcp/servers/:id/verify", async (c) => {
    const id = c.req.param("id");
    try {
      const status = await mcp.connect(id);
      return c.json({ ok: status.connected, server: status, servers: mcp.list() });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  });

  /* ───────────── memory ───────────── */

  app.get("/api/memory", (c) => {
    const query = (c.req.query("q") ?? "").trim();
    return c.json({
      memories: query ? db.searchMemories(query, 200) : db.listMemories(200),
    });
  });

  app.delete("/api/memory/:id", (c) => {
    db.deleteMemory(c.req.param("id"));
    return c.json({ ok: true });
  });

  /* ───────────── providers & settings ───────────── */

  app.put("/api/providers/:id", async (c) => {
    const id = c.req.param("id");
    if (!isProviderId(id)) return fail("Unknown provider.", 404);
    const body = providerPatchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return fail("Invalid provider settings.");
    config.updateProvider(id, body.data);
    return c.json({ ok: true, provider: config.providerView(id) });
  });

  app.post("/api/providers/:id/verify", async (c) => {
    const id = c.req.param("id");
    if (!isProviderId(id)) return fail("Unknown provider.", 404);
    const body = providerTestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return fail("Invalid provider settings.");
    const saved = config.provider(id);
    const testState = {
      ...saved,
      enabled: true,
      apiKey: body.data.apiKey?.trim() || saved.apiKey,
      baseUrl: body.data.baseUrl?.trim() || saved.baseUrl,
      customModel: body.data.customModel?.trim() ?? saved.customModel,
    };
    const result = await testProvider(id, testState);
    if (result.ok) {
      config.updateProvider(id, {
        enabled: true,
        apiKey: body.data.apiKey?.trim() || undefined,
        baseUrl: testState.baseUrl,
        customModel: testState.customModel,
      });
      config.setModels(id, result.models);
    }
    return c.json(result);
  });

  app.put("/api/settings", async (c) => {
    const body = settingsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return fail("Invalid settings.");
    if (body.data.workspace !== undefined) {
      try {
        config.setWorkspace(body.data.workspace);
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Invalid workspace folder.");
      }
    }
    if (body.data.tools) config.setTools(body.data.tools);
    if (body.data.autonomy) config.setAutonomy(body.data.autonomy);
    if (body.data.search) config.updateSearch(body.data.search);
    if (body.data.onboarded !== undefined) config.setOnboarded(body.data.onboarded);
    if (body.data.ui) config.setUi(body.data.ui);
    if (body.data.defaultModel !== undefined) {
      if (!config.availableModels().some((model) => model.key === body.data.defaultModel)) {
        return fail("That model is not available. Connect its provider first.");
      }
      config.setDefaultModel(body.data.defaultModel);
    }
    return c.json({
      ok: true,
      workspace: config.workspace,
      tools: config.config.tools,
      autonomy: config.config.autonomy,
      defaultModel: config.resolvedDefaultModel(),
      onboarded: config.config.onboarded,
      search: {
        tavily: Boolean(config.config.search.tavilyKey),
        brave: Boolean(config.config.search.braveKey),
      },
    });
  });

  /* ───────────── runs ───────────── */

  app.post("/api/runs", async (c) => {
    const body = runSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return fail(`Invalid run request: ${body.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    const session = db.getSession(body.data.sessionId);
    if (!session) return fail("Session not found.", 404);
    const model = resolveModel(config, body.data.modelKey);
    if (!model) {
      return fail("No provider is configured. Connect one in Settings before sending a message.");
    }
    if (body.data.retryOf) {
      const target = db.getMessage(body.data.sessionId, body.data.retryOf);
      if (!target || target.role !== "assistant") return fail("That message cannot be regenerated.");
    }
    if (sessionRuns.has(body.data.sessionId)) {
      return fail("This session already has a run in progress.", 409);
    }

    const input: RunRequest = {
      ...body.data,
      full: body.data.full || body.data.text,
    };
    const runId = randomUUID();
    const controller = new AbortController();
    const active: ActiveRun = { controller, sessionId: input.sessionId, approvals: new Map() };
    activeRuns.set(runId, active);
    sessionRuns.set(input.sessionId, runId);

    c.req.raw.signal.addEventListener("abort", () => controller.abort(), { once: true });

    const encoder = new TextEncoder();
    let closed = false;
    let ping: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        const write = (event: RunEvent) => {
          if (closed) return;
          try {
            streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            streamController.close();
          } catch {
            /* already closed */
          }
        };
        const requestApproval = (request: ApprovalRequest): Promise<boolean> =>
          new Promise((resolve) => {
            let settled = false;
            const finish = (approved: boolean) => {
              if (settled) return;
              settled = true;
              clearTimeout(entry.timer);
              controller.signal.removeEventListener("abort", entry.onAbort);
              active.approvals.delete(request.callId);
              resolve(approved);
            };
            const onAbort = () => finish(false);
            const entry: PendingApproval = {
              resolve: finish,
              timer: setTimeout(() => finish(false), 120_000),
              onAbort,
              signal: controller.signal,
            };
            controller.signal.addEventListener("abort", onAbort, { once: true });
            active.approvals.set(request.callId, entry);
          });

        ping = setInterval(() => write({ type: "ping" }), 15_000);

        void runAgent(input, {
          db,
          config,
          workspace: config.workspace,
          runId,
          signal: controller.signal,
          model,
          session,
          emit: write,
          requestApproval,
          mcp,
        })
          .catch((error) => {
            write({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => {
            if (ping) clearInterval(ping);
            for (const entry of active.approvals.values()) entry.resolve(false);
            active.approvals.clear();
            activeRuns.delete(runId);
            if (sessionRuns.get(input.sessionId) === runId) sessionRuns.delete(input.sessionId);
            close();
          });
      },
      cancel() {
        closed = true;
        controller.abort();
        for (const entry of active.approvals.values()) entry.resolve(false);
        active.approvals.clear();
        activeRuns.delete(runId);
        if (sessionRuns.get(input.sessionId) === runId) sessionRuns.delete(input.sessionId);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  });

  app.post("/api/runs/:id/approvals/:callId", async (c) => {
    const active = activeRuns.get(c.req.param("id"));
    if (!active) return fail("Run not found or already finished.", 404);
    const entry = active.approvals.get(c.req.param("callId"));
    if (!entry) return fail("No pending approval with that id.", 404);
    const body = (await c.req.json().catch(() => ({}))) as { approve?: boolean };
    entry.resolve(Boolean(body.approve));
    return c.json({ ok: true });
  });

  app.post("/api/runs/:id/cancel", (c) => {
    const active = activeRuns.get(c.req.param("id"));
    if (!active) return c.json({ ok: true, alreadyFinished: true });
    active.controller.abort();
    return c.json({ ok: true });
  });

  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  if (options.staticDir) {
    const indexFile = path.join(options.staticDir, "index.html");
    app.get("*", async (c) => {
      if (!fs.existsSync(indexFile)) return c.text("UI build not found. Run `npm run build` first.", 404);
      return c.html(await fs.promises.readFile(indexFile, "utf8"));
    });
  }

  return { app, config, db };
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const { app, db } = createApp(options);
  const port = options.port ?? 8787;
  const hostname = options.hostname ?? "127.0.0.1";

  const running = await new Promise<RunningServer>((resolve, reject) => {
    try {
      const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
        resolve({
          port: Number(info.port),
          close: () =>
            new Promise<void>((done, failed) => {
              server.close((error?: Error) => {
                if (error) failed(error);
                else done();
              });
            }),
        });
      });
      server.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });

  const originalClose = running.close;
  return {
    port: running.port,
    close: async () => {
      await originalClose();
      db.close();
    },
  };
}

/**
 * Running this file directly launches the whole harness: API, UI and
 * browser. The launcher lives inside the server so there is no separate
 * wrapper script to keep in sync, and the `hikes` command on your PATH
 * points straight at this file.
 */
const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

/**
 * True when both paths point at the same file.
 *
 * `npm link` runs the entry point through a symlink, so `argv[1]` and
 * `import.meta.url` can be different strings for the same file. Resolving
 * both handles that.
 */
function isSameFile(left: string, right: string): boolean {
  if (!left || !right) return false;
  const resolve = (value: string) => {
    try {
      return fs.realpathSync.native(value);
    } catch {
      return value;
    }
  };
  const a = resolve(left);
  const b = resolve(right);
  if (a === b) return true;
  return process.platform === "win32" && a.toLowerCase() === b.toLowerCase();
}

if (isSameFile(invokedPath, modulePath)) {
  const { runLauncher } = await import("./launcher.ts");
  await runLauncher({
    start: startServer,
    root: path.resolve(path.dirname(modulePath), ".."),
    argv: process.argv.slice(2),
  });
}
