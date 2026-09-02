import { loadConfig } from "./config.js";
import { Store } from "./db.js";
import { createService } from "./service.js";
import { createExecutor } from "./executor.js";
import { createApp } from "./app.js";
import { serveHono } from "./server.js";

const cfg = loadConfig();
const store = new Store(cfg.dbPath);
const service = createService(store, cfg);
service.seedAdmin();
const executor = createExecutor({ nsenter: cfg.nsenter, defaultTimeoutMs: cfg.execDefaultTimeoutMs, maxTimeoutMs: cfg.execMaxTimeoutMs });
const app = createApp({ store, service, executor, config: cfg });

serveHono(app, cfg.port);
// v0.1.0: initial backend
