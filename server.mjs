#!/usr/bin/env node
/**
 * Optional one-command self-host server for Taskmarket Pulse.
 * Serves docs/ statically with Cache-Control >= 60s and refreshes docs/data/snapshot.json
 * server-side every 30 minutes (zero client requests to api.taskmarket.dev).
 * Usage: PORT=8088 node server.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "docs");
const PORT = Number(process.env.PORT || 8088);
const REFRESH_MS = Number(process.env.REFRESH_MS || 30 * 60 * 1000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
};

function runRefresh() {
  const child = spawn(process.execPath, [path.join(__dirname, "scripts", "fetch_snapshot.mjs")], {
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    if (code === 0) console.log("[server] snapshot refreshed");
    else console.error(`[server] refresh exited ${code}`);
  });
}

if (!fs.existsSync(path.join(DOCS_DIR, "data", "snapshot.json"))) {
  runRefresh();
}
setInterval(runRefresh, REFRESH_MS).unref();

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const full = path.normalize(path.join(DOCS_DIR, rel));
  if (!full.startsWith(DOCS_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".json" ? "public, max-age=120" : "public, max-age=600",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Taskmarket Pulse live at http://localhost:${PORT} (server-side refresh every ${REFRESH_MS / 60000}m)`);
});
