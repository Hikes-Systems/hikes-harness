import "./quiet.ts";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { DEFAULT_AGENT_ID, isAgentId } from "../shared/agents.ts";
import type {
  Msg,
  Session,
  SessionSummary,
} from "../shared/protocol.ts";

type SqliteDatabase = import("node:sqlite").DatabaseSync;

// node:sqlite is loaded on demand rather than imported, so the experimental
// warning it prints can be silenced first (see server/quiet.ts).
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

interface SessionRow {
  id: string;
  title: string;
  agent: string;
  created_at: number;
  updated_at: number;
  message_count?: number;
}

export interface MemoryRow {
  id: string;
  scope: string;
  content: string;
  tags: string;
  created_at: number;
}

/** A file as it was before (and after) an agent step changed it. */
export interface FileSnapshot {
  id: string;
  session_id: string;
  step_id: string;
  path: string;
  tool: string;
  before: string;
  after: string;
  /** The file did not exist before the change, so reverting deletes it. */
  before_missing: number;
  created_at: number;
}

export interface ContextDigest {
  id: string;
  session_id: string;
  summary: string;
  message_count: number;
  created_at: number;
}

const now = () => Date.now();

/**
 * Turn a free-text query into a safe FTS5 MATCH expression.
 *
 * Every word becomes a quoted prefix term joined with OR, so a memory is
 * found when it contains any of the words, and a half-typed word still
 * matches. Quoting also means punctuation in the query can never be read as
 * FTS5 syntax.
 */
function ftsQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1)
    .slice(0, 12);
  if (!tokens.length) return "";
  return tokens.map((token) => `"${token}"*`).join(" OR ");
}

export class Db {
  private db: SqliteDatabase;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // WAL keeps readers and a writer from blocking each other, and NORMAL is
    // the safe companion to it: a power loss can lose the tail of the log, a
    // process crash cannot.
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.checkIntegrity();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        agent TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        content,
        tags,
        tokenize = "unicode61 remove_diacritics 2"
      );
      CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
        INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
        DELETE FROM memory_fts WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
        DELETE FROM memory_fts WHERE rowid = old.rowid;
        INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
      END;
      CREATE TABLE IF NOT EXISTS file_snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        path TEXT NOT NULL,
        tool TEXT NOT NULL,
        before TEXT NOT NULL,
        after TEXT NOT NULL,
        before_missing INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_session ON file_snapshots(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_snapshots_step ON file_snapshots(session_id, step_id);
      CREATE TABLE IF NOT EXISTS context_digests (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_digests_session ON context_digests(session_id, created_at DESC);
    `);
    // Memories saved before the full-text index existed still need to be
    // searchable, so anything missing from the index is copied in once.
    this.db
      .prepare(
        `INSERT INTO memory_fts(rowid, content, tags)
         SELECT rowid, content, tags FROM memories
         WHERE rowid NOT IN (SELECT rowid FROM memory_fts)`,
      )
      .run();
  }

  /**
   * Log (without failing) when the file is damaged.
   *
   * A corrupt database would surface as nonsense errors later, so it is
   * worth saying plainly at start-up. `quick_check` is the cheap version.
   */
  private checkIntegrity(): void {
    try {
      const row = this.db.prepare("PRAGMA quick_check").get() as { quick_check?: string } | undefined;
      if (row?.quick_check && row.quick_check !== "ok") {
        console.error(`[hikes] database check reported: ${row.quick_check}`);
      }
    } catch (error) {
      console.error(
        `[hikes] database check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  close(): void {
    try {
      // Fold the WAL back and refresh the planner statistics gathered so the
      // next start opens on a tidied file.
      this.db.exec("PRAGMA optimize;");
    } catch {
      /* the file is going away anyway */
    }
    this.db.close();
  }

  sessionCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    return row.n;
  }

  listSessions(): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.title, s.agent, s.updated_at,
                (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
         FROM sessions s
         ORDER BY s.updated_at DESC`,
      )
      .all() as unknown as SessionRow[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      agent: r.agent,
      updatedAt: r.updated_at,
      messageCount: Number(r.message_count ?? 0),
    }));
  }

  getSession(id: string): Session | null {
    const row = this.db
      .prepare("SELECT id, title, agent, updated_at FROM sessions WHERE id = ?")
      .get(id) as unknown as SessionRow | undefined;
    if (!row) return null;
    const messages = this.db
      .prepare("SELECT data FROM messages WHERE session_id = ? ORDER BY seq ASC")
      .all(id) as unknown as { data: string }[];
    return {
      id: row.id,
      title: row.title,
      agent: row.agent,
      updatedAt: row.updated_at,
      messages: messages.map((m) => JSON.parse(m.data) as Msg),
    };
  }

  createSession(agent = DEFAULT_AGENT_ID): Session {
    const ts = now();
    const session: Session = {
      id: crypto.randomUUID(),
      title: "New session",
      agent: isAgentId(agent) ? agent : DEFAULT_AGENT_ID,
      updatedAt: ts,
      messages: [],
    };
    this.db
      .prepare(
        "INSERT INTO sessions (id, title, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(session.id, session.title, session.agent, ts, ts);
    return session;
  }

  updateSession(id: string, patch: { title?: string; agent?: string }): SessionSummary | null {
    const row = this.db
      .prepare("SELECT id, title, agent, updated_at FROM sessions WHERE id = ?")
      .get(id) as unknown as SessionRow | undefined;
    if (!row) return null;
    const title = patch.title?.trim() || row.title;
    const agent = patch.agent?.trim()
      ? isAgentId(patch.agent.trim())
        ? patch.agent.trim()
        : DEFAULT_AGENT_ID
      : row.agent;
    this.db
      .prepare("UPDATE sessions SET title = ?, agent = ?, updated_at = ? WHERE id = ?")
      .run(title, agent, now(), id);
    return {
      id,
      title,
      agent,
      updatedAt: now(),
      messageCount: this.messageCount(id),
    };
  }

  deleteSession(id: string): void {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM file_snapshots WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM context_digests WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  messageCount(sessionId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?")
      .get(sessionId) as unknown as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  private nextSeq(sessionId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE session_id = ?")
      .get(sessionId) as unknown as { seq: number };
    return Number(row.seq);
  }

  addMessage(sessionId: string, message: Msg): Msg {
    const ts = now();
    const msg: Msg = { ...message, createdAt: message.createdAt ?? ts };
    this.db
      .prepare("INSERT INTO messages (id, session_id, seq, data, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(msg.id, sessionId, this.nextSeq(sessionId), JSON.stringify(msg), ts);
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(ts, sessionId);
    if (msg.role === "user") {
      const row = this.db
        .prepare("SELECT title FROM sessions WHERE id = ?")
        .get(sessionId) as unknown as { title: string } | undefined;
      if (row && row.title === "New session") {
        const title = (msg.text || msg.files?.[0] || "New session").replace(/\s+/g, " ").trim().slice(0, 60);
        this.db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title || "New session", sessionId);
      }
    }
    return msg;
  }

  getMessage(sessionId: string, messageId: string): Msg | null {
    const row = this.db
      .prepare("SELECT data FROM messages WHERE session_id = ? AND id = ?")
      .get(sessionId, messageId) as unknown as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Msg) : null;
  }

  deleteMessagesFrom(sessionId: string, messageId: string): number {
    const row = this.db
      .prepare("SELECT seq FROM messages WHERE session_id = ? AND id = ?")
      .get(sessionId, messageId) as unknown as { seq: number } | undefined;
    if (!row) return 0;
    const before = this.messageCount(sessionId);
    this.db
      .prepare("DELETE FROM messages WHERE session_id = ? AND seq >= ?")
      .run(sessionId, row.seq);
    return before - this.messageCount(sessionId);
  }

  /* ───────────── file snapshots ───────────── */

  addFileSnapshot(input: {
    sessionId: string;
    stepId: string;
    path: string;
    tool: string;
    before: string;
    after: string;
    beforeMissing?: boolean;
  }): FileSnapshot {
    const row: FileSnapshot = {
      id: crypto.randomUUID(),
      session_id: input.sessionId,
      step_id: input.stepId,
      path: input.path,
      tool: input.tool,
      before: input.before,
      after: input.after,
      before_missing: input.beforeMissing ? 1 : 0,
      created_at: now(),
    };
    this.db
      .prepare(
        `INSERT INTO file_snapshots (id, session_id, step_id, path, tool, before, after, before_missing, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.session_id,
        row.step_id,
        row.path,
        row.tool,
        row.before,
        row.after,
        row.before_missing,
        row.created_at,
      );
    return row;
  }

  listFileSnapshots(sessionId: string, stepId?: string): FileSnapshot[] {
    const rows = stepId
      ? (this.db
          .prepare(
            "SELECT * FROM file_snapshots WHERE session_id = ? AND step_id = ? ORDER BY created_at ASC",
          )
          .all(sessionId, stepId) as unknown as FileSnapshot[])
      : (this.db
          .prepare("SELECT * FROM file_snapshots WHERE session_id = ? ORDER BY created_at ASC")
          .all(sessionId) as unknown as FileSnapshot[]);
    return rows;
  }

  getFileSnapshot(id: string): FileSnapshot | null {
    const row = this.db
      .prepare("SELECT * FROM file_snapshots WHERE id = ?")
      .get(id) as unknown as FileSnapshot | undefined;
    return row ?? null;
  }

  deleteFileSnapshots(sessionId: string, stepId: string): number {
    const result = this.db
      .prepare("DELETE FROM file_snapshots WHERE session_id = ? AND step_id = ?")
      .run(sessionId, stepId);
    return Number(result.changes ?? 0);
  }

  /* ───────────── context digests ───────────── */

  addContextDigest(sessionId: string, summary: string, messageCount: number): ContextDigest {
    const row: ContextDigest = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      summary,
      message_count: messageCount,
      created_at: now(),
    };
    this.db
      .prepare(
        "INSERT INTO context_digests (id, session_id, summary, message_count, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(row.id, row.session_id, row.summary, row.message_count, row.created_at);
    return row;
  }

  latestContextDigest(sessionId: string): ContextDigest | null {
    const row = this.db
      .prepare(
        "SELECT * FROM context_digests WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(sessionId) as unknown as ContextDigest | undefined;
    return row ?? null;
  }

  /* ───────────── memory ───────────── */

  memoryCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM memories").get() as unknown as { n: number };
    return Number(row.n);
  }

  addMemory(scope: string, content: string, tags: string[] = []): MemoryRow {
    const row: MemoryRow = {
      id: crypto.randomUUID(),
      scope,
      content,
      tags: tags.join(","),
      created_at: now(),
    };
    this.db
      .prepare("INSERT INTO memories (id, scope, content, tags, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(row.id, row.scope, row.content, row.tags, row.created_at);
    return row;
  }

  listMemories(limit = 50): MemoryRow[] {
    return this.db
      .prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?")
      .all(limit) as unknown as MemoryRow[];
  }

  /**
   * Hybrid memory search.
   *
   * FTS5 with BM25 ranking finds the memories whose words actually match,
   * even when the phrasing differs; a LIKE pass afterwards catches partial
   * words, punctuation and tags that the tokenizer drops. BM25 hits come
   * first because they are the better matches.
   */
  searchMemories(query: string, limit = 5): MemoryRow[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const seen = new Set<string>();
    const rows: MemoryRow[] = [];

    const match = ftsQuery(trimmed);
    if (match) {
      try {
        const ranked = this.db
          .prepare(
            `SELECT memories.* FROM memory_fts
             JOIN memories ON memories.rowid = memory_fts.rowid
             WHERE memory_fts MATCH ? ORDER BY bm25(memory_fts) LIMIT ?`,
          )
          .all(match, limit * 3) as unknown as MemoryRow[];
        for (const row of ranked) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          rows.push(row);
        }
      } catch {
        // A query FTS5 cannot parse must never break recall; the LIKE pass
        // below still returns something useful.
      }
    }

    const like = `%${trimmed}%`;
    const fuzzy = this.db
      .prepare(
        "SELECT * FROM memories WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(like, like, limit * 3) as unknown as MemoryRow[];
    for (const row of fuzzy) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    return rows.slice(0, limit);
  }

  deleteMemory(id: string): void {
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  }
}
