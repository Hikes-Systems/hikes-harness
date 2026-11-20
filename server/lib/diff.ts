/**
 * A small, dependency-free line diff.
 *
 * Hikes edits files with `write_file` and `edit_file`, so the useful diff is
 * usually one contiguous change. We trim the common prefix and suffix, then
 * render the middle as a unified-style hunk. That keeps the cost linear even
 * for very large files, which matters because the diff travels to the browser
 * with every tool step.
 */

export interface DiffResult {
  diff: string;
  additions: number;
  deletions: number;
}

const CONTEXT = 3;
const MAX_HUNK_LINES = 160;
const MAX_DIFF_CHARS = 12_000;

const splitLines = (value: string): string[] => value.split(/\r?\n/);

export function makeDiff(before: string, after: string): DiffResult {
  const a = splitLines(before);
  const b = splitLines(after);

  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(a.length - prefix, b.length - prefix);
  while (
    suffix < maxSuffix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMiddle = a.slice(prefix, a.length - suffix);
  const newMiddle = b.slice(prefix, b.length - suffix);

  if (!oldMiddle.length && !newMiddle.length) {
    return { diff: "", additions: 0, deletions: 0 };
  }

  const contextBefore = a.slice(Math.max(0, prefix - CONTEXT), prefix);
  const contextAfter = a.slice(a.length - suffix, Math.min(a.length, a.length - suffix + CONTEXT));

  const lines: string[] = [];
  if (contextBefore.length) {
    lines.push(...contextBefore.map((line) => `  ${line}`));
  }
  const startLine = prefix + 1;
  const oldCount = oldMiddle.length;
  const newCount = newMiddle.length;
  lines.push(`@@ -${startLine},${oldCount} +${startLine},${newCount} @@`);
  for (const line of oldMiddle) lines.push(`- ${line}`);
  for (const line of newMiddle) lines.push(`+ ${line}`);
  if (contextAfter.length) {
    lines.push(...contextAfter.map((line) => `  ${line}`));
  }

  let diff = lines.join("\n");
  if (lines.length > MAX_HUNK_LINES) {
    diff = `${lines.slice(0, MAX_HUNK_LINES).join("\n")}\n… diff truncated`;
  }
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n… diff truncated`;
  }

  return { diff, additions: newCount, deletions: oldCount };
}
