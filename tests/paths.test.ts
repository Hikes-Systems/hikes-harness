import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertRealPathInside,
  displayPath,
  isSensitivePath,
  resolveInWorkspace,
} from "../server/tools/paths.ts";

const root = path.resolve(os.tmpdir(), "hikes-jail-root");

test("relative paths resolve inside the workspace", () => {
  assert.equal(resolveInWorkspace(root, "src/app.ts"), path.join(root, "src", "app.ts"));
  assert.equal(resolveInWorkspace(root, "."), root);
  // A leading slash is treated as workspace-relative, not as a drive root.
  assert.equal(resolveInWorkspace(root, "/src/app.ts"), path.join(root, "src", "app.ts"));
});

test("a path cannot escape the workspace", () => {
  assert.throws(() => resolveInWorkspace(root, "../outside.txt"), /outside the workspace/i);
  assert.throws(() => resolveInWorkspace(root, "src/../../outside.txt"), /outside the workspace/i);
  assert.throws(
    () => resolveInWorkspace(root, path.relative(root, os.tmpdir())),
    /outside the workspace/i,
  );
});

test("symlinks that point outside the workspace are refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-jail-"));
  const workspace = path.join(dir, "workspace");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "secret.txt"), "nope");

  let linked = true;
  try {
    fs.symlinkSync(outside, path.join(workspace, "link"), "dir");
  } catch {
    // Windows needs developer mode or elevation for symlinks.
    linked = false;
  }

  if (linked) {
    assert.throws(
      () => assertRealPathInside(workspace, path.join(workspace, "link", "secret.txt")),
      /outside the workspace/i,
    );
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("secrets are recognised by name, extension and folder", () => {
  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("config/.env.local"), true);
  assert.equal(isSensitivePath("id_rsa"), true);
  assert.equal(isSensitivePath("home/.ssh/config"), true);
  assert.equal(isSensitivePath("certs/server.pem"), true);
  assert.equal(isSensitivePath("keys/private.key"), true);
  assert.equal(isSensitivePath("src/app.ts"), false);
  assert.equal(isSensitivePath("docs/readme.md"), false);
});

test("displayPath always uses forward slashes", () => {
  assert.equal(displayPath(root, path.join(root, "src", "app.ts")), "src/app.ts");
  assert.equal(displayPath(root, root), ".");
});
