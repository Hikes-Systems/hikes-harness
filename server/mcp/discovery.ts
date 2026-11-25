import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { McpServerConfig } from "../../shared/protocol.ts";

const MAX_FILE_BYTES = 512_000;
const MAX_SOURCES = 32;

export interface McpDiscoveryResult {
  servers: McpServerConfig[];
  sources: number;
  skipped: number;
  errors: string[];
}

/** Strip JSONC comments and trailing commas without touching string contents. */
export function parseJsonc(text: string): unknown {
  let clean = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        clean += char;
      } else clean += " ";
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        clean += "  ";
        i++;
      } else clean += char === "\n" ? char : " ";
      continue;
    }
    if (inString) {
      clean += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      clean += char;
    } else if (char === "/" && next === "/") {
      lineComment = true;
      clean += "  ";
      i++;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      clean += "  ";
      i++;
    } else clean += char;
  }

  let withoutTrailing = "";
  inString = false;
  escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inString) {
      withoutTrailing += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      withoutTrailing += char;
      continue;
    }
    if (char === ",") {
      let ahead = i + 1;
      while (/\s/.test(clean[ahead] ?? "")) ahead++;
      if (clean[ahead] === "}" || clean[ahead] === "]") continue;
    }
    withoutTrailing += char;
  }
  return JSON.parse(withoutTrailing);
}

const slugify = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42) || "server";

function existingFile(directory: string): string | null {
  for (const extension of ["jsonc", "json"]) {
    const file = path.join(directory, `opencode.${extension}`);
    try {
      if (fs.statSync(file).isFile()) return file;
    } catch {
      /* try the next documented location */
    }
  }
  return null;
}

function configFiles(workspace: string, homeDir: string): string[] {
  const files: string[] = [];
  const global = existingFile(path.join(homeDir, ".config", "opencode"));
  if (global) files.push(global);

  const ancestors: string[] = [];
  let current = path.resolve(workspace);
  for (;;) {
    ancestors.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Direct project files merge first, then .opencode directories, farthest to
  // nearest. This is configuration precedence, not runtime integration.
  for (const directory of ancestors) {
    const file = existingFile(directory);
    if (file) files.push(file);
  }
  for (const directory of ancestors) {
    const file = existingFile(path.join(directory, ".opencode"));
    if (file) files.push(file);
  }
  return [...new Set(files)].slice(0, MAX_SOURCES);
}

/**
 * Read local stdio definitions from existing OpenCode JSON/JSONC configuration.
 * No OpenCode package, SDK, service or code is used. Remote entries are counted
 * but not imported because Hikes currently has a stdio transport only.
 */
export function discoverOpenCodeMcp(options?: { workspace?: string; homeDir?: string }): McpDiscoveryResult {
  const workspace = path.resolve(options?.workspace ?? process.cwd());
  const homeDir = options?.homeDir ?? os.homedir();
  const byId = new Map<string, McpServerConfig>();
  const errors: string[] = [];
  let sources = 0;
  let skipped = 0;

  for (const file of configFiles(workspace, homeDir)) {
    let document: unknown;
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_FILE_BYTES) throw new Error("configuration is too large");
      document = parseJsonc(fs.readFileSync(file, "utf8"));
      sources++;
    } catch (error) {
      errors.push(`${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!document || typeof document !== "object") continue;
    const mcp = (document as Record<string, unknown>).mcp;
    if (!mcp || typeof mcp !== "object") continue;
    const servers = (mcp as Record<string, unknown>).servers;
    const nested = servers && typeof servers === "object" && !Array.isArray(servers)
      ? servers as Record<string, unknown>
      : null;
    // Older configs put server names directly under mcp. Read that shape as
    // migration input; Hikes still stores its own normalized server records.
    const entries = nested ?? mcp as Record<string, unknown>;

    for (const [name, value] of Object.entries(entries).slice(0, 100)) {
      if (name === "timeout") continue;
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      if (entry.disabled === true) continue;
      if (entry.type !== "local" || !Array.isArray(entry.command)) {
        skipped++;
        continue;
      }
      const parts = entry.command.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
      if (!parts.length) {
        skipped++;
        continue;
      }
      const environment = entry.environment;
      const env: Record<string, string> = {};
      if (environment && typeof environment === "object" && !Array.isArray(environment)) {
        for (const [key, variable] of Object.entries(environment as Record<string, unknown>)) {
          // Placeholders stay unresolved on disk and are expanded only when the
          // local process is launched, so imported secrets are not duplicated.
          if (typeof variable === "string") env[key] = variable;
        }
      }
      const cwd = typeof entry.cwd === "string" && entry.cwd.trim()
        ? path.resolve(workspace, entry.cwd.replace(/^~(?=[\\/]|$)/, homeDir))
        : undefined;
      const id = `opencode-${slugify(name)}`;
      byId.set(id, {
        id,
        name: name.slice(0, 80),
        command: parts[0],
        args: parts.slice(1, 41),
        env,
        enabled: true,
        ...(cwd ? { cwd } : {}),
      });
    }
  }
  return { servers: [...byId.values()], sources, skipped, errors };
}
