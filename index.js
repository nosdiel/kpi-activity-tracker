import http from "node:http";
import app from "./dist/server/server.js";

const port = Number(process.env.PORT || 8080);

const server = http.createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host || "localhost"}`;
    const url = new URL(req.url || "/", origin);

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
