import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, type RunningServer } from "../server/index.ts";

/**
 * The single-file build still writes the icon rasters next to index.html. They
 * have to come back as themselves — a shell served under the image type trips
 * `nosniff`, and a missing favicon quietly leaves the tab blank.
 */

let dir = "";
let server: RunningServer | undefined;
let origin = "";
const iconBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-static-"));
  const staticDir = path.join(dir, "dist");
  fs.mkdirSync(staticDir, { recursive: true });
  fs.writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>shell</title>");
  fs.writeFileSync(path.join(staticDir, "hikes-icon-abc123.png"), iconBytes);
  fs.writeFileSync(path.join(dir, "secret.txt"), "do not serve me");
  server = await startServer({
    port: 0,
    token: "hsk_test_token",
    dataDir: path.join(dir, "data"),
    workspace: path.join(dir, "workspace"),
    discoverMcp: false,
    staticDir,
    noAuth: true,
  });
  origin = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  await server?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test("a hashed asset is served as an image, not as the shell", async () => {
  const response = await fetch(`${origin}/hikes-icon-abc123.png`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control") ?? "", /max-age/);
  const body = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(body, iconBytes);
});

test("unknown paths fall back to the app shell", async () => {
  const response = await fetch(`${origin}/sessions/42`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await response.text(), /<title>shell<\/title>/);
});

test("the shell route cannot be used to read outside the build directory", async () => {
  for (const route of ["/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt"]) {
    const response = await fetch(`${origin}${route}`);
    const body = await response.text();
    assert.ok(!body.includes("do not serve me"), `${route} leaked a file outside the build`);
  }
});

test("a directory request still returns the shell", async () => {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>shell<\/title>/);
});
