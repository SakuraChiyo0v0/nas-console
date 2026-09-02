import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

/**
 * 交互式终端：WebSocket 直连 /api/tty（PTY 会话）。
 * 同源 WS 自动携带登录 cookie；也支持 ?token= 查询参数（服务端两者皆可）。
 */
export function TerminalView() {
  const holderRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      fontSize: 13,
      theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (holderRef.current) term.open(holderRef.current);
    fit.fit();
    termRef.current = term;
    term.focus();

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/tty`);
      wsRef.current = ws;
      ws.onopen = () => {
        term.writeln("\x1b[32m[已连接到 NAS 终端]\x1b[0m");
        term.focus();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") term.write(ev.data);
        else if (ev.data instanceof Blob) {
          void ev.data.text().then((t) => term.write(t));
        }
      };
      ws.onclose = () => {
        if (closedRef.current) return;
        term.writeln("\r\n\x1b[33m[连接断开，2 秒后重连…]\x1b[0m");
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    }

    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const onResize = () => {
      fit.fit();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener("resize", onResize);

    connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("resize", onResize);
      wsRef.current?.close();
      term.dispose();
    };
  }, []);

  return <div className="terminal-holder"><div ref={holderRef} style={{ height: "100%" }} /></div>;
}
