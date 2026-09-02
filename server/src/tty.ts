import { spawn, type ChildProcess } from "node:child_process";

export type PtySession = {
  proc: ChildProcess;
  /** 写入终端输入 */
  write: (data: string) => void;
  kill: () => void;
};

/**
 * 启动一个交互式 shell 会话（供 /api/tty WebSocket 使用）。
 * - NAS 容器（nsenter=true）：容器内 util-linux `script` 提供 PTY，
 *   nsenter 进宿主 PID1 跑 /bin/bash -i —— 真实交互式宿主终端（cd/vim/top 可用）
 * - 本地 Linux：script 起本地 bash
 * - 本地 Windows：powershell（无 PTY，半交互，仅供开发）
 */
export function createPty(opts: { nsenter: boolean }): PtySession {
  let file: string;
  let args: string[];
  if (opts.nsenter) {
    file = "script";
    args = ["-qfc", "nsenter -t 1 -m -u -i -n -p -- /bin/bash -i", "/dev/null"];
  } else if (process.platform === "win32") {
    file = "powershell.exe";
    args = ["-NoLogo", "-NoExit", "-Command", "-"];
  } else {
    file = "script";
    args = ["-qfc", "/bin/bash -i", "/dev/null"];
  }
  const proc = spawn(file, args, {
    env: { ...process.env, TERM: "xterm-256color", LANG: "C.UTF-8" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    proc,
    write: (data: string) => {
      if (proc.stdin.writable) proc.stdin.write(data);
    },
    kill: () => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 500).unref();
    },
  };
}