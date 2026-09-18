/*
 * One-command local run:  npm start  →  http://localhost:3000
 * Serves the web app (which runs the agent in the browser) and, when an
 * Anthropic API key is configured, the optional Claude tool-use agent at POST /api/ask.
 * Zero dependencies are needed for the core agent.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const claude = require("./src/llm/claude-agent.js");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
const PUBLIC = ["index.html", "web/", "src/engine/", "data/", "docs/"];

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json", "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function llmAvailable() {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return hasKey && !!(await claude.loadSdk());
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/health") return send(res, 200, { ok: true, llm: await llmAvailable(), model: claude.MODEL });
    if (url.pathname === "/api/ask" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 64 * 1024) return send(res, 413, { error: "Request too large" }); }
      const { question, asOf, history } = JSON.parse(raw || "{}");
      if (!question || typeof question !== "string") return send(res, 400, { error: "question is required" });
      if (!(await llmAvailable())) return send(res, 503, { error: "Claude mode is not configured (set ANTHROPIC_API_KEY and run npm install)." });
      const out = await claude.ask({ question: question.slice(0, 2000), asOf, history: Array.isArray(history) ? history : [] });
      return send(res, 200, out);
    }
    // static files (allow-listed folders only)
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !PUBLIC.some((p) => rel === p || rel.startsWith(p))) return send(res, 404, "Not found", "text/plain");
    fs.readFile(file, (err, data) => err ? send(res, 404, "Not found", "text/plain") : send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream"));
  } catch (e) {
    const status = e.status || 500;
    send(res, status >= 400 && status < 600 ? status : 500, { error: e.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Executive Productivity Agent running at http://localhost:${PORT}\n`);
  llmAvailable().then((ok) => console.log(ok ? `  Claude mode: ON (${claude.MODEL})\n` : "  Claude mode: off — offline agent only (set ANTHROPIC_API_KEY + npm install to enable)\n"));
});
