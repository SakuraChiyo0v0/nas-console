import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** nas-console 数据库：账号 / 会话 / API Token / 审计日志 */
export class Store {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL,
        command TEXT NOT NULL,
        exit_code INTEGER,
        duration_ms INTEGER,
        remote_ip TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
    `);
  }

  close(): void {
    this.db.close();
  }
}

export type UserRow = { id: number; username: string; password_hash: string };
export type TokenRow = { id: number; name: string; token: string; created_at: string; last_used_at: string | null; revoked: number };
export type AuditRow = { id: number; ts: string; actor: string; command: string; exit_code: number | null; duration_ms: number | null; remote_ip: string | null };