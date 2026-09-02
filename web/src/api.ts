export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 同源 fetch（session cookie 自动携带）；错误统一抛 ApiError */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export type Me =
  | { kind: "user"; username: string }
  | { kind: "token"; name: string };

export type ExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type TokenRow = {
  id: number;
  name: string;
  masked: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
};

export type AuditRow = {
  id: number;
  ts: string;
  actor: string;
  command: string;
  exit_code: number | null;
  duration_ms: number | null;
  remote_ip: string | null;
};