import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { RunningServer, ServerOptions } from "./index.ts";
import { VERSION } from "./version.ts";

/**
 * The Hikes launcher.
 *
 * This lives inside the server instead of a separate wrapper script, so the
 * whole app is operated from one internal entry point: `node server/index.ts`
 * (or `npm start`). It picks the ports, mints the token, starts the API,
 * attaches the Vite dev server or the built UI, prints the banner and opens
 * the browser.
 */

export interface LauncherOptions {
  /** Starts the API. Passed in so the launcher never imports the server. */
  start: (options: ServerOptions) => Promise<RunningServer>;
  /** Project root: holds vite.config.ts and dist/. */
  root: string;
  argv: string[];
}

const color = Boolean(process.stdout.isTTY);
const paint = (code: string, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = (text: string) => paint("2", text);
const bold = (text: string) => paint("1", text);
const accent = (text: string) => paint("38;5;153", text);

interface LaunchFlags {
  open: boolean;
  prod: boolean;
  apiOnly: boolean;
  noAuth: boolean;
  port: number;
  apiPort: number;
  workspace: string | null;
  dataDir: string | null;
  model: string | null;
  token: string | null;
}

/** Where a running instance records itself, so a later launch can find it. */
interface RuntimeInfo {
  webUrl: string;
  apiPort: number;
  token: string;
  noAuth: boolean;
  pid: number;
}

function runtimeFile(dataDir: string): string {
  return path.join(dataDir, "runtime.json");
}

function readRuntime(dataDir: string): RuntimeInfo | null {
  try {
    const raw = JSON.parse(fs.readFileSync(runtimeFile(dataDir), "utf8")) as Partial<RuntimeInfo>;
    if (typeof raw?.webUrl !== "string") return null;
    if (typeof raw.apiPort !== "number" || typeof raw.token !== "string") return null;
    return {
      webUrl: raw.webUrl,
      apiPort: raw.apiPort,
      token: raw.token,
      noAuth: Boolean(raw.noAuth),
      pid: typeof raw.pid === "number" ? raw.pid : 0,
    };
  } catch {
    return null;
  }
}

function writeRuntime(dataDir: string, info: RuntimeInfo): void {
  const file = runtimeFile(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(info, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Remove the runtime file, unless a newer instance has already claimed it. */
function clearRuntime(dataDir: string, pid: number): void {
  const current = readRuntime(dataDir);
  if (current && current.pid !== pid) return;
  try {
    fs.rmSync(runtimeFile(dataDir), { force: true });
  } catch {
    /* ignore */
  }
}

/** Is the instance that wrote the runtime file still serving? */
async function instanceAlive(info: RuntimeInfo): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.apiPort}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body?.ok === true;
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const opener = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  opener.unref();
}

function usage(version: string): string {
  return `
${bold("hikes")} — local agent harness  ${dim(`v${version}`)}

Usage:
  hikes [options]

Options:
  -p, --port <n>        Web UI port (default 5173)
      --api-port <n>    API port (default 8787)
  -w, --workspace <d>   Folder the file and shell tools may use (default: last UI choice, else cwd)
      --data-dir <d>    Where sessions, memory and keys live (default: ~/.hikes)
      --model <key>     Default model, e.g. openai:gpt-4.1
      --token <token>   Use a specific session token
      --prod            Serve the built UI instead of the Vite dev server
      --api-only        Start the API only (no Vite, no browser)
      --no-open         Don't open the browser
      --no-auth         Disable token auth (not recommended)
  -v, --version         Print version
  -h, --help            Show this help

Examples:
  hikes
  hikes --workspace C:\\projects\\my-app
  hikes --prod --no-open
`;
}

function die(message: string): never {
  console.error(`${paint("31", "error")} ${message}`);
  process.exit(1);
}

function parseFlags(argv: string[]): LaunchFlags {
  const flags: LaunchFlags = {
    open: true,
    prod: false,
    apiOnly: false,
    noAuth: false,
    port: 5173,
    apiPort: 8787,
    workspace: null,
    dataDir: null,
    model: null,
    token: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) die(`${arg} needs a value.`);
      return value;
    };
    switch (arg) {
      case "-h":
      case "--help":
        console.log(usage(VERSION));
        process.exit(0);
        break;
      case "-v":
      case "--version":
        console.log(`hikes v${VERSION}`);
        process.exit(0);
        break;
      case "--no-open":
        flags.open = false;
        break;
      case "--prod":
        flags.prod = true;
        break;
      case "--api-only":
        flags.apiOnly = true;
        break;
      case "--no-auth":
        flags.noAuth = true;
        break;
      case "-p":
      case "--port":
        flags.port = Number(next());
        break;
      case "--api-port":
        flags.apiPort = Number(next());
        break;
      case "-w":
      case "--workspace":
        flags.workspace = path.resolve(next());
        break;
      case "--data-dir":
        flags.dataDir = path.resolve(next());
        break;
      case "--model":
        flags.model = next();
        break;
      case "--token":
        flags.token = next();
        break;
      default:
        die(`Unknown option: ${arg}. Try --help.`);
    }
  }
  return flags;
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function findPort(preferred: number, label: string): Promise<number> {
  for (let port = preferred; port < preferred + 40; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`Could not find a free ${label} port near ${preferred}.`);
}

/** Keep the one SQLite experimental warning from dominating the banner. */
function quietSqliteWarning(): void {
  // The warning is already silenced in server/quiet.ts, which runs before
  // node:sqlite is imported. This is a safety net for the case where the
  // launcher is used on its own.
  const original = process.emitWarning.bind(process);
  process.emitWarning = (warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : (warning as Error)?.message ?? "";
    if (/SQLite is an experimental feature/i.test(text)) return;
    (original as (...args: unknown[]) => void)(warning, ...rest);
  };
}

export async function runLauncher(options: LauncherOptions): Promise<void> {
  const { start, root } = options;
  const version = VERSION;
  const flags = parseFlags(options.argv);
  if (!flags.prod && !flags.apiOnly && !fs.existsSync(path.join(root, "node_modules", "vite"))) {
    flags.prod = true;
  }

  const nodeParts = process.versions.node.split(".").map(Number);
  if (nodeParts[0] < 22 || (nodeParts[0] === 22 && nodeParts[1] < 18)) {
    die(`Node 22.18 or newer is required (you have ${process.versions.node}).`);
  }

  const dataDir = flags.dataDir || path.join(os.homedir(), ".hikes");
  fs.mkdirSync(dataDir, { recursive: true });

  // A Hikes instance is already running for this data directory. Bring it
  // forward instead of starting a second one on a different port: the browser
  // treats a different port as a different origin, which wipes its profile
  // and puts the user back through onboarding with all their sessions
  // waiting behind it.
  const running = !flags.apiOnly ? readRuntime(dataDir) : null;
  if (running && (await instanceAlive(running))) {
    const target = new URL(running.webUrl);
    if (!running.noAuth) target.searchParams.set("hikes_token", running.token);
    const url = target.toString();
    console.log("");
    console.log(`  ${accent("▲")} ${bold("HIKES")}  ${dim(`v${version}`)}`);
    console.log(`  ${dim("─".repeat(56))}`);
    console.log(`  ${dim("Already running")}  ${running.webUrl}`);
    console.log("");
    if (flags.open) openBrowser(url);
    else console.log(`  ${dim("Open it at:")}  ${dim(url)}`);
    console.log("");
    return;
  }

  let workspace: string | null = null;
  if (flags.workspace) {
    if (!fs.existsSync(flags.workspace)) die(`Workspace does not exist: ${flags.workspace}`);
    if (!fs.statSync(flags.workspace).isDirectory()) die(`Workspace is not a folder: ${flags.workspace}`);
    workspace = fs.realpathSync(flags.workspace);
  }

  if (flags.prod && !fs.existsSync(path.join(root, "dist", "index.html"))) {
    die("No production build found. Run `npm run build` first, or start without --prod.");
  }

  quietSqliteWarning();

  const apiPort = await findPort(flags.apiPort, "API");
  const webPort = flags.prod || flags.apiOnly ? apiPort : await findPort(flags.port, "web");
  const token = flags.token || `hsk_${randomBytes(24).toString("base64url")}`;

  let api: RunningServer | null = null;
  let vite: { close: () => Promise<void> } | null = null;

  const shutdown = async (code = 0) => {
    try {
      if (vite) await vite.close();
    } catch {
      /* ignore */
    }
    try {
      if (api) await api.close();
    } catch {
      /* ignore */
    }
    clearRuntime(dataDir, process.pid);
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    api = await start({
      port: apiPort,
      token,
      dataDir,
      workspace: workspace ?? undefined,
      defaultModel: flags.model ?? undefined,
      staticDir: flags.prod ? path.join(root, "dist") : undefined,
      noAuth: flags.noAuth,
    });

    let webUrl = `http://127.0.0.1:${api.port}/`;
    if (!flags.prod && !flags.apiOnly) {
      const { createServer } = await import("vite");
      const server = await createServer({
        root,
        configFile: path.join(root, "vite.config.ts"),
        server: {
          host: "127.0.0.1",
          port: webPort,
          strictPort: true,
          proxy: {
            "/api": {
              target: `http://127.0.0.1:${apiPort}`,
              changeOrigin: true,
            },
          },
        },
        logLevel: "warn",
      });
      await server.listen();
      vite = server;
      webUrl = server.resolvedUrls?.local?.[0] ?? webUrl;
    }

    const bootstrap = await fetch(`http://127.0.0.1:${api.port}/api/bootstrap`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const target = new URL(webUrl);
    if (!flags.noAuth) target.searchParams.set("hikes_token", token);
    const openUrl = target.toString();

    // Record this instance so a later launch finds it instead of starting a
    // second one on another port.
    writeRuntime(dataDir, {
      webUrl,
      apiPort: api.port,
      token,
      noAuth: flags.noAuth,
      pid: process.pid,
    });

    const rule = "─".repeat(56);
    console.log("");
    console.log(`  ${accent("▲")} ${bold("HIKES")}  ${dim(`v${version}`)}`);
    console.log(`  ${dim(rule)}`);
    console.log(`  ${dim("Local")}      ${webUrl}`);
    console.log(`  ${dim("API")}        http://127.0.0.1:${api.port}`);
    console.log(
      `  ${dim("Token")}      ${flags.noAuth ? paint("33", "disabled (--no-auth)") : accent(token)}`,
    );
    console.log(`  ${dim("Workspace")}  ${bootstrap?.workspace ?? workspace ?? process.cwd()}`);
    console.log(`  ${dim("Data")}       ${dataDir}`);
    console.log(`  ${dim(rule)}`);
    if (!flags.noAuth) {
      console.log(`  ${dim("If the browser did not open, visit:")}`);
      console.log(`  ${dim(openUrl)}`);
    }
    console.log(`  ${dim("Ready — Ctrl+C to stop.")}`);
    console.log("");

    if (flags.open && !flags.apiOnly) {
      openBrowser(openUrl);
    }
  } catch (error) {
    await shutdown(1);
    console.error(`${paint("31", "error")} ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
