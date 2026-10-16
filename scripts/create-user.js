"use strict";
// Usage: npm run create-user -- <email> "<Name>" [admin|member]
// Prompts for the password so it never lands in shell history.
const readline = require("readline");
const { db } = require("../server/lib/db");
const { createUser } = require("../server/lib/auth");

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, a => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

(async () => {
  const [email, name, role = "member"] = process.argv.slice(2);
  if (!email) { console.log('Usage: npm run create-user -- you@digify.marketing "Your Name" admin'); process.exit(1); }
  const password = process.env.NEW_USER_PASSWORD || await askHidden("Password (10+ characters): ");
  await db.connect();
  const u = await createUser({ email, name, password, role });
  console.log(`Created ${u.role} ${u.email} (id ${u.id}).`);
  await db.close();
})().catch(e => { console.error(e.message); process.exit(1); });
