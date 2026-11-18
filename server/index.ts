import { randomBytes, randomUUID } from "node:crypto";
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
import { loopbackOnly, tokenAuth } from "./auth.ts";
import { ConfigStore } from "./config.ts";
import { Db } from "./db.ts";
import { testProvider } from "./llm/index.ts";

const VERSION = "1.0.0";

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
});

const runSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().default(""),
  full: z.string().default(""),
  files: z.array(z.string()).default([]),
  agentId: z.string().default("ridge"),
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

export function createApp(options: ServerOptions): { app: Hono; config: ConfigStore; db: Db } {
  const config = new ConfigStore({ dataDir: options.dataDir, workspace: options.workspace });
  if (options.defaultModel) config.setDefaultModel(options.defaultModel, false);
  const db = new Db(path.join(config.dataDir, "hikes.db"));
  const app = new Hono();
  const activeRuns = new Map<string, ActiveRun>();
  const sessionRuns = new Map<string, string>();

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
    });
  });

  /* ───────────── sessions ───────────── */

  app.get("/api/sessions", (c) => c.json({ sessions: db.listSessions() }));

  app.post("/api/sessions", async (c) => {
    const body = sessionCreateSchema.safeParse(await c.req.json().catch(() => ({})));
    const session = db.createSession(body.success ? body.data.agent : "ridge");
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

  /* ───────────── memory ───────────── */

  app.get("/api/memory", (c) => c.json({ memories: db.listMemories(200) }));

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

  app.post("/api/providers/:id/test", async (c) => {
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const token = `hsk_${randomBytes(24).toString("base64url")}`;
  const running = await startServer({ token, port: 8787, workspace: process.cwd() });
  console.log(`Hikes API listening on http://127.0.0.1:${running.port}`);
  console.log(`Token: ${token}`);
}
