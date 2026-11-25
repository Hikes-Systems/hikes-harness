import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, type RunningServer } from "../server/index.ts";
import { VERSION } from "../server/version.ts";

const token = "hsk_test_token";
let dir = "";
let server: RunningServer | undefined;
let origin = "";

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-api-"));
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  server = await startServer({
    port: 0,
    token,
    dataDir: path.join(dir, "data"),
    workspace,
    discoverMcp: false,
    noAuth: false,
  });
  origin = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  await server?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function call(
  method: string,
  route: string,
  options: { body?: unknown; auth?: boolean } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.auth !== false) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${origin}${route}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* no body */
  }
  return { status: response.status, body };
}

test("health is public and reports the running version", async () => {
  const { status, body } = await call("GET", "/health", { auth: false });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.version, VERSION);
  assert.equal(typeof body.uptimeSec, "number");
});

test("the API refuses a request without the launch token", async () => {
  const { status } = await call("GET", "/api/bootstrap", { auth: false });
  assert.equal(status, 401);
});

test("bootstrap describes the machine without leaking a provider key", async () => {
  await call("PUT", "/api/providers/openai", {
    body: { enabled: true, apiKey: "sk-must-not-leak" },
  });
  const { status, body } = await call("GET", "/api/bootstrap");
  assert.equal(status, 200);
  assert.equal(body.version, VERSION);
  assert.equal(typeof body.workspace, "string");
  assert.equal(body.onboarded, false);
  assert.equal(JSON.stringify(body).includes("sk-must-not-leak"), false);
  assert.equal(body.providers.openai.hasKey, true);
});

test("completing onboarding is recorded on the server", async () => {
  const saved = await call("PUT", "/api/settings", { body: { onboarded: true } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.onboarded, true);

  const boot = await call("GET", "/api/bootstrap");
  assert.equal(boot.body.onboarded, true);
});

test("the interface mirror survives a restart on another origin", async () => {
  await call("PUT", "/api/settings", {
    body: { ui: { theme: "ink", motion: false } },
  });

  const second = await startServer({
    port: 0,
    token,
    dataDir: path.join(dir, "data"),
    workspace: path.join(dir, "workspace"),
    discoverMcp: false,
    noAuth: false,
  });
  try {
    const response = await fetch(`http://127.0.0.1:${second.port}/api/bootstrap`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as { ui?: { theme?: string; motion?: boolean } };
    assert.equal(body.ui?.theme, "ink");
    assert.equal(body.ui?.motion, false);
  } finally {
    await second.close();
  }
});

test("the automatic-memory preference round-trips through settings", async () => {
  const updated = await call("PUT", "/api/settings", { body: { memory: { autoSave: false } } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.memory.autoSave, false);
  const bootstrap = await call("GET", "/api/bootstrap");
  assert.equal(bootstrap.body.memory.autoSave, false);
  await call("PUT", "/api/settings", { body: { memory: { autoSave: true } } });
});

test("sessions can be created, listed and deleted", async () => {
  const created = await call("POST", "/api/sessions", { body: { agent: "scout" } });
  assert.equal(created.status, 200);
  assert.equal(created.body.session.agent, "hikes");
  const id = created.body.session.id as string;

  const listed = await call("GET", "/api/sessions");
  assert.ok(listed.body.sessions.some((session: { id: string }) => session.id === id));

  const removed = await call("DELETE", `/api/sessions/${id}`);
  assert.equal(removed.status, 200);
  const after = await call("GET", "/api/sessions");
  assert.equal(after.body.sessions.some((session: { id: string }) => session.id === id), false);
});

test("an unknown agent id falls back to the generalist", async () => {
  const created = await call("POST", "/api/sessions", { body: { agent: "not-a-real-agent" } });
  assert.equal(created.status, 200);
  assert.equal(created.body.session.agent, "hikes");
  await call("DELETE", `/api/sessions/${created.body.session.id}`);
});

test("the old /test routes are gone", async () => {
  const provider = await call("POST", "/api/providers/openai/test", { body: {} });
  assert.equal(provider.status, 404);
  const mcp = await call("POST", "/api/mcp/servers/example/test", { body: {} });
  assert.equal(mcp.status, 404);
});

test("the verify routes exist and validate their input", async () => {
  const provider = await call("POST", "/api/providers/openai/verify", { body: {} });
  // No key was supplied, so this is a validation failure, not a missing route.
  assert.notEqual(provider.status, 404);
});
