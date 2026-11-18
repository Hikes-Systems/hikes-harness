import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolResult } from "./types.ts";
import { ToolError } from "./types.ts";
import {
  assertRealPathInside,
  displayPath,
  isSensitivePath,
  resolveInWorkspace,
} from "./paths.ts";

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".hikes",
  "vendor",
]);

const MAX_READ_BYTES = 400_000;
const MAX_WRITE_BYTES = 300_000;
const MAX_OUTPUT = 80_000;

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".") || "args"}: ${issue.message}`).join("; ");
    throw new ToolError(`Invalid arguments (${detail})`);
  }
  return result.data;
}

function assertNotSensitive(relative: string): void {
  if (isSensitivePath(relative)) {
    throw new ToolError("That file looks like a secret or credential. Read it with the shell tool (which requires approval) instead.");
  }
}

function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  return sample.includes(0);
}

function clip(text: string, max = MAX_OUTPUT): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

interface WalkEntry {
  absolute: string;
  relative: string;
  isDirectory: boolean;
}

function* walk(
  root: string,
  start: string,
  maxDepth: number,
  maxEntries = 4000,
): Generator<WalkEntry> {
  let seen = 0;
  function* visit(dir: string, depth: number): Generator<WalkEntry> {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const item of items) {
      if (seen >= maxEntries) return;
      if (IGNORE.has(item.name)) continue;
      if (item.name === "." || item.name === "..") continue;
      const absolute = path.join(dir, item.name);
      const relative = displayPath(root, absolute);
      if (isSensitivePath(relative)) continue;
      seen++;
      yield { absolute, relative, isDirectory: item.isDirectory() };
      if (item.isDirectory() && depth < maxDepth) yield* visit(absolute, depth + 1);
    }
  }
  yield* visit(start, 0);
}

const listSchema = z.object({
  path: z.string().optional(),
  depth: z.number().int().min(0).max(4).optional(),
});

const readSchema = z.object({
  path: z.string().min(1),
  start_line: z.number().int().min(1).optional(),
  end_line: z.number().int().min(1).optional(),
});

const writeSchema = z.object({
  path: z.string().min(1),
  content: z.string().max(MAX_WRITE_BYTES),
});

const searchSchema = z.object({
  query: z.string().min(2).max(200),
  path: z.string().optional(),
  max_results: z.number().int().min(1).max(50).optional(),
});

function listEntries(root: string, args: string): ToolResult {
  const start = resolveInWorkspace(root, args || ".");
  assertRealPathInside(root, start);
  const stat = fs.statSync(start);
  if (stat.isFile()) {
    return {
      ok: true,
      summary: `1 file · ${displayPath(root, start)}`,
      output: displayPath(root, start),
    };
  }
  const lines: string[] = [];
  let count = 0;
  for (const entry of walk(root, start, 2)) {
    const depth = entry.relative.split("/").length - 1;
    lines.push(`${"  ".repeat(Math.max(0, depth - 1))}${path.basename(entry.relative)}${entry.isDirectory ? "/" : ""}`);
    count++;
    if (count >= 300) break;
  }
  const clipped = clip(lines.join("\n"));
  return {
    ok: true,
    summary: `${count} entries · ${displayPath(root, start)}`,
    detail: displayPath(root, start),
    output: `${clipped.text}${clipped.truncated ? "\n… truncated" : ""}`,
  };
}

function readEntry(root: string, input: unknown): ToolResult {
  const args = parseArgs(readSchema, input);
  const absolute = resolveInWorkspace(root, args.path);
  assertRealPathInside(root, absolute);
  assertNotSensitive(displayPath(root, absolute));
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new ToolError("That path is a directory.");
  if (stat.size > MAX_READ_BYTES) throw new ToolError(`File is too large (${stat.size} bytes; limit ${MAX_READ_BYTES}).`);

  const buffer = fs.readFileSync(absolute);
  if (isBinary(buffer)) throw new ToolError("That file looks binary.");
  const raw = buffer.toString("utf8");
  const lines = raw.split(/\r?\n/);
  let start = args.start_line ?? 1;
  let end = args.end_line ?? lines.length;
  if (start > lines.length) throw new ToolError(`start_line ${start} is past the end (${lines.length} lines).`);
  if (end < start) throw new ToolError("end_line must be at least start_line.");
  end = Math.min(end, lines.length, start + 3999);
  const slice = lines.slice(start - 1, end).join("\n");
  const clipped = clip(slice);
  const header = `${displayPath(root, absolute)} (lines ${start}–${end} of ${lines.length})`;
  return {
    ok: true,
    summary: `Read ${displayPath(root, absolute)} · ${end - start + 1} lines`,
    detail: displayPath(root, absolute),
    output: `${header}\n${clipped.text}${clipped.truncated ? "\n… truncated" : ""}`,
  };
}

function writeEntry(root: string, input: unknown): ToolResult {
  const args = parseArgs(writeSchema, input);
  const absolute = resolveInWorkspace(root, args.path);
  const relative = displayPath(root, absolute);
  assertNotSensitive(relative);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
    throw new ToolError("That path is a directory.");
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  assertRealPathInside(root, absolute);

  const previous = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
  const before = previous ? previous.split(/\r?\n/).length : 0;
  const after = args.content ? args.content.split(/\r?\n/).length : 0;

  const tmp = `${absolute}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, args.content, "utf8");
  try {
    fs.renameSync(tmp, absolute);
  } catch {
    fs.writeFileSync(absolute, args.content, "utf8");
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }

  const delta = previous ? `${after - before >= 0 ? "+" : ""}${after - before} lines` : `${after} lines`;
  return {
    ok: true,
    summary: `Wrote ${Buffer.byteLength(args.content, "utf8")} bytes to ${relative} (${delta})`,
    detail: relative,
    output: `Updated ${relative}\n${delta}`,
  };
}

