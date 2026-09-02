import type { Context, Next } from "hono";
import type { AppVariables, AuthCtx } from "./context.js";
import type { Service } from "./service.js";

/** 通用请求形状（HTTP 中间件与 WebSocket upgrade 共用） */
export type RequestLike = {
  headers: { authorization?: string; cookie?: string };
  url?: string;
};

function cookieValue(cookie: string | undefined, name: string): string | undefined {
  return cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}

/** 从请求解析认证：Bearer token / session cookie / ?token= 查询参数（WS 用） */
export function authenticate(req: RequestLike, svc: Service): AuthCtx | null {
  const authHeader = req.headers.authorization ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const plain = authHeader.slice(7).trim();
    if (plain) {
      const token = svc.findValidToken(plain);
      if (token) return { kind: "token", token };
    }
    return null;
  }
  const sessionId = cookieValue(req.headers.cookie, "session");
  if (sessionId) {
    const user = svc.getUserBySession(sessionId);
    if (user) return { kind: "user", user };
  }
  if (req.url) {
    try {
      const q = new URL(req.url, "http://localhost").searchParams.get("token");
      if (q) {
        const token = svc.findValidToken(q);
        if (token) return { kind: "token", token };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function resolveAuth(c: Context<{ Variables: AppVariables }>): Promise<AuthCtx | null> {
  return authenticate(
    { headers: { authorization: c.req.header("authorization"), cookie: c.req.header("cookie") } },
    c.get("service")!
  );
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
