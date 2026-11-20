import type { Msg } from "../../shared/protocol.ts";
import type { Db } from "../db.ts";
import type { AgentMessage } from "../llm/types.ts";

/**
 * Context compaction.
 *
 * Long sessions blow past the model's context window once tool output piles
 * up. Hikes keeps the full transcript in SQLite and, when the prompt grows
 * past ~78% of the model's context window, replaces the older turns with a
 * short digest. The digest is deterministic and local: no extra model call,
 * no surprise bill, and the transcript is never lost.
 */

/** Recent turns are always sent verbatim. */
export const KEEP_RECENT_MESSAGES = 6;
/** Compaction kicks in at this share of the model's context window. */
export const COMPACTION_TRIGGER = 0.78;
/** Never send more than this many raw messages even without compaction. */
export const MAX_RAW_MESSAGES = 20;

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}\n… truncated` : value;

export const estimateTokens = (value: string): number =>
  Math.max(1, Math.ceil(value.length / 4));

export interface CompactionPlan {
  messages: AgentMessage[];
  compacted: boolean;
  /** The digest that replaced the older turns. */
  digest?: string;
  /** True when a new digest was written for this run. */
  digestCreated: boolean;
  /** How many older messages were folded into the digest. */
  olderMessages: number;
  /** Approximate tokens saved. */
  savedTokens: number;
}

const toAgentMessage = (message: Msg): AgentMessage =>
  message.role === "user"
    ? { role: "user", content: clip(message.full ?? message.text, 60_000) }
    : { role: "assistant", content: clip(message.text, 60_000) };

const describeMessage = (message: Msg): string => {
  const raw = message.role === "user" ? message.full ?? message.text : message.text;
  const text = raw.replace(/\s+/g, " ").trim();
  const tools = (message.steps ?? []).filter((step) => step.tool).length;
  const head = `${message.role === "user" ? "User" : "Assistant"}: ${text.slice(0, 320)}${text.length > 320 ? "…" : ""}`;
  return tools ? `${head} (${tools} tool call${tools === 1 ? "" : "s"})` : head;
};

/** Build an extractive digest of the older turns. */
export function buildDigest(messages: Msg[]): string {
  if (!messages.length) return "";
  const lines = messages.map(describeMessage);
  return [
    `Context summary of ${messages.length} earlier message${messages.length === 1 ? "" : "s"} in this session.`,
    "These turns were compacted to protect the context window; the full transcript is still stored in the session.",
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

export function planContext(input: {
  db: Db;
  sessionId: string;
  sessionMessages: Msg[];
  /** The system prompt, counted towards the context window. */
  system: string;
  contextWindow?: number;
  /** Manual compaction: compact even when the window is not full. */
  force?: boolean;
  /** How many recent turns to keep verbatim. */
  keepRecent?: number;
}): CompactionPlan {
  const keep = input.keepRecent ?? KEEP_RECENT_MESSAGES;
  const all = input.sessionMessages;
  const splitAt = Math.max(0, all.length - keep);
  const older = all.slice(0, splitAt);
  const recent = all.slice(splitAt).map(toAgentMessage).filter((m) => m.content.trim().length > 0);

  const rawTokens = estimateTokens(
    input.system + all.map((m) => (m.role === "user" ? m.full ?? m.text : m.text)).join("\n"),
  );
  const window = input.contextWindow ?? 0;
  const overBudget = window > 0 && rawTokens > window * COMPACTION_TRIGGER;

  const stored = input.db.latestContextDigest(input.sessionId);
  const storedUsable =
    Boolean(stored?.summary.trim()) && older.length > 0 && stored!.message_count >= older.length;
  const shouldCompact = older.length > 0 && (storedUsable || overBudget || input.force === true);

  if (!shouldCompact) {
    const kept = all
      .slice(-MAX_RAW_MESSAGES)
      .map(toAgentMessage)
      .filter((m) => m.content.trim().length > 0);
    return { messages: kept, compacted: false, digestCreated: false, olderMessages: 0, savedTokens: 0 };
  }

  const reuse = storedUsable && stored!.message_count === older.length;
  const digest = reuse ? stored!.summary : buildDigest(older);
  if (!reuse) {
    try {
      input.db.addContextDigest(input.sessionId, digest, older.length);
    } catch {
      /* the digest is an optimisation, never a hard requirement */
    }
  }

  const digestMessage: AgentMessage = {
    role: "user",
    content: `[Earlier conversation, compacted]\n${digest}`,
  };
  const messages = [digestMessage, ...recent];
  const compactedTokens = estimateTokens(
    input.system + messages.map((m) => m.content).join("\n"),
  );

  return {
    messages,
    compacted: true,
    digest,
    digestCreated: !reuse,
    olderMessages: older.length,
    savedTokens: Math.max(0, rawTokens - compactedTokens),
  };
}
