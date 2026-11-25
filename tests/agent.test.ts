import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Db } from "../server/db.ts";
import type { ModelInfo, RunRequest } from "../shared/protocol.ts";
import {
  buildSystemPrompt,
  projectInstructions,
  relevantMemories,
  wantsProjectContext,
} from "../server/agent/loop.ts";
import { HIKES_IDENTITY, HIKES_SUBAGENT_IDENTITY } from "../server/agent/identity.ts";

const model: ModelInfo = {
  id: "test-model",
  key: "test:model",
  name: "Test Model",
  provider: "custom",
  desc: "",
  contextWindow: 128_000,
};

const request = (overrides: Partial<RunRequest> = {}): RunRequest => ({
  sessionId: "s1",
  text: "hello",
  full: "hello",
  files: [],
  agentId: "hikes",
  modelKey: model.key,
  tools: { web: true, code: true, files: true, memory: true },
  autonomy: "balanced",
  profile: { name: "Ada", role: "engineer", goals: ["ship it"], tone: "concise" },
  ...overrides,
});

test("every prompt starts with the Hikes identity", () => {
  const system = buildSystemPrompt(request(), model, process.cwd(), [], { canSpawn: true });
  assert.ok(system.startsWith(HIKES_IDENTITY));
  assert.match(system, /Hikes Systems/);
  assert.match(system, /MIT/);
  assert.match(system, /github\.com\/hikes-systems\/hikes-harness/);
  assert.match(system, /Your name is \*\*Hikes\*\*/);
  assert.match(system, /main and only primary agent/);
});

test("legacy agent ids and custom names resolve to the single Hikes identity", () => {
  const system = buildSystemPrompt(
    request({ agentId: "forge", agentName: "Anvil" }),
    model,
    process.cwd(),
    [],
    { canSpawn: false },
  );
  assert.match(system, /You are the Hikes agent/);
  assert.doesNotMatch(system, /Anvil/);
  assert.match(system, /The user's name is Ada and they work as: engineer/);
  assert.match(system, /They want help with: ship it/);
  assert.match(system, /Preferred response style: concise/);
  assert.equal(system.includes("Delegation:"), false);
});

test("an unknown agent falls back to the generalist instead of failing", () => {
  const system = buildSystemPrompt(request({ agentId: "nope" }), model, process.cwd(), [], {
    canSpawn: false,
  });
  assert.match(system, /You are the Hikes agent/);
});

test("workspace instructions are found in the documented order", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-docs-"));
  fs.mkdirSync(path.join(dir, ".hikes"), { recursive: true });
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "root rules");
  fs.writeFileSync(path.join(dir, "HIKES.md"), "hikes rules");
  fs.writeFileSync(path.join(dir, ".hikes", "hikes.md"), "folder rules");

  const docs = projectInstructions(dir);
  assert.deepEqual(
    docs.map((doc) => doc.file),
    ["AGENTS.md", "HIKES.md", path.join(".hikes", "hikes.md")],
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a huge instruction file is truncated to the budget", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-docs-"));
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "x".repeat(50_000));
  const docs = projectInstructions(dir);
  assert.equal(docs.length, 1);
  assert.match(docs[0].content, /… truncated$/);
  assert.ok(docs[0].content.length <= 12_100);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("memories are only injected when they match the request", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-memory-"));
  const db = new Db(path.join(dir, "hikes.db"));
  try {
    db.addMemory("global", "The user prefers TypeScript with strict mode enabled.");
    db.addMemory("global", "The deploy target is Fly.io in the eu-central region.");

    assert.equal(relevantMemories(db, "").length, 0);
    assert.equal(relevantMemories(db, "🫡").length, 0);

    const hits = relevantMemories(db, "typescript strict");
    assert.equal(hits.length, 1);
    assert.match(hits[0], /TypeScript/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the sub-agent identity keeps the same product framing", () => {
  assert.match(HIKES_SUBAGENT_IDENTITY, /Hikes Systems/);
  assert.match(HIKES_SUBAGENT_IDENTITY, /product that hosts you/);
  assert.match(HIKES_SUBAGENT_IDENTITY, /never as "me" or "you"/);
});

test("small talk does not drag the workspace instructions along", () => {
  assert.equal(wantsProjectContext(request({ text: "how are you?", full: "how are you?" }), []), false);
  assert.equal(wantsProjectContext(request({ text: "thanks!", full: "thanks!" }), []), false);
  assert.equal(wantsProjectContext(request({ text: "Hi. What can I help with today?", full: "Hi. What can I help with today?" }), []), false);
});

test("a question about the workspace asks for the instructions", () => {
  for (const text of [
    "fix the failing test in src/server/agent/loop.ts",
    "what does this repo do?",
    "can you make it faster?",
  ]) {
    assert.equal(wantsProjectContext(request({ text, full: text }), []), true, text);
  }
});

test("the instructions stay loaded for the rest of the session", () => {
  const text = "add a test for the config store";
  const history = [
    { id: "m1", role: "user" as const, text, full: text, createdAt: 1 },
  ];
  assert.equal(wantsProjectContext(request({ text: "thanks, that worked", full: "thanks, that worked" }), history), true);
});

test("the prompt points at the instruction files when they are left out", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-docs-"));
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "root rules");
  try {
    const system = buildSystemPrompt(request(), model, dir, [], {
      canSpawn: false,
      includeProject: false,
    });
    assert.match(system, /Project instructions: AGENTS\.md/);
    assert.equal(system.includes("root rules"), false);

    const loaded = buildSystemPrompt(request(), model, dir, [], {
      canSpawn: false,
      includeProject: true,
    });
    assert.match(loaded, /root rules/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
