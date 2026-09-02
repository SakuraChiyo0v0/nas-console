import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { Context, Next } from "hono";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export function staticHandler(webDir: string) {
  const root = normalize(webDir);
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (path.startsWith("/api")) return next();
    const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) return c.text("forbidden", 403);
    try {
      const buf = await readFile(file);
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      c.header("Content-Type", MIME[ext] ?? "application/octet-stream");
      return c.body(new Uint8Array(buf));
    } catch {
      try {
        const idx = await readFile(join(root, "index.html"));
        c.header("Content-Type", MIME[".html"]);
        return c.body(new Uint8Array(idx));
      } catch {
        return c.text("web not built", 404);
      }
    }
  };
}
