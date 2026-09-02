import { Hono } from "hono";
import type { Store } from "./db.js";
import type { Service } from "./service.js";
import type { Executor } from "./executor.js";
import type { Config } from "./config.js";
import type { AppVariables } from "./context.js";
import { registerApi } from "./routes/api.js";

export type AppDeps = { store: Store; service: Service; executor: Executor; config: Config };

export function createApp(deps: AppDeps): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();
  registerApi(app, deps);
  app.notFound((c) => c.json({ error: "Not Found" }, 404));
  return app;
}