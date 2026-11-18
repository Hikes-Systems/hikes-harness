#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const color = Boolean(process.stdout.isTTY);
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = (text) => paint("2", text);
const bold = (text) => paint("1", text);
const accent = (text) => paint("38;5;153", text);

function usage() {
  console.log(`
${bold("hikes")} — local agent harness

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
      --no-open         Don't open the browser
      --no-auth         Disable token auth (not recommended)
  -v, --version         Print version
  -h, --help            Show this help

Examples:
  hikes
  hikes --workspace C:\\projects\\my-app
  hikes --prod --no-open
`);
}

function die(message) {
  console.error(`${paint("31", "error")} ${message}`);
  process.exit(1);
}

const nodeParts = process.versions.node.split(".").map(Number);
if (nodeParts[0] < 22 || (nodeParts[0] === 22 && nodeParts[1] < 18)) {
  die(`Node 22.18 or newer is required (you have ${process.versions.node}).`);
}

const options = {
  open: true,
  prod: false,
  noAuth: false,
  port: 5173,
  apiPort: 8787,
  workspace: null,
  dataDir: null,
  model: null,
  token: null,
};

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  const next = () => {
    const value = process.argv[++i];
    if (!value) die(`${arg} needs a value.`);
    return value;
  };
  switch (arg) {
    case "-h":
    case "--help":
      usage();
      process.exit(0);
      break;
    case "-v":
    case "--version":
      console.log(`hikes ${pkg.version}`);
      process.exit(0);
      break;
    case "--no-open":
      options.open = false;
      break;
    case "--prod":
      options.prod = true;
      break;
    case "--no-auth":
      options.noAuth = true;
      break;
    case "-p":
    case "--port":
      options.port = Number(next());
      break;
    case "--api-port":
      options.apiPort = Number(next());
      break;
    case "-w":
    case "--workspace":
      options.workspace = path.resolve(next());
      break;
    case "--data-dir":
      options.dataDir = path.resolve(next());
      break;
    case "--model":
      options.model = next();
      break;
    case "--token":
      options.token = next();
      break;
    default:
      die(`Unknown option: ${arg}. Try --help.`);
  }
}

const dataDir = options.dataDir || path.join(os.homedir(), ".hikes");
fs.mkdirSync(dataDir, { recursive: true });

let workspace = null;
if (options.workspace) {
  if (!fs.existsSync(options.workspace)) die(`Workspace does not exist: ${options.workspace}`);
  if (!fs.statSync(options.workspace).isDirectory()) die(`Workspace is not a folder: ${options.workspace}`);
  workspace = fs.realpathSync(options.workspace);
}

const token = options.token || `hsk_${randomBytes(24).toString("base64url")}`;
const defaultApiPort = options.apiPort;
const defaultWebPort = options.port;

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function findPort(preferred, label) {
  for (let port = preferred; port < preferred + 40; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`Could not find a free ${label} port near ${preferred}.`);
}

if (options.prod && !fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  die("No production build found. Run `npm run build` first, or start without --prod.");
}

// Keep the one SQLite experimental warning from dominating the banner.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const text = typeof warning === "string" ? warning : warning?.message ?? "";
  if (/SQLite is an experimental feature/i.test(text)) return;
  return originalEmitWarning(warning, ...rest);
};

const apiPort = await findPort(defaultApiPort, "API");
const webPort = options.prod ? apiPort : await findPort(defaultWebPort, "web");

let api = null;
let vite = null;

async function shutdown(code = 0) {
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
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

try {
  const { startServer } = await import(pathToFileURL(path.join(ROOT, "server", "index.ts")).href);
  api = await startServer({
    port: apiPort,
    token,
    dataDir,
    workspace,
    defaultModel: options.model,
    staticDir: options.prod ? path.join(ROOT, "dist") : undefined,
    noAuth: options.noAuth,
  });

  let webUrl;
  if (options.prod) {
    webUrl = `http://127.0.0.1:${api.port}/`;
  } else {
    const { createServer } = await import("vite");
    vite = await createServer({
      root: ROOT,
      configFile: path.join(ROOT, "vite.config.ts"),
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
    await vite.listen();
    webUrl = vite.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${webPort}/`;
  }

  const bootstrap = await fetch(`http://127.0.0.1:${api.port}/api/bootstrap`, {
    headers: { authorization: `Bearer ${token}` },
  })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const model = bootstrap?.models?.find((entry) => entry.key === bootstrap.defaultModel);
  const toolNames = bootstrap
    ? [
        bootstrap.tools?.web ? "web" : null,
        bootstrap.tools?.files ? "files" : null,
        bootstrap.tools?.code ? "shell" : null,
        bootstrap.tools?.memory ? "memory" : null,
      ].filter(Boolean)
    : [];

  const target = new URL(webUrl);
  if (!options.noAuth) target.hash = `hikes_token=${encodeURIComponent(token)}`;
  const openUrl = target.toString();

  const rule = "─".repeat(56);
  console.log("");
  console.log(`  ${accent("▲")} ${bold("HIKES HARNESS")}  ${dim(`v${pkg.version}`)}`);
  console.log(`  ${dim(rule)}`);
  console.log(`  ${dim("Local")}      ${webUrl}`);
  console.log(`  ${dim("API")}        http://127.0.0.1:${api.port}`);
  if (!options.noAuth) {
    console.log(`  ${dim("Token")}      ${accent(token)}`);
  } else {
    console.log(`  ${dim("Token")}      ${paint("33", "disabled (--no-auth)")}`);
  }
  console.log(
    `  ${dim("Model")}      ${
      model ? `${model.name} · ${model.provider}` : paint("33", "no provider configured")
    }`,
  );
  console.log(`  ${dim("Tools")}      ${toolNames.length ? toolNames.join(" · ") : dim("—")}`);
  console.log(`  ${dim("Workspace")}  ${bootstrap?.workspace ?? workspace ?? process.cwd()}`);
  console.log(`  ${dim("Data")}       ${dataDir}`);
  console.log(`  ${dim(rule)}`);
  if (!model) {
    console.log(`  ${paint("33", "Connect a provider in the browser to start chatting.")}`);
  }
  if (!options.noAuth) {
    console.log(`  ${dim("If the browser did not open, visit:")}`);
    console.log(`  ${dim(openUrl)}`);
  }
  console.log(`  ${dim("Ready — Ctrl+C to stop.")}`);
  console.log("");

  if (options.open) {
    const command =
      process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", openUrl] : [openUrl];
    const opener = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    opener.unref();
  }
} catch (error) {
  await shutdown(1);
  console.error(`${paint("31", "error")} ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
