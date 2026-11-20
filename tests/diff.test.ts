import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDiff } from "../server/lib/diff.ts";

test("identical text has no diff", () => {
  const result = makeDiff("a\nb\nc", "a\nb\nc");
  assert.deepEqual(result, { diff: "", additions: 0, deletions: 0 });
});

test("a single changed line reports both counts and a hunk header", () => {
  const result = makeDiff("a\nb\nc", "a\nB\nc");
  assert.equal(result.additions, 1);
  assert.equal(result.deletions, 1);
  assert.match(result.diff, /@@ -2,1 \+2,1 @@/);
  assert.match(result.diff, /^- b$/m);
  assert.match(result.diff, /^\+ B$/m);
});

test("three lines of context surround the change", () => {
  const before = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight";
  const after = before.replace("five", "FIVE");
  const result = makeDiff(before, after);
  assert.match(result.diff, /^ {2}two$/m);
  assert.match(result.diff, /^ {2}four$/m);
  assert.match(result.diff, /^ {2}six$/m);
  // Only the immediate context, not the whole file.
  assert.equal(/^ {2}one$/m.test(result.diff), false);
});

test("an added line at the end is counted as an addition", () => {
  const result = makeDiff("a\nb", "a\nb\nc");
  assert.equal(result.additions, 1);
  assert.equal(result.deletions, 0);
  assert.match(result.diff, /^\+ c$/m);
});

test("a huge change is truncated so it cannot flood the transcript", () => {
  const before = Array.from({ length: 400 }, (_, i) => `old ${i}`).join("\n");
  const after = Array.from({ length: 400 }, (_, i) => `new ${i}`).join("\n");
  const result = makeDiff(before, after);
  assert.match(result.diff, /… diff truncated$/);
  assert.ok(result.diff.length <= 12_000 + 32);
  assert.equal(result.additions, 400);
  assert.equal(result.deletions, 400);
});

test("windows line endings do not create a phantom change", () => {
  const result = makeDiff("a\r\nb\r\nc", "a\r\nb\r\nc");
  assert.equal(result.diff, "");
});
