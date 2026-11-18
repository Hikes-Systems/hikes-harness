import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Msg,
  Session,
  SessionSummary,
} from "../shared/protocol.ts";

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

const now = () => Date.now();

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
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
    `);
  }

  close(): void {
    this.db.close();
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

  createSession(agent = "ridge"): Session {
    const ts = now();
    const session: Session = {
      id: crypto.randomUUID(),
      title: "New session",
      agent,
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
    const agent = patch.agent?.trim() || row.agent;
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

  searchMemories(query: string, limit = 5): MemoryRow[] {
    const q = `%${query.trim()}%`;
    return this.db
      .prepare("SELECT * FROM memories WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?")
      .all(q, q, limit) as unknown as MemoryRow[];
  }

  deleteMemory(id: string): void {
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  }
}
