/** 环境变量配置：全部有安全默认值，部署时通过容器环境注入 */
export type Config = {
  port: number;
  dbPath: string;
  adminUsername: string;
  adminPassword: string;
  /** 容器内（NAS）为 true 时走 nsenter 进宿主 shell；本地开发为 false 直接 spawn sh */
  nsenter: boolean;
  sessionTtlSeconds: number;
  execDefaultTimeoutMs: number;
  execMaxTimeoutMs: number;
  webDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8890);
  const adminUsername = env.NAS_CONSOLE_USERNAME?.trim() || "admin";
  const adminPassword = env.NAS_CONSOLE_PASSWORD || "change-me";
  const dbPath = env.NAS_CONSOLE_DB || "./data/nas-console.db";
  const nsenter = env.NAS_CONSOLE_NSENTER === "1" || env.NAS_CONSOLE_NSENTER === "true";
  const sessionTtlSeconds = Number(env.SESSION_TTL_SECONDS ?? 86400);
  return {
    port,
    dbPath,
    adminUsername,
    adminPassword,
    nsenter,
    sessionTtlSeconds,
    execDefaultTimeoutMs: Number(env.EXEC_DEFAULT_TIMEOUT_MS ?? 30_000),
    execMaxTimeoutMs: Number(env.EXEC_MAX_TIMEOUT_MS ?? 300_000),
    webDir: env.NAS_CONSOLE_WEB_DIR || "./web",
  };
}