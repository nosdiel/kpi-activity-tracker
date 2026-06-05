import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import app from "./dist/server/server.js";

const port = Number(process.env.PORT || 8080);
const clientDir = path.resolve("dist/client");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function serveStatic(req, res, pathname) {
  if (!pathname.startsWith("/assets/") && pathname !== "/favicon.ico") {
    return false;
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(clientDir, safePath);

  if (!filePath.startsWith(clientDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", contentTypes[ext] || "application/octet-stream");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host || "localhost"}`;
    const url = new URL(req.url || "/", origin);

    if (await serveStatic(req, res, url.pathname)) return;

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);

    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : Buffer.concat(chunks);

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body,
    });

    const response = await app.fetch(request, process.env, {});

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
