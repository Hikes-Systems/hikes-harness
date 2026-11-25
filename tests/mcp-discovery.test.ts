import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverOpenCodeMcp, parseJsonc } from "../server/mcp/discovery.ts";
import { ConfigStore } from "../server/config.ts";

function sandbox(): { dir: string; home: string; workspace: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-discovery-"));
  const home = path.join(dir, "home");
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  return { dir, home, workspace };
}

test("JSONC parsing preserves comment-like text inside strings", () => {
  const parsed = parseJsonc(`{
    // a real comment
    "url": "https://example.com/mcp",
    "command": ["node", "server.js",], /* another comment */
  }`) as { url: string; command: string[] };
  assert.equal(parsed.url, "https://example.com/mcp");
  assert.deepEqual(parsed.command, ["node", "server.js"]);
});

test("discovery imports local configs with project precedence and skips remote entries", () => {
  const box = sandbox();
  const globalDir = path.join(box.home, ".config", "opencode");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "opencode.jsonc"), JSON.stringify({
    mcp: { servers: {
      context: { type: "local", command: ["npx", "-y", "old-context"] },
      remote: { type: "remote", url: "https://example.com/mcp" },
    } },
  }));
  fs.writeFileSync(path.join(box.workspace, "opencode.jsonc"), `{
    "mcp": { "servers": {
      "context": {
        "type": "local",
        "command": ["bunx", "new-context"],
        "cwd": ".",
        "environment": { "CONTEXT_KEY": "{env:CONTEXT_KEY}" },
      },
      "disabled": { "type": "local", "command": ["node", "off.js"], "disabled": true },
    } },
  }`);

  const result = discoverOpenCodeMcp({ workspace: box.workspace, homeDir: box.home });
  assert.equal(result.sources, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.servers.length, 1);
  assert.deepEqual(result.servers[0].command, "bunx");
  assert.deepEqual(result.servers[0].args, ["new-context"]);
  assert.equal(result.servers[0].env.CONTEXT_KEY, "{env:CONTEXT_KEY}");
  assert.equal(result.servers[0].cwd, box.workspace);
  assert.equal(result.servers[0].id, "opencode-context");
  fs.rmSync(box.dir, { recursive: true, force: true });
});

test("legacy direct mcp entries are read as migration input", () => {
  const box = sandbox();
  fs.writeFileSync(path.join(box.workspace, "opencode.jsonc"), JSON.stringify({
    mcp: {
      rea: { type: "local", command: ["node", "rea-server.js"], environment: { HOME: "{env:HOME}" } },
      timeout: { startup: 30000 },
    },
  }));
  const result = discoverOpenCodeMcp({ workspace: box.workspace, homeDir: box.home });
  assert.equal(result.servers.length, 1);
  assert.equal(result.servers[0].id, "opencode-rea");
  assert.equal(result.servers[0].env.HOME, "{env:HOME}");
  assert.equal(result.skipped, 0);
  fs.rmSync(box.dir, { recursive: true, force: true });
});

test("automatic import happens once and deletion is not undone on restart", () => {
  const box = sandbox();
  const dataDir = path.join(box.dir, "data");
  const config = new ConfigStore({ dataDir, workspace: box.workspace });
  const servers = discoverOpenCodeMcp({ workspace: box.workspace, homeDir: box.home }).servers;
  const server = {
    id: "opencode-context",
    name: "context",
    command: "npx",
    args: ["-y", "context"],
    env: {},
    enabled: true,
  };
  assert.equal(servers.length, 0);
  assert.equal(config.importMcpServers([server], true), 1);
  config.removeMcpServer(server.id);
  assert.equal(config.importMcpServers([server], true), 0);
  assert.equal(config.mcpServers().length, 0);

  // An explicit scan can re-import, and the preference/metadata survive restart.
  assert.equal(config.importMcpServers([server]), 1);
  config.setMemory({ autoSave: false });
  const restarted = new ConfigStore({ dataDir, workspace: box.workspace });
  assert.equal(restarted.mcpServers().length, 1);
  assert.equal(restarted.config.mcp.autoImported, true);
  assert.equal(restarted.config.memory.autoSave, false);
  fs.rmSync(box.dir, { recursive: true, force: true });
});
