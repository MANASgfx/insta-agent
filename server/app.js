"use strict";
const path = require("path");
const fs = require("fs");
const express = require("express");
const { config } = require("./lib/config");
const { ApiError } = require("./lib/errors");
const { loadSession, requireUser } = require("./lib/auth");

const PUBLIC = path.join(__dirname, "..", "public");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1); // Hostinger terminates HTTPS in front of the Node app

  // HTTPS only in production, plus security headers on everything.
  app.use((req, res, next) => {
    if (config.production && !req.secure && req.method === "GET") return res.redirect(301, "https://" + req.headers.host + req.originalUrl);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
      "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
    ].join("; "));
    if (config.production) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  // API: JSON only. Requiring a JSON content type on writes, plus SameSite=Lax cookies, blocks cross-site form posts (CSRF).
  // DELETE carries no body and HTML forms can't send it, so it's exempt.
  const api = express.Router();
  api.use((req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  api.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method) && !req.is("application/json")) return next(new ApiError(415, "bad_request", "Send JSON."));
    next();
  });
  api.use("/ask", express.json({ limit: "25mb" }));
  api.use(express.json({ limit: "1mb" }));
  api.use(loadSession);
  api.get("/health", (req, res) => res.json({ ok: true }));
  api.use("/", require("./routes/auth"));
  api.use("/ask", requireUser, require("./routes/ask"));
  api.use("/admin", require("./routes/admin"));
  api.use("/", requireUser, require("./routes/data"));
  api.use((req, res, next) => next(new ApiError(404, "not_found", "No such API route.")));
  api.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err && err.type === "entity.too.large") err = new ApiError(413, "prompt_too_large", "That request is too large.");
    else if (err && err.type === "entity.parse.failed") err = new ApiError(400, "bad_request", "That wasn't valid JSON.");
    else if (!(err instanceof ApiError)) { console.error("[api]", req.method, req.path, err && err.stack || err); err = new ApiError(500, "server_error", "Something went wrong on the server."); }
    if (res.headersSent) return res.end();
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
  });
  app.use("/api", api);

  // The built frontend (npm run build). Hashed asset names aren't needed: index.html is no-cache, assets revalidate.
  app.use(express.static(PUBLIC, { index: false, maxAge: "1h", setHeaders: (res, p) => { if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); } }));
  app.get("*", (req, res) => {
    const index = path.join(PUBLIC, "index.html");
    if (!fs.existsSync(index)) return res.status(503).type("text").send("The frontend isn't built yet. Run: npm run build");
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  return app;
}

module.exports = { createApp };
