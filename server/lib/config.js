"use strict";
// All settings come from environment variables (hPanel › Node.js app › Environment variables, or .env locally).
const env = process.env;
const int = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

const config = {
  port: int(env.PORT, 3000),
  production: env.NODE_ENV === "production",
  anthropicKey: env.ANTHROPIC_API_KEY || "",
  anthropicBaseUrl: env.ANTHROPIC_BASE_URL || undefined, // tests point this at a local fake
  model: env.CLAUDE_MODEL || "claude-sonnet-5-5",
  effort: env.CLAUDE_EFFORT || "", // low | medium | high; empty = the model's default
  fallbacks: env.CLAUDE_FALLBACKS !== "off",
  maxTokens: int(env.CLAUDE_MAX_TOKENS, 16000),
  db: {
    // Production always means MySQL unless DB_DRIVER says otherwise: a SQLite file on Hostinger would be wiped by the next deploy.
    driver: env.DB_DRIVER || (env.DB_NAME || env.NODE_ENV === "production" ? "mysql" : "sqlite"),
    // Hostinger writes DB_HOST=localhost, which Node can resolve to IPv6 (::1); its MySQL users are granted on 127.0.0.1.
    host: !env.DB_HOST || env.DB_HOST === "localhost" ? "127.0.0.1" : env.DB_HOST,
    port: int(env.DB_PORT, 3306),
    name: env.DB_NAME || "",
    user: env.DB_USER || "",
    password: env.DB_PASSWORD || "",
    sqliteFile: env.SQLITE_FILE || "data/studio.sqlite",
  },
  sessionSecret: env.SESSION_SECRET || "",
  sessionDays: int(env.SESSION_DAYS, 30),
  setupToken: env.SETUP_TOKEN || "",
  askPerMinute: int(env.ASK_PER_MINUTE, 6),
  askPerDay: int(env.ASK_PER_DAY, 150),
  trustProxy: env.TRUST_PROXY !== "off",
};

function checkConfig() {
  const problems = [];
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    if (config.production) problems.push("SESSION_SECRET must be set to a random string of at least 32 characters.");
    else { config.sessionSecret = "dev-only-session-secret-not-for-production-use"; }
  }
  if (config.production && config.db.driver === "mysql" && (!config.db.name || !config.db.user)) problems.push("DB_NAME and DB_USER must be set.");
  if (!config.anthropicKey) console.warn("[config] ANTHROPIC_API_KEY is not set: the writing skills will return an error until it is.");
  return problems;
}

module.exports = { config, checkConfig };
