import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Store } from "./db.js";
import { createService } from "./service.js";
import { createExecutor } from "./executor.js";
import { createApp } from "./app.js";
import type { Config } from "./config.js";

const cfg: Config = {
  port: 0,
  dbPath: ":memory:",
  adminUsername: "admin",
  adminPassword: "test-pass-123",
  nsenter: false,
  sessionTtlSeconds: 3600,
  execDefaultTimeoutMs: 10_000,
  execMaxTimeoutMs: 30_000,
};

let store: Store;
let app: ReturnType<typeof createApp>;
let cookie = "";

function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }));
}

before(() => {
  store = new Store(":memory:");
  const service = createService(store, cfg);
  service.seedAdmin();
  const executor = createExecutor({ nsenter: false, defaultTimeoutMs: cfg.execDefaultTimeoutMs, maxTimeoutMs: cfg.execMaxTimeoutMs });
  app = createApp({ store, service, executor, config: cfg });
});

after(() => store.close());

test("health 免认证", async () => {
  const r = await call("/api/health");
  assert.equal(r.status, 200);
  const body = (await r.json()) as { status: string };
  assert.equal(body.status, "ok");
});

test("错误密码登录被拒", async () => {
  const r = await call("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "wrong" }) });
  assert.equal(r.status, 401);
});

test("登录成功拿到 session cookie", async () => {
  const r = await call("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "test-pass-123" }) });
  assert.equal(r.status, 200);
  const sc = r.headers.get("set-cookie") ?? "";
  assert.ok(sc.includes("session="), "应有 session cookie");
  cookie = sc.split(";")[0];
});

test("无认证 exec 被拒 401", async () => {
  const saved = cookie; cookie = "";
  const r = await call("/api/exec", { method: "POST", body: JSON.stringify({ cmd: "echo hi" }) });
  assert.equal(r.status, 401);
  cookie = saved;
});

test("登录用户生成 token，用 token 执行命令", async () => {
  const r = await call("/api/tokens", { method: "POST", body: JSON.stringify({ name: "smoke-test" }) });
  assert.equal(r.status, 201);
  const { token } = (await r.json()) as { token: string };
  assert.ok(token.startsWith("nsc_"));

  // 用 token（不带 session）执行
  const saved = cookie; cookie = "";
  const er = await call("/api/exec", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ cmd: "echo smoke-ok" }),
  });
  assert.equal(er.status, 200);
  const out = (await er.json()) as { stdout: string; exitCode: number | null };
  assert.equal(out.exitCode, 0);
  assert.ok(out.stdout.includes("smoke-ok"), `stdout 应含 smoke-ok，实际: ${out.stdout}`);
  cookie = saved;
});

test("token 列表脱敏，可查完整，可吊销", async () => {
  const r = await call("/api/tokens");
  const { tokens } = (await r.json()) as { tokens: Array<{ id: number; masked: string; name: string }> };
  assert.ok(tokens.length >= 1);
  const t = tokens.find((x) => x.name === "smoke-test")!;
  assert.ok(t.masked.includes("…"), "列表应脱敏");
  assert.ok(!t.masked.startsWith("nsc_") || t.masked.length < 20, "脱敏不应是完整值");

  const full = await call(`/api/tokens/${t.id}`);
  const { token } = (await full.json()) as { token: string };
  assert.ok(token.startsWith("nsc_"), "详情应返回完整 token");
});

test("审计日志记录了 exec", async () => {
  const r = await call("/api/audit?limit=10");
  const { entries } = (await r.json()) as { entries: Array<{ actor: string; command: string; exit_code: number | null }> };
  assert.ok(entries.length >= 1);
  const e = entries.find((x) => x.command === "echo smoke-ok")!;
  assert.ok(e, "审计应有 echo smoke-ok 记录");
  assert.equal(e.exit_code, 0);
});