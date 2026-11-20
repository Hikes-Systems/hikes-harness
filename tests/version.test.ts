import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../server/version.ts";
import { MCP_PROTOCOL_VERSION } from "../server/mcp/client.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("VERSION is the package version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    version?: string;
  };
  assert.equal(VERSION, pkg.version);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test("the MCP revision is a date, not a package version", () => {
  assert.match(MCP_PROTOCOL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});
