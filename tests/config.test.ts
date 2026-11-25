import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigStore } from "../server/config.ts";

function sandbox(): { dir: string; dataDir: string; workspace: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-config-"));
  const dataDir = path.join(dir, "data");
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  return { dir, dataDir, workspace };
}

test("a fresh config has the documented defaults", () => {
  const box = sandbox();
  const config = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });

  assert.equal(config.config.version, 1);
  assert.equal(config.workspace, box.workspace);
  assert.equal(config.config.onboarded, false);
  assert.equal(config.config.autonomy, "balanced");
  assert.deepEqual(config.config.tools, { web: true, code: true, files: true, memory: true });
  assert.deepEqual(config.config.mcp.servers, []);

  const onDisk = JSON.parse(fs.readFileSync(config.configPath, "utf8")) as Record<string, unknown>;
  assert.equal(onDisk.onboarded, false);
  fs.rmSync(box.dir, { recursive: true, force: true });
});

test("onboarding survives a restart and a different launch directory", () => {
  const box = sandbox();
  const first = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });
  first.setOnboarded(true);
  first.setUi({ theme: "ink", motion: false });

  // A second launch is a new process, possibly from another directory and on
  // another port. It must still see the completed setup.
  const second = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });
  assert.equal(second.config.onboarded, true);
  assert.equal(second.config.ui?.theme, "ink");
  fs.rmSync(box.dir, { recursive: true, force: true });
});

test("a missing workspace is rejected, not silently accepted", () => {
  const box = sandbox();
  const config = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });
  assert.throws(() => config.setWorkspace(path.join(box.dir, "nope")), /does not exist/i);
  assert.equal(config.workspace, box.workspace);
  fs.rmSync(box.dir, { recursive: true, force: true });
});

test("provider keys never leave the server through publicProviders", () => {
  const box = sandbox();
  const config = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });
  config.updateProvider("openai", { enabled: true, apiKey: "sk-secret-value" });

  const view = config.publicProviders().openai;
  assert.equal(view.hasKey, true);
  assert.equal(JSON.stringify(view).includes("sk-secret-value"), false);
  assert.equal(JSON.stringify(config.publicProviders()).includes("sk-secret-value"), false);
  fs.rmSync(box.dir, { recursive: true, force: true });
});

test("tools and autonomy round-trip through the config file", () => {
  const box = sandbox();
  const config = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });
  config.setTools({ web: false, code: true, files: true, memory: false });
  config.setAutonomy("auto");

  const reloaded = new ConfigStore({ dataDir: box.dataDir, workspace: box.workspace });
  assert.deepEqual(reloaded.config.tools, { web: false, code: true, files: true, memory: false });
  assert.equal(reloaded.config.autonomy, "auto");
  fs.rmSync(box.dir, { recursive: true, force: true });
});
