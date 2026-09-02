import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Store } from "../db.js";
import type { Service } from "../service.js";
import type { Executor } from "../executor.js";
import type { Config } from "../config.js";
import type { AppVariables } from "../context.js";
import { requireAuth, requireUser } from "../middleware.js";
import { maskToken } from "../crypto.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 从 package.json 读版本（运行时在容器 /app，dist 在 /app/dist/server/src/routes） */
function readVersion(): string {
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const pkg = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "dev";
  } catch {
    return "dev";
  }
}
const APP_VERSION = readVersion();

export type ApiDeps = { store: Store; service: Service; executor: Executor; config: Config };

/** 简易登录防爆破：内存计数，每 IP 窗口内超限返回 429 */
function createLoginLimiter(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(ip: string): boolean {
      const now = Date.now();
      const rec = hits.get(ip);
      if (!rec || now > rec.resetAt) {
        hits.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
      }
      rec.count += 1;
      return rec.count <= max;
    },
  };
}

export function registerApi(app: Hono<{ Variables: AppVariables }>, deps: ApiDeps): void {
  const { service, executor, config } = deps;
  const limiter = createLoginLimiter(60_000, 10);

  // 注入依赖
  app.use("*", async (c, next) => {
    c.set("service", service);
    c.set("executor", executor);
    c.set("config", config);
    c.set("remoteIp", c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    await next();
  });

  const api = new Hono<{ Variables: AppVariables }>();

  api.get("/health", (c) => c.json({ status: "ok", app: "nas-console", version: APP_VERSION }));

  // ---- 登录 / 登出 / 当前身份 ----
  api.post("/login", async (c) => {
    const ip = c.get("remoteIp") ?? "unknown";
    if (!limiter.check(ip)) {
      return c.json({ error: "尝试过于频繁，请稍后再试" }, 429);
    }
    const body = await c.req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password) return c.json({ error: "用户名和密码必填" }, 400);
    const r = service.login(username, password);
    if (!r.ok) return c.json({ error: r.message }, 401);
    setCookie(c, "session", r.sessionId, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });
    return c.json({ ok: true, user: { id: r.user.id, username: r.user.username } });
  });

  api.post("/logout", async (c) => {
    const cookie = c.req.header("cookie") ?? "";
    const sessionId = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("session="))?.slice("session=".length);
    if (sessionId) service.deleteSession(sessionId);
    deleteCookie(c, "session");
    return c.json({ ok: true });
  });

  api.get("/me", requireAuth, (c) => {
    const auth = c.get("auth")!;
    return c.json(
      auth.kind === "user"
        ? { kind: "user", username: auth.user.username }
        : { kind: "token", name: auth.token.name }
    );
  });

  // ---- 命令执行（token 或 session 均可） ----
  api.post("/exec", requireAuth, async (c) => {
    const auth = c.get("auth")!;
    const body = await c.req.json().catch(() => null);
    const cmd = typeof body?.cmd === "string" ? body.cmd.trim() : "";
    if (!cmd) return c.json({ error: "cmd 不能为空" }, 400);
    if (cmd.length > 20_000) return c.json({ error: "cmd 过长（上限 20000 字符）" }, 400);
    const cwd = typeof body?.cwd === "string" && body.cwd.trim() ? body.cwd.trim() : undefined;
    const timeoutMs = typeof body?.timeout === "number" && Number.isFinite(body.timeout) ? body.timeout : config.execDefaultTimeoutMs;
    const actor = auth.kind === "user" ? `user:${auth.user.username}` : `token:${maskToken(auth.token.token)}`;
    const result = await executor.run(cmd, { cwd, timeoutMs });
    service.addAudit(actor, cmd, result.exitCode, result.durationMs, c.get("remoteIp") ?? null);
    return c.json({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    });
  });

  // ---- Token 管理（仅登录用户） ----
  api.post("/tokens", requireUser, async (c) => {
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : "default";
    const created = service.createToken(name);
    return c.json({ id: created.id, name: created.name, token: created.plain, createdAt: created.created_at }, 201);
  });

  api.get("/tokens", requireUser, (c) => {
    const rows = service.listTokens();
    return c.json({
      tokens: rows.map((r) => ({
        id: r.id,
        name: r.name,
        masked: maskToken(r.token),
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
        revoked: r.revoked === 1,
      })),
    });
  });

  api.get("/tokens/:id", requireUser, (c) => {
    const id = Number(c.req.param("id"));
    const row = service.getTokenById(id);
    if (!row) return c.json({ error: "token 不存在" }, 404);
    return c.json({ id: row.id, name: row.name, token: row.token, createdAt: row.created_at, revoked: row.revoked === 1 });
  });

  api.delete("/tokens/:id", requireUser, (c) => {
    const id = Number(c.req.param("id"));
    const row = service.getTokenById(id);
    if (!row) return c.json({ error: "token 不存在" }, 404);
    service.revokeToken(id);
    return c.json({ ok: true });
  });

  // ---- 审计（仅登录用户） ----
  api.get("/audit", requireUser, (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100), 1), 500);
    return c.json({ entries: service.listAudit(limit) });
  });

  app.route("/api", api);
}