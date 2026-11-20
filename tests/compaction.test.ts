import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Db } from "../server/db.ts";
import type { Msg } from "../shared/protocol.ts";
import {
  buildDigest,
  estimateTokens,
  planContext,
} from "../server/agent/compaction.ts";

function sandbox(run: (db: Db, sessionId: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-db-"));
  const db = new Db(path.join(dir, "hikes.db"));
  const session = db.createSession();
  try {
    run(db, session.id);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const message = (role: "user" | "assistant", text: string, index: number): Msg => ({
  id: `m${index}`,
  role,
  text,
  full: text,
  createdAt: index,
});

test("estimateTokens never returns zero", () => {
  assert.equal(estimateTokens(""), 1);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(400)), 100);
});

test("a short session is sent verbatim, with no digest", () => {
  sandbox((db, sessionId) => {
    const messages = Array.from({ length: 4 }, (_, i) =>
      message(i % 2 === 0 ? "user" : "assistant", `message ${i}`, i),
    );
    const plan = planContext({
      db,
      sessionId,
      sessionMessages: messages,
      system: "system",
      contextWindow: 128_000,
    });
    assert.equal(plan.compacted, false);
    assert.equal(plan.digestCreated, false);
    assert.equal(plan.messages.length, 4);
    assert.equal(plan.messages[0].content, "message 0");
  });
});

test("forcing compaction folds older turns into a digest", () => {
  sandbox((db, sessionId) => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      message(i % 2 === 0 ? "user" : "assistant", `message ${i}`, i),
    );
    const plan = planContext({
      db,
      sessionId,
      sessionMessages: messages,
      system: "system",
      contextWindow: 128_000,
      force: true,
      keepRecent: 2,
    });

    assert.equal(plan.compacted, true);
    assert.equal(plan.digestCreated, true);
    assert.equal(plan.olderMessages, 6);
    assert.equal(plan.messages.length, 3);
    assert.match(plan.messages[0].content, /^\[Earlier conversation, compacted\]/);
    assert.equal(plan.messages[1].content, "message 6");
    assert.equal(plan.messages[2].content, "message 7");
    assert.equal(db.latestContextDigest(sessionId)?.summary, plan.digest);
  });
});

test("the same digest is reused instead of being rebuilt", () => {
  sandbox((db, sessionId) => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      message(i % 2 === 0 ? "user" : "assistant", `message ${i}`, i),
    );
    const options = {
      db,
      sessionId,
      sessionMessages: messages,
      system: "system",
      contextWindow: 128_000,
      force: true,
      keepRecent: 2,
    };
    const first = planContext(options);
    const second = planContext(options);
    assert.equal(second.digest, first.digest);
    assert.equal(second.digestCreated, false);
  });
});

test("a digest names the roles and truncates long turns", () => {
  const digest = buildDigest([
    message("user", "hello", 0),
    message("assistant", "x".repeat(1_000), 1),
  ]);
  assert.match(digest, /User: hello/);
  assert.match(digest, /Assistant: x{320}…/);
});

test("a full context window triggers compaction without force", () => {
  sandbox((db, sessionId) => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      message(i % 2 === 0 ? "user" : "assistant", "y".repeat(2_000), i),
    );
    const plan = planContext({
      db,
      sessionId,
      sessionMessages: messages,
      system: "system",
      contextWindow: 4_000,
      keepRecent: 2,
    });
    assert.equal(plan.compacted, true);
    assert.ok(plan.savedTokens > 0);
  });
});
