"use strict";
// Entry point: `npm start`. Creates the tables if they're missing, seeds the starter brands on an empty database, then serves.
const fs = require("fs");
const path = require("path");
const { config, checkConfig } = require("./lib/config");
const { db } = require("./lib/db");
const { createApp } = require("./app");
const { seedIfEmpty } = require("../scripts/seed");

async function main() {
  const problems = checkConfig();
  if (problems.length) { for (const p of problems) console.error("[config] " + p); process.exit(1); }
  // If the host skipped `npm run build`, build the frontend now (takes well under a second).
  if (!fs.existsSync(path.join(__dirname, "..", "public", "index.html"))) { console.log("[build] public/ missing, building it"); require("../scripts/build-frontend"); }
  await db.connect();
  const seeded = await seedIfEmpty();
  if (seeded) console.log(`[seed] added ${seeded} starter brand(s)`);
  const server = createApp().listen(config.port, () => {
    console.log(`Instagram Studio on port ${config.port} · db ${db.driver} · model ${config.model}`);
  });
  // Claude calls can run for minutes; don't let Node cut them off.
  server.requestTimeout = 0;
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 61000;
  const stop = () => server.close(() => db.close().then(() => process.exit(0)));
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
}

main().catch(e => { console.error("Failed to start:", e); process.exit(1); });
