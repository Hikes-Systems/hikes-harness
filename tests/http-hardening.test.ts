import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, type RunningServer } from "../server/index.ts";
import { VERSION } from "../server/version.ts";

const token = "hsk_hardening_token";
let dir = "";
let server: RunningServer | undefined;
let origin = "";

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-hardening-"));
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "readme.md"), "# hello\n");
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

test("every response carries the hardening headers", async () => {
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  const csp = health.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  assert.equal(health.headers.get("referrer-policy"), "no-referrer");
});

test("health reports the version and the live counters", async () => {
  const body = (await (await fetch(`${origin}/health`)).json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.version, VERSION);
  assert.equal(typeof body.uptimeSec, "number");
  assert.equal(body.activeRuns, 0);
  assert.equal(typeof body.sessions, "number");
  assert.equal(typeof body.memories, "number");
});

test("an oversized body is refused before any route reads it", async () => {
  const response = await fetch(`${origin}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    // 4 MB is the limit, and the workspace field has the same ceiling.
    body: JSON.stringify({ workspace: "x".repeat(4_000_001) }),
  });
  assert.equal(response.status, 413);
  const body = (await response.json()) as { error?: string };
  assert.match(body.error ?? "", /too large/i);
});

test("a failed request answers JSON without internals", async () => {
  // A body the route cannot use is the cheapest way in; the shape of the
  // error is the same for anything that throws.
  const response = await fetch(`${origin}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ autonomy: "reckless" }),
  });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: string };
  assert.ok(body.error);
  assert.doesNotMatch(body.error ?? "", /at |\.ts:/);
});

test("a run is refused once the run budget is spent", async () => {
  const payload = JSON.stringify({ sessionId: "nope" });
  let status = 0;
  // The limiter counts every call, valid or not.
  for (let attempt = 0; attempt < 121; attempt += 1) {
    const response = await fetch(`${origin}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: payload,
    });
    status = response.status;
  }
  assert.equal(status, 429);

  const blocked = await fetch(`${origin}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: payload,
  });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 0);
  const body = (await blocked.json()) as { error?: string };
  assert.match(body.error ?? "", /too many/i);
});