import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Db } from "../server/db.ts";
import {
  isSensitiveMemory,
  parseMemoryCandidates,
  saveMemoryCandidates,
} from "../server/agent/memory.ts";

test("memory extraction accepts only a bounded JSON string array", () => {
  assert.deepEqual(parseMemoryCandidates('```json\n["The user prefers pnpm.", "The user works as a designer."]\n```'), [
    "The user prefers pnpm.",
    "The user works as a designer.",
  ]);
  assert.deepEqual(parseMemoryCandidates('["one", "two", "three", "four"]'), []);
  assert.deepEqual(parseMemoryCandidates('{"memory":"not an array"}'), []);
  assert.deepEqual(parseMemoryCandidates("not json"), []);
});

test("automatic memory deduplicates facts and refuses obvious secrets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-auto-memory-"));
  const db = new Db(path.join(dir, "hikes.db"));
  try {
    const first = saveMemoryCandidates(db, [
      "The user prefers TypeScript.",
      "The user's API key is sk-1234567890abcdef.",
      "The user prefers TypeScript.",
    ]);
    assert.deepEqual(first, ["The user prefers TypeScript."]);
    const second = saveMemoryCandidates(db, ["the user prefers typescript"]);
    assert.deepEqual(second, []);
    assert.equal(db.memoryCount(), 1);
    assert.equal(db.listMemories()[0].tags, "automatic,user");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sensitive-memory filtering covers common credential forms", () => {
  assert.equal(isSensitiveMemory("The user's password is hunter2."), true);
  assert.equal(isSensitiveMemory("The user's access token is abc."), true);
  assert.equal(isSensitiveMemory("The user likes token-based design."), false);
  assert.equal(isSensitiveMemory("The user is a TypeScript developer."), false);
});
