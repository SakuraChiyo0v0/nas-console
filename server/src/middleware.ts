import type { Context, Next } from "hono";
import type { AppVariables, AuthCtx } from "./context.js";

export async function resolveAuth(c: Context<{ Variables: AppVariables }>): Promise<AuthCtx | null> {
  const svc = c.get("service")!;
  const authHeader = c.req.header("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const plain = authHeader.slice(7).trim();
    if (plain) {
      const token = svc.findValidToken(plain);
      if (token) return { kind: "token", token };
    }
    return null;
  }
  const cookie = c.req.header("cookie") ?? "";
  const sessionId = cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="))
    ?.slice("session=".length);
  if (sessionId) {
    const user = svc.getUserBySession(sessionId);
    if (user) return { kind: "user", user };
  }
  return null;
}

export async function requireAuth(c: Context<{ Variables: AppVariables }>, next: Next) {
  const auth = await resolveAuth(c);
  if (!auth) return c.json({ error: "未认证：需要有效的 API Token 或登录会话" }, 401);
  c.set("auth", auth);
  await next();
}

export async function requireUser(c: Context<{ Variables: AppVariables }>, next: Next) {
  const auth = await resolveAuth(c);
  if (!auth || auth.kind !== "user") {
    return c.json({ error: "需要登录用户会话（API Token 无权限执行此操作）" }, 403);
  }
  c.set("auth", auth);
  await next();
}