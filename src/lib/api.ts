import type {
  Bootstrap,
  McpServerConfig,
  McpServerStatus,
  ProviderId,
  RunEvent,
  RunRequest,
  Session,
  SessionSummary,
  SettingsPatch,
  TestProviderResult,
} from "@shared/protocol";

const TOKEN_KEY = "hikes:token";

/**
 * Reads the launch token from the URL and stores it for later requests.
 *
 * The launcher opens the UI with `?hikes_token=…`. Older links used the hash
 * (`#hikes_token=…`), and the API also accepts `?token=`, so all three are
 * accepted and then stripped from the address bar.
 */
function captureToken(): string {
  if (typeof window === "undefined") return "";
  let token = "";
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);
    const fromHash = hashParams.get("hikes_token");
    const fromQuery = searchParams.get("hikes_token");
    const fromLegacyQuery = searchParams.get("token");
    token = fromQuery || fromHash || fromLegacyQuery || "";
    const storage = window.localStorage;
    if (token) storage.setItem(TOKEN_KEY, token);
    else token = storage.getItem(TOKEN_KEY) || "";
    if (fromHash || fromQuery || fromLegacyQuery) {
      hashParams.delete("hikes_token");
      searchParams.delete("hikes_token");
      searchParams.delete("token");
      const nextHash = hashParams.toString();
      const nextSearch = searchParams.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname +
          (nextSearch ? `?${nextSearch}` : "") +
          (nextHash ? `#${nextHash}` : ""),
      );
    }
  } catch {
    token = "";
  }
  return token;
}

const TOKEN = captureToken();

export const getToken = () => TOKEN;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function headers(hasBody: boolean): Headers {
  const h = new Headers();
  if (TOKEN) h.set("authorization", `Bearer ${TOKEN}`);
  if (hasBody) h.set("content-type", "application/json");
  return h;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (typeof json.error === "string" && json.error) return json.error;
  } catch {
    /* not json */
  }
  return `${res.status} ${res.statusText || "request failed"}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const merged = headers(Boolean(init.body));
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => merged.set(key, value));
  }
  const res = await fetch(`/api${path}`, { ...init, headers: merged });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ───────────── bootstrap ───────────── */

export const getBootstrap = () => request<Bootstrap>("/bootstrap");

/* ───────────── sessions ───────────── */

export async function listSessions(): Promise<SessionSummary[]> {
  const data = await request<{ sessions: SessionSummary[] }>("/sessions");
  return data.sessions;
}

export async function createSession(agent = "hikes"): Promise<Session> {
  const data = await request<{ session: Session }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ agent }),
  });
  return data.session;
}

export async function getSession(id: string): Promise<Session> {
  const data = await request<{ session: Session }>(`/sessions/${encodeURIComponent(id)}`);
  return data.session;
}

export async function patchSession(
  id: string,
  patch: { title?: string; agent?: string },
): Promise<SessionSummary> {
  const data = await request<{ session: SessionSummary }>(
    `/sessions/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return data.session;
}

export async function deleteSession(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ───────────── snapshots & compaction ───────────── */

export interface RevertResult {
  ok: boolean;
  reverted: string[];
}

export async function revertStep(sessionId: string, stepId: string): Promise<RevertResult> {
  return request<RevertResult>(
    `/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepId)}/revert`,
    { method: "POST" },
  );
}

export interface CompactResult {
  ok: boolean;
  compactedMessages: number;
  savedTokens: number;
  digest: string;
}

export async function compactSession(sessionId: string): Promise<CompactResult> {
  return request<CompactResult>(`/sessions/${encodeURIComponent(sessionId)}/compact`, {
    method: "POST",
  });
}

/* ───────────── MCP servers ───────────── */

export async function listMcpServers(): Promise<McpServerStatus[]> {
  const data = await request<{ servers: McpServerStatus[] }>("/mcp/servers");
  return data.servers;
}

export async function discoverMcpServers(): Promise<{ imported: number; discovered: number; sources: number; servers: McpServerStatus[] }> {
  return request("/mcp/discover", { method: "POST" });
}

export async function saveMcpServer(
  server: McpServerConfig,
): Promise<McpServerStatus[]> {
  const data = await request<{ servers: McpServerStatus[] }>("/mcp/servers", {
    method: "POST",
    body: JSON.stringify(server),
  });
  return data.servers;
}

export async function deleteMcpServer(id: string): Promise<McpServerStatus[]> {
  const data = await request<{ servers: McpServerStatus[] }>(`/mcp/servers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return data.servers;
}

export async function testMcpServer(id: string): Promise<McpServerStatus> {
  const data = await request<{ ok: boolean; server: McpServerStatus }>(
    `/mcp/servers/${encodeURIComponent(id)}/verify`,
    { method: "POST" },
  );
  return data.server;
}

/* ───────────── providers & settings ───────────── */

export async function saveProvider(
  id: ProviderId,
  patch: {
    enabled?: boolean;
    apiKey?: string;
    clearKey?: boolean;
    baseUrl?: string;
    customModel?: string;
  },
): Promise<void> {
  await request(`/providers/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function testProvider(
  id: ProviderId,
  draft: { apiKey?: string; baseUrl?: string; customModel?: string },
): Promise<TestProviderResult> {
  return request<TestProviderResult>(`/providers/${id}/verify`, {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export async function saveSettings(patch: SettingsPatch): Promise<void> {
  await request("/settings", { method: "PUT", body: JSON.stringify(patch) });
}

/* ───────────── memory ───────────── */

export interface MemoryEntry {
  id: string;
  scope: string;
  content: string;
  tags: string;
  created_at: number;
}

export async function listMemory(query?: string): Promise<MemoryEntry[]> {
  const trimmed = (query ?? "").trim();
  const suffix = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
  const data = await request<{ memories: MemoryEntry[] }>(`/memory${suffix}`);
  return data.memories;
}

export async function deleteMemory(id: string): Promise<void> {
  await request(`/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ───────────── runs ───────────── */

export async function* streamRun(
  payload: RunRequest,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  if (!res.body) throw new Error("The harness returned an empty response stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parse = (line: string): RunEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as RunEvent;
    } catch {
      return null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const event = parse(line);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    const event = parse(buffer);
    if (event) yield event;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

export async function resolveApproval(
  runId: string,
  callId: string,
  approve: boolean,
): Promise<void> {
  await request(
    `/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(callId)}`,
    { method: "POST", body: JSON.stringify({ approve }) },
  );
}

export async function cancelRun(runId: string): Promise<void> {
  await request(`/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
}