function searchWorkspace(root: string, input: unknown): ToolResult {
  const args = parseArgs(searchSchema, input);
  const start = resolveInWorkspace(root, args.path ?? ".");
  assertRealPathInside(root, start);
  const needle = args.query.toLowerCase();
  const limit = args.max_results ?? 30;
  const matches: string[] = [];
  let files = 0;
  let scanned = 0;

  for (const entry of walk(root, start, 8, 5000)) {
    if (entry.isDirectory) continue;
    if (matches.length >= limit) break;
    scanned++;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entry.absolute);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 200_000) continue;
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(entry.absolute);
    } catch {
      continue;
    }
    if (isBinary(buffer)) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    let foundInFile = false;
    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      if (!lines[i].toLowerCase().includes(needle)) continue;
      foundInFile = true;
      const text = lines[i].trim().slice(0, 220);
      matches.push(`${entry.relative}:${i + 1}: ${text}`);
      if (matches.filter((m) => m.startsWith(`${entry.relative}:`)).length >= 3) break;
    }
    if (foundInFile) files++;
  }

  if (!matches.length) {
    return {
      ok: true,
      summary: `No matches for “${args.query}”`,
      detail: `${scanned} files scanned`,
      output: "No matches.",
    };
  }
  return {
    ok: true,
    summary: `${matches.length} matches in ${files} files`,
    detail: `“${args.query}”`,
    output: matches.join("\n"),
  };
}

export function fileTools(root: string): ToolDefinition[] {
  return [
    {
      risk: "safe",
      spec: {
        name: "list_files",
        description: "List files and folders inside the workspace. Use this before reading or editing unfamiliar projects.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative folder or file path. Defaults to the workspace root." },
            depth: { type: "number", description: "How deep to recurse (0-4). Defaults to 2." },
          },
        },
      },
      run: async (args) => listEntries(root, parseArgs(listSchema, args).path ?? "."),
    },
    {
      risk: "safe",
      spec: {
        name: "read_file",
        description: "Read a UTF-8 text file inside the workspace. Supports an optional line range.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path." },
            start_line: { type: "number", description: "First line (1-based)." },
            end_line: { type: "number", description: "Last line (inclusive)." },
          },
          required: ["path"],
        },
      },
      run: async (args) => readEntry(root, args),
    },
    {
      risk: "write",
      spec: {
        name: "write_file",
        description: "Create or overwrite a text file inside the workspace. This is a write operation and may require approval.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path." },
            content: { type: "string", description: "Full new contents of the file." },
          },
          required: ["path", "content"],
        },
      },
      run: async (args) => writeEntry(root, args),
    },
    {
      risk: "safe",
      spec: {
        name: "search_files",
        description: "Search text files in the workspace for a literal string. Returns file paths and line numbers.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Literal text to find (case-insensitive)." },
            path: { type: "string", description: "Relative folder to search. Defaults to the workspace root." },
            max_results: { type: "number", description: "Maximum matches to return (1-50)." },
          },
          required: ["query"],
        },
      },
      run: async (args) => searchWorkspace(root, args),
    },
  ];
}
