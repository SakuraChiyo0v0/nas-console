import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api, type ExecResult } from "../api";

/** 简易行终端：回车执行一条命令（无 PTY 会话；cwd 由前端维护，服务端每次 exec 前 cd） */
export function TerminalView() {
  const holderRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const cwdRef = useRef("/");
  const lineRef = useRef("");
  const busyRef = useRef(false);
  const [cwd, setCwd] = useState("/");

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      fontSize: 13,
      theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (holderRef.current) term.open(holderRef.current);
    fit.fit();
    termRef.current = term;

    const prompt = () => term.write(`\r\n\x1b[1;32m[${cwdRef.current}]\x1b[0m $ `);

    term.onData((data) => {
      if (busyRef.current) return;
      if (data === "\r") {
        const cmd = lineRef.current.trim();
        lineRef.current = "";
        term.write("\r\n");
        if (cmd) void runCommand(cmd);
        else prompt();
        return;
      }
      if (data === "\x7f" || data === "\b") {
        if (lineRef.current.length) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }
      if (data === "\x03") {
        lineRef.current = "";
        term.write("^C");
        prompt();
        return;
      }
      if (data.length === 1 && data >= " ") {
        lineRef.current += data;
        term.write(data);
      }
    });

    const resize = () => fit.fit();
    window.addEventListener("resize", resize);
    prompt();
    term.focus();

    async function runCommand(cmd: string) {
      const t = termRef.current!;
      busyRef.current = true;
      // cd 特殊处理：服务端 shell 无状态，需用 cd && pwd 拿新目录
      const cdMatch = cmd.match(/^cd\s+(\S+)/);
      const payload = cdMatch
        ? { cmd: `cd ${JSON.stringify(cdMatch[1])} && pwd`, timeout: 10000 }
        : { cmd, cwd: cwdRef.current, timeout: 30000 };
      try {
        const res = await api<ExecResult>("/api/exec", { method: "POST", body: JSON.stringify(payload) });
        if (res.stdout) t.write(res.stdout.replace(/\n/g, "\r\n"));
        if (res.stderr) t.write(`\x1b[31m${res.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
        if (res.timedOut) t.write("\x1b[33m（命令超时已终止）\x1b[0m");
        if (cdMatch) {
          const newCwd = res.stdout.trim();
          if (res.exitCode === 0 && newCwd) {
            cwdRef.current = newCwd;
            setCwd(newCwd);
          } else {
            t.write(`\x1b[31mcd: 目录不存在或无权访问\x1b[0m`);
          }
        }
        if (res.exitCode !== 0) t.write(`\x1b[31m\r\n[退出码 ${res.exitCode ?? "?"}]（耗时 ${res.durationMs}ms）\x1b[0m`);
      } catch (err) {
        t.write(`\x1b[31m\r\n${err instanceof Error ? err.message : "执行失败"}\x1b[0m`);
      } finally {
        busyRef.current = false;
        prompt();
        term.focus();
      }
    }

    return () => {
      window.removeEventListener("resize", resize);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="terminal-holder"><div ref={holderRef} style={{ height: "100%" }} /></div>;
}