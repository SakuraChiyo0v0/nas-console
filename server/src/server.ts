import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import type { Service } from "./service.js";
import { authenticate } from "./middleware.js";
import { createPty } from "./tty.js";

type FetchLike = { fetch: (request: Request) => Promise<Response> | Response };

export type ServeOptions = {
  service: Service;
  nsenter: boolean;
  /** 最大并发交互终端数 */
  maxPtySessions?: number;
};

/** 把 Node req/res 桥接到 Hono 的 fetch 语义，并在同端口提供 /api/tty WebSocket */
export function serveHono(app: FetchLike, port: number, opts?: ServeOptions): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
        else headers.set(k, v);
      }
      const request = new Request(url, {
        method: req.method ?? "GET",
        headers,
        body: ["GET", "HEAD"].includes((req.method ?? "GET").toUpperCase()) ? undefined : body.length ? body : undefined,
      });
      const response = await app.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "internal error" }));
    }
  });

  if (opts) {
    const wss = new WebSocketServer({ noServer: true });
    let activeSessions = 0;
    const maxSessions = opts.maxPtySessions ?? 4;

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/api/tty") {
        socket.destroy();
        return;
      }
      const auth = authenticate({ headers: req.headers as Record<string, string>, url: req.url ?? "" }, opts.service);
      if (!auth) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      if (activeSessions >= maxSessions) {
        socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        activeSessions += 1;
        const session = createPty({ nsenter: opts.nsenter });
        const send = (d: Buffer | string) => {
          if (ws.readyState === ws.OPEN) ws.send(d.toString());
        };
        session.proc.stdout?.on("data", send);
        session.proc.stderr?.on("data", send);
        session.proc.on("error", () => ws.close());
        session.proc.on("close", () => ws.close());
        ws.on("message", (data) => session.write(data.toString()));
        ws.on("close", () => {
          activeSessions -= 1;
          session.kill();
        });
        ws.on("error", () => {
          activeSessions -= 1;
          session.kill();
        });
      });
    });
  }

  server.listen(port, () => {
    console.log(`nas-console listening on :${port}`);
  });
}
