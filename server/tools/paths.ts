import fs from "node:fs";
import path from "node:path";
import { ToolError } from "./types.ts";

const SENSITIVE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "credentials",
  "secrets",
]);

const SENSITIVE_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".keystore"]);

const SENSITIVE_SEGMENTS = new Set([".ssh", ".aws", ".gnupg"]);

export function isSensitivePath(relative: string): boolean {
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (parts.some((part) => SENSITIVE_SEGMENTS.has(part.toLowerCase()))) return true;
  const name = parts[parts.length - 1]?.toLowerCase() ?? "";
  if (SENSITIVE_NAMES.has(name)) return true;
  if (name.startsWith(".env.")) return true;
  if (SENSITIVE_EXTENSIONS.has(path.extname(name))) return true;
  if (name.startsWith("secrets.")) return true;
  return false;
}

export function resolveInWorkspace(root: string, relative: string): string {
  const cleaned = (relative || ".").replace(/^[/\\]+/, "");
  const absolute = path.resolve(root, cleaned);
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ToolError("That path is outside the workspace.");
  }
  return absolute;
}

/** Blocks symlinks that point outside the workspace. */
export function assertRealPathInside(root: string, absolute: string): void {
  let real: string;
  try {
    real = fs.realpathSync(absolute);
  } catch {
    const parent = path.dirname(absolute);
    try {
      real = path.join(fs.realpathSync(parent), path.basename(absolute));
    } catch {
      return;
    }
  }
  const rel = path.relative(fs.realpathSync(root), real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ToolError("That path resolves outside the workspace.");
  }
}

export function displayPath(root: string, absolute: string): string {
  const rel = path.relative(root, absolute);
  return rel ? rel.split(path.sep).join("/") : ".";
}
