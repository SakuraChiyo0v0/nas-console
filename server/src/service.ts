import type { Store, UserRow, TokenRow } from "./db.js";
import { hashPassword, verifyPassword, randomToken, randomId } from "./crypto.js";
import type { Config } from "./config.js";

/** 业务数据访问层：账号 / 会话 / Token / 审计 */
export function createService(store: Store, cfg: Config) {
  /** 首次启动 seed 管理员账号（env 指定），已存在则跳过 */
  function seedAdmin(): void {
    const existing = store.db.prepare("SELECT id FROM users WHERE username = ?").get(cfg.adminUsername) as UserRow | undefined;
    if (!existing) {
      store.db
        .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
        .run(cfg.adminUsername, hashPassword(cfg.adminPassword));
    }
  }

  function findUserByUsername(username: string): UserRow | undefined {
    return store.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  }

  function findUserById(id: number): UserRow | undefined {
    return store.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  }

  /** 登录成功则创建会话并返回会话 id */
  function login(username: string, password: string): { ok: true; sessionId: string; user: UserRow } | { ok: false; message: string } {
    const user = findUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return { ok: false, message: "用户名或密码错误" };
    }
    const sessionId = randomId();
    const expires = new Date(Date.now() + cfg.sessionTtlSeconds * 1000).toISOString();
    store.db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, user.id, expires);
    return { ok: true, sessionId, user };
  }

  function getUserBySession(sessionId: string): UserRow | undefined {
    const row = store.db
      .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime('now')")
      .get(sessionId) as UserRow | undefined;
    return row;
  }

  function deleteSession(sessionId: string): void {
    store.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  /** 生成 API Token（明文入库，可再查——有意取舍，见设计文档） */
  function createToken(name: string): TokenRow & { plain: string } {
    const plain = randomToken("nsc_");
    const info = store.db.prepare("INSERT INTO tokens (name, token) VALUES (?, ?)").run(name, plain);
    const row = store.db.prepare("SELECT * FROM tokens WHERE id = ?").get(Number(info.lastInsertRowid)) as TokenRow;
    return { ...row, plain };
  }

  function listTokens(): TokenRow[] {
    return store.db.prepare("SELECT * FROM tokens ORDER BY id").all() as TokenRow[];
  }

  function getTokenById(id: number): TokenRow | undefined {
    return store.db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as TokenRow | undefined;
  }

  function revokeToken(id: number): void {
    store.db.prepare("UPDATE tokens SET revoked = 1 WHERE id = ?").run(id);
  }

  /** 用明文 token 找有效（未吊销）记录，并更新 last_used_at */
  function findValidToken(plain: string): TokenRow | undefined {
    const row = store.db.prepare("SELECT * FROM tokens WHERE token = ? AND revoked = 0").get(plain) as TokenRow | undefined;
    if (row) {
      store.db.prepare("UPDATE tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
    }
    return row;
  }

  function addAudit(actor: string, command: string, exitCode: number | null, durationMs: number | null, remoteIp: string | null): void {
    store.db
      .prepare("INSERT INTO audit (actor, command, exit_code, duration_ms, remote_ip) VALUES (?, ?, ?, ?, ?)")
      .run(actor, command, exitCode, durationMs, remoteIp);
  }

  function listAudit(limit = 100): Array<{ id: number; ts: string; actor: string; command: string; exit_code: number | null; duration_ms: number | null; remote_ip: string | null }> {
    return store.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit) as Array<{
      id: number; ts: string; actor: string; command: string; exit_code: number | null; duration_ms: number | null; remote_ip: string | null;
    }>;
  }

  return { seedAdmin, login, getUserBySession, deleteSession, createToken, listTokens, getTokenById, revokeToken, findValidToken, addAudit, listAudit, findUserById };
}

export type Service = ReturnType<typeof createService>;