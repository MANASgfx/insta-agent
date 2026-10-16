"use strict";
// Adds the starter brands from seed/brands.json when the brands table is empty.
// Runs automatically on server start; `npm run seed` runs it by hand.
const path = require("path");
const fs = require("fs");
const { db } = require("../server/lib/db");

async function seedIfEmpty() {
  const n = await db.one("SELECT COUNT(*) AS n FROM brands");
  if (Number(n.n) > 0) return 0;
  const brands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "seed", "brands.json"), "utf8"));
  for (const b of brands) {
    const { id, ...data } = b;
    await db.upsert("brands", { id, data: JSON.stringify(data), updated_at: Date.now(), updated_by: null }, "id");
  }
  return brands.length;
}

if (require.main === module) {
  (async () => {
    await db.connect();
    const added = await seedIfEmpty();
    console.log(added ? `Added ${added} starter brand(s).` : "Brands already exist; nothing added.");
    await db.close();
  })().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { seedIfEmpty };
