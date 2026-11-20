import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The product version, read from `package.json`.
 *
 * `package.json` is the single source of truth. The banner, `hikes --version`,
 * the `/health` response and the MCP client handshake all read the same value
 * from here, so a release bump cannot leave one of them behind.
 *
 * The package root is resolved from this module's own location rather than
 * `process.cwd()`, because `hikes --version` has to work from any directory.
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The current Hikes version, for example "1.0.1". */
export const VERSION: string = readVersion();
