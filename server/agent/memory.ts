import { z } from "zod";
import type { ModelInfo, Usage } from "../../shared/protocol.ts";
import type { ProviderConfig } from "../config.ts";
import type { Db } from "../db.ts";
import { streamModel } from "../llm/index.ts";

const candidateSchema = z.array(z.string().trim().min(3).max(500)).max(3);
const sensitivePattern =
  /(?:api[ _-]?key|access[ _-]?token|auth[ _-]?token|password|passwd|secret|credential|private[ _-]?key|seed phrase|social security|credit card|\b(?:sk|rk|pk)-[a-z0-9_-]{12,})/i;

/** Memory is personal data, so obvious credentials never reach SQLite. */
export function isSensitiveMemory(value: string): boolean {
  return sensitivePattern.test(value);
}

/** Accept only the small JSON array requested from the extractor. */
export function parseMemoryCandidates(raw: string): string[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = candidateSchema.safeParse(JSON.parse(trimmed.slice(start, end + 1)));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface MemoryExtractionResult {
  candidates: number;
  saved: string[];
  usage: Usage;
}

export function saveMemoryCandidates(db: Db, candidates: string[]): string[] {
  const existing = new Set(db.listMemories(500).map((row) => normalized(row.content)));
  const saved: string[] = [];
  for (const candidate of candidates.slice(0, 3)) {
    const content = candidate.trim();
    const key = normalized(content);
    if (content.length < 3 || content.length > 500 || !key || isSensitiveMemory(content) || existing.has(key)) continue;
    db.addMemory("global", content, ["automatic", "user"]);
    existing.add(key);
    saved.push(content);
  }
  return saved;
}

/**
 * Extract durable user facts with the already-selected provider. This is a
 * separate tools-disabled call: project files, attachments and tool output are
 * deliberately not included, so their contents cannot become personal memory.
 */
export async function extractAndSaveMemories(input: {
  db: Db;
  model: ModelInfo;
  provider: ProviderConfig;
  userText: string;
  signal?: AbortSignal;
}): Promise<MemoryExtractionResult> {
  const userText = input.userText.trim().slice(0, 12_000);
  const usage: Usage = {};
  if (userText.length < 3) return { candidates: 0, saved: [], usage };

  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Memory extraction timed out.")), 25_000);
  let raw = "";
  try {
    for await (const event of streamModel({
      model: input.model,
      provider: input.provider,
      system: [
        "You extract durable personal memories from a user's latest message.",
        "Return only a JSON array of at most three complete-sentence strings, or [].",
        "Save only explicit, lasting facts about the user: name, role, preferences, goals, stable project choices, or recurring constraints.",
        "Do not save guesses, one-off tasks, questions, transient code details, assistant statements, credentials, secrets, or sensitive identifiers.",
        "Write each fact in the third person without mentioning this extraction task.",
      ].join(" "),
      messages: [{ role: "user", content: userText }],
      tools: [],
      signal: controller.signal,
    })) {
      if (event.type === "text") raw += event.text;
      if (event.type === "usage") {
        for (const key of ["inputTokens", "outputTokens", "cachedTokens", "cacheWriteTokens"] as const) {
          const value = event[key];
          if (value !== undefined) usage[key] = (usage[key] ?? 0) + value;
        }
      }
    }
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }

  const candidates = parseMemoryCandidates(raw);
  const saved = saveMemoryCandidates(input.db, candidates);
  return { candidates: candidates.length, saved, usage };
}
