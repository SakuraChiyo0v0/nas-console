import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type FetchLike = { fetch: (request: Request) => Promise<Response> | Response };

/** 把 Node req/res 桥接到 Hono 的 fetch 语义（流式 body 收集后转 Request） */
export function serveHono(app: FetchLike, port: number): void {
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
  server.listen(port, () => {
    console.log(`nas-console listening on :${port}`);
  });
}