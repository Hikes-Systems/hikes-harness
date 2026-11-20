import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { z } from "zod";
import type { ToolDefinition, ToolResult } from "./types.ts";
import { ToolError } from "./types.ts";
import { assertRealPathInside, displayPath, resolveInWorkspace } from "./paths.ts";

const shellSchema = z.object({
  command: z.string().min(1).max(4000),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().min(1000).max(120_000).optional(),
});

const DESTRUCTIVE: RegExp[] = [
  /(^|\n)\s*format(-volume)?\b/i,
  /\b(clear-disk|initialize-disk|diskpart)\b/i,
  /\b(bcdedit|shutdown|restart-computer|stop-computer)\b/i,
  /\brm\s+(-[a-z]*[rf][a-z]*\s+)+(\/|~|\*)/i,
  /\bremove-item\b[\s\S]*-(recurse|force)/i,
  /\bdel\s+\/[fsq]/i,
  /\b(rd|rmdir)\s+\/s/i,
  /\bcipher\s+\/w/i,
  /\breg\s+delete\s+(HKLM|HKCU)\b/i,
  /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f[a-z]*d)/i,
  /\b(mkfs|dd\s+if=|drop\s+database)\b/i,
];

export const isDestructiveCommand = (command: string): boolean =>
  DESTRUCTIVE.some((pattern) => pattern.test(command));

const ENV_ALLOW = [
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMDATA",
  "COMMONPROGRAMFILES",
  "PSModulePath",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
  "LANG",
  "LC_ALL",
  "HOME",
  "SHELL",
  "TERM",
  "USER",
  "USERNAME",
];

/** Never leak provider keys or tokens into a child process. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HIKES_HARNESS: "1" };
  for (const key of ENV_ALLOW) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n… truncated` : value;
}

export function shellTools(root: string): ToolDefinition[] {
  return [
    {
      risk: "execute",
      spec: {
        name: "run_command",
        description:
          "Run a shell command in the workspace (PowerShell on Windows, bash elsewhere). Use it to inspect projects, run tests or execute code. Commands need approval unless autonomy is auto.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run." },
            cwd: { type: "string", description: "Relative working directory inside the workspace." },
            timeout_ms: { type: "number", description: "Timeout in milliseconds (1000-120000). Defaults to 30000." },
          },
          required: ["command"],
        },
      },
      run: async (args, ctx): Promise<ToolResult> => {
        const parsed = shellSchema.safeParse(args);
        if (!parsed.success) throw new ToolError("run_command needs a valid command.");
        const { command } = parsed.data;
        const cwd = resolveInWorkspace(root, parsed.data.cwd ?? ".");
        assertRealPathInside(root, cwd);
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
          throw new ToolError("cwd is not a directory inside the workspace.");
        }
        const timeout = parsed.data.timeout_ms ?? 30_000;
        const isWindows = process.platform === "win32";
        const started = Date.now();

        const child = spawn(
          isWindows ? "powershell.exe" : "/bin/bash",
          isWindows
            ? ["-NoProfile", "-NonInteractive", "-Command", command]
            : ["-lc", command],
          {
            cwd,
            env: cleanEnv(),
            windowsHide: true,
            detached: !isWindows,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        let stdout = "";
        let stderr = "";
        let truncated = false;
        const MAX_STREAM = 30_000;
        const MAX_LINES = 500;
        const append = (target: "out" | "err", chunk: Buffer): void => {
          const text = chunk.toString("utf8");
          let next = (target === "out" ? stdout : stderr) + text;
          if (next.length > MAX_STREAM) {
            next = next.slice(0, MAX_STREAM);
            truncated = true;
          }
          const lines = next.split("\n");
          if (lines.length > MAX_LINES) {
            next = lines.slice(0, MAX_LINES).join("\n");
            truncated = true;
          }
          if (target === "out") stdout = next;
          else stderr = next;
        };
        child.stdout?.on("data", (chunk: Buffer) => append("out", chunk));
        child.stderr?.on("data", (chunk: Buffer) => append("err", chunk));

        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
          let settled = false;
          const finish = (code: number | null) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve({ code, timedOut });
          };
          timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
            setTimeout(() => finish(null), 1500);
          }, timeout);
          child.on("error", (error) => {
            append("err", Buffer.from(error.message));
            finish(null);
          });
          child.on("close", (code) => finish(code));
          ctx.signal.addEventListener(
            "abort",
            () => {
              timedOut = true;
              killTree(child);
              finish(null);
            },
            { once: true },
          );
        });

        const ms = Date.now() - started;
        const parts: string[] = [`exit ${result.code ?? "?"} · ${(ms / 1000).toFixed(1)}s`];
        if (stdout.trim()) parts.push(`stdout:\n${stdout.trimEnd()}`);
        if (stderr.trim()) parts.push(`stderr:\n${stderr.trimEnd()}`);
        if (!stdout.trim() && !stderr.trim()) parts.push("(no output)");
        if (truncated) parts.push("… output truncated");
        const output = clip(parts.join("\n\n"), 32_000);
        const summary = timedOut
          ? `Command ${result.code === null ? "timed out or was stopped" : `exited ${result.code}`}`
          : `Command exited ${result.code ?? "?"}`;
        return {
          ok: !timedOut && result.code === 0,
          summary,
          detail: `${command.slice(0, 160)} · ${displayPath(root, cwd)}`,
          output,
        };
      },
    },
  ];
}
