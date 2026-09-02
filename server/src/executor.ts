import { spawn } from "node:child_process";

export type ExecOptions = {
  /** 工作目录（宿主视角），可选 */
  cwd?: string;
  /** 超时毫秒，超时 kill */
  timeoutMs?: number;
};

export type ExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

/**
 * 执行一条命令。
 * - 容器内（nsenter=true）：nsenter 进宿主 PID 1 命名空间拿宿主 shell
 *   （容器须 privileged + pid:host，见 docs/ugos-nas-ops.md 第 10 节）
 * - 本地开发（nsenter=false）：直接 spawn sh / cmd
 */
export function createExecutor(opts: { nsenter: boolean; defaultTimeoutMs: number; maxTimeoutMs: number }) {
  function buildCommand(cmd: string): { file: string; args: string[] } {
    if (opts.nsenter) {
      return { file: "nsenter", args: ["-t", "1", "-m", "-u", "-i", "-n", "-p", "--", "/bin/sh", "-c", cmd] };
    }
    if (process.platform === "win32") {
      return { file: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", cmd] };
    }
    return { file: "/bin/sh", args: ["-c", cmd] };
  }

  function run(cmd: string, options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve) => {
      const timeoutMs = Math.min(options.timeoutMs ?? opts.defaultTimeoutMs, opts.maxTimeoutMs);
      const { file, args } = buildCommand(cmd);
      const child = spawn(file, args, {
        cwd: options.cwd,
        env: { ...process.env, TERM: "xterm" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const started = Date.now();
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout, stderr: stderr || err.message, durationMs: Date.now() - started, timedOut });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - started, timedOut });
      });
    });
  }

  return { run };
}

export type Executor = ReturnType<typeof createExecutor>;