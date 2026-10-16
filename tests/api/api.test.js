"use strict";
// End-to-end API tests: real Express app + in-memory SQLite + a fake Anthropic server that streams SSE like the real one.
// Run: npm run test:api
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- fake Anthropic Messages API (behaviour picked by a MODE: marker in the prompt) ----
let fakeHits = 0;
const fake = http.createServer((req, res) => {
  let body = ""; req.on("data", c => (body += c));
  req.on("end", () => {
    fakeHits++;
    const p = JSON.parse(body); const text = p.messages[0].content.at(-1).text;
    const mode = (/MODE:(\w+)/.exec(text) || [])[1] || "ok";
    if (mode === "ratelimit") { res.writeHead(429, { "content-type": "application/json", "retry-after": "0" }); return res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } })); }
    if (mode === "toolong") { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "prompt is too long: 2000000 tokens > 1000000 maximum" } })); }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    const out = { ok: '```json\n{"hooks": ["one", "two"], "n": ' + p.messages[0].content.length + "}\n```", bad: "Sorry, here are some thoughts with no JSON.", refusal: "", slow: '{"late": true}' }[mode] || "{}";
    ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: p.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1234, output_tokens: 1 } } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    const finish = () => {
      if (res.writableEnded || res.destroyed) return;
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: mode === "refusal" ? "refusal" : "end_turn", stop_sequence: null }, usage: { output_tokens: 321 } });
      ev("message_stop", {}); res.end();
    };
    if (out) ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: out } });
    if (mode === "slow") setTimeout(finish, 3000); else finish();
  });
});

let base, server, cookieAdmin, cookieMember;
async function call(method, url, { body, cookie, raw, headers } = {}) {
  const h = { ...(headers || {}) };
  if (body !== undefined && !raw) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const setCookie = res.headers.get("set-cookie");
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  return { status: res.status, data, cookie: setCookie ? setCookie.split(";")[0] : null };
}
function sseEvents(text) {
  return text.split("\n\n").filter(c => c.startsWith("event:")).map(c => {
    const [e, d] = c.split("\n"); return { event: e.slice(6).trim(), data: JSON.parse(d.slice(5)) };
  });
}

test.before(async () => {
  await new Promise(r => fake.listen(0, r));
  Object.assign(process.env, {
    NODE_ENV: "test", DB_DRIVER: "sqlite", SQLITE_FILE: ":memory:", SETUP_TOKEN: "setup-secret-123",
    SESSION_SECRET: "x".repeat(40), ANTHROPIC_API_KEY: "sk-ant-test-not-real", ANTHROPIC_BASE_URL: `http://127.0.0.1:${fake.address().port}`,
    ASK_PER_MINUTE: "100", ASK_PER_DAY: "1000",
  });
  const { db } = require("../../server/lib/db");
  const { createApp } = require("../../server/app");
  const { seedIfEmpty } = require("../../scripts/seed");
  await db.connect(); await seedIfEmpty();
  server = createApp().listen(0);
  await new Promise(r => server.on("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => { server.close(); fake.close(); });

test("everything except login and setup needs a session", async () => {
  for (const [m, u] of [["GET", "/me"], ["GET", "/brands"], ["GET", "/logs?brandId=x"], ["GET", "/docs/plans/x"], ["POST", "/ask"], ["GET", "/admin/users"], ["GET", "/nope"]]) {
    const r = await call(m, u, m === "POST" ? { body: {} } : {});
    assert.strictEqual(r.status, 401, `${m} ${u}`);
    assert.strictEqual(r.data.error.code, "session_expired");
  }
  assert.strictEqual((await call("GET", "/health")).status, 200);
});

test("first-run setup creates exactly one admin", async () => {
  assert.deepStrictEqual((await call("GET", "/setup")).data, { needed: true, enabled: true });
  assert.strictEqual((await call("POST", "/setup", { body: { token: "wrong", email: "a@digify.marketing", password: "long-enough-pw" } })).status, 403);
  const ok = await call("POST", "/setup", { body: { token: "setup-secret-123", name: "Manas", email: "Manas@Digify.marketing", password: "long-enough-pw" } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.user.role, "admin");
  assert.strictEqual(ok.data.user.email, "manas@digify.marketing");
  assert.match(ok.cookie, /^igs_session=/);
  cookieAdmin = ok.cookie;
  assert.strictEqual((await call("POST", "/setup", { body: { token: "setup-secret-123", email: "b@x.com", password: "long-enough-pw" } })).status, 403);
  assert.strictEqual((await call("GET", "/setup")).data.needed, false);
});

test("login, bad login, CSRF guard and admin-created members", async () => {
  const bad = await call("POST", "/login", { body: { email: "manas@digify.marketing", password: "nope" } });
  assert.strictEqual(bad.status, 401); assert.strictEqual(bad.data.error.code, "bad_login");
  const form = await call("POST", "/login", { body: "email=a&password=b", raw: true, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.strictEqual(form.status, 415);
  const created = await call("POST", "/admin/users", { cookie: cookieAdmin, body: { email: "social@digify.marketing", name: "Social", password: "member-password-1" } });
  assert.strictEqual(created.status, 200); assert.strictEqual(created.data.user.role, "member");
  const dup = await call("POST", "/admin/users", { cookie: cookieAdmin, body: { email: "social@digify.marketing", password: "member-password-1" } });
  assert.strictEqual(dup.status, 409);
  const login = await call("POST", "/login", { body: { email: "social@digify.marketing", password: "member-password-1" } });
  assert.strictEqual(login.status, 200); cookieMember = login.cookie;
  assert.strictEqual((await call("GET", "/me", { cookie: cookieMember })).data.user.name, "Social");
  assert.strictEqual((await call("GET", "/admin/users", { cookie: cookieMember })).status, 403);
});

test("brands are shared, seeded, and only admins delete them", async () => {
  const list = await call("GET", "/brands", { cookie: cookieMember });
  assert.ok(list.data.brands.some(b => b.id === "wootique" && b.name === "Wootique"));
  const put = await call("PUT", "/brands/sparlin-veneer", { cookie: cookieMember, body: { name: "Sparlin Veneer", handle: "@sparlin" } });
  assert.strictEqual(put.status, 200);
  const seen = await call("GET", "/brands", { cookie: cookieAdmin });
  assert.strictEqual(seen.data.brands.find(b => b.id === "sparlin-veneer").handle, "@sparlin");
  assert.strictEqual((await call("PUT", "/brands/Bad%20Id", { cookie: cookieMember, body: { name: "x" } })).status, 400);
  assert.strictEqual((await call("DELETE", "/brands/sparlin-veneer", { cookie: cookieMember })).status, 403);
  assert.strictEqual((await call("DELETE", "/brands/sparlin-veneer", { cookie: cookieAdmin })).status, 200);
});

test("history logs and docs round-trip", async () => {
  const add = await call("POST", "/logs", { cookie: cookieMember, body: { brandId: "wootique", skill: "ig-reel", title: "Hook", formula: 3, body: "script" } });
  assert.strictEqual(add.status, 200); assert.strictEqual(add.data.log.formula, 3);
  assert.strictEqual((await call("POST", "/logs", { cookie: cookieMember, body: { brandId: "wootique", skill: "evil", body: "" } })).status, 400);
  const logs = await call("GET", "/logs?brandId=wootique", { cookie: cookieAdmin });
  assert.strictEqual(logs.data.logs.length, 1); assert.strictEqual(logs.data.logs[0].createdBy, "Social");
  assert.strictEqual((await call("DELETE", "/logs/" + add.data.log.id, { cookie: cookieAdmin })).status, 200);
  assert.strictEqual((await call("GET", "/logs?brandId=wootique", { cookie: cookieAdmin })).data.logs.length, 0);
  assert.deepStrictEqual((await call("GET", "/docs/plans/wootique", { cookie: cookieMember })).data, { data: null });
  await call("PUT", "/docs/plans/wootique", { cookie: cookieMember, body: { days: [1, 2] } });
  await call("PUT", "/docs/plans/wootique", { cookie: cookieMember, body: { days: [3] } });
  assert.deepStrictEqual((await call("GET", "/docs/plans/wootique", { cookie: cookieAdmin })).data, { data: { days: [3] } });
  assert.strictEqual((await call("GET", "/docs/secrets/wootique", { cookie: cookieAdmin })).status, 400);
});

test("/api/ask streams progress and returns parsed JSON, and logs usage per brand", async () => {
  const img = { media_type: "image/jpeg", data: Buffer.from("fakejpeg").toString("base64") };
  const r = await call("POST", "/ask", { cookie: cookieMember, body: { skill: "ig-reel", prompt: "write hooks MODE:ok", images: [img], brandId: "wootique" } });
  assert.strictEqual(r.status, 200);
  const evs = sseEvents(r.data);
  assert.strictEqual(evs[0].event, "progress");
  const done = evs.find(e => e.event === "done");
  assert.deepStrictEqual(done.data.data, { hooks: ["one", "two"], n: 2 }); // fenced JSON parsed; image + text blocks sent
  assert.deepStrictEqual(done.data.usage, { input_tokens: 1234, output_tokens: 321 });
  const usage = await call("GET", "/admin/usage?days=30", { cookie: cookieAdmin });
  const w = usage.data.byBrand.find(b => b.key === "wootique");
  assert.strictEqual(w.label, "Wootique"); assert.strictEqual(w.calls, 1); assert.strictEqual(w.inputTokens, 1234);
});

test("/api/ask maps failures onto the codes the views understand", async () => {
  const ask = async prompt => sseEvents((await call("POST", "/ask", { cookie: cookieMember, body: { skill: "ig-caption", prompt } })).data).find(e => e.event === "error").data.error.code;
  assert.strictEqual(await ask("MODE:bad"), "invalid_json");
  assert.strictEqual(await ask("MODE:refusal"), "refused");
  assert.strictEqual(await ask("MODE:ratelimit"), "rate_limited");
  assert.strictEqual(await ask("MODE:toolong"), "prompt_too_large");
  const unknown = await call("POST", "/ask", { cookie: cookieMember, body: { skill: "ig-hack", prompt: "x" } });
  assert.strictEqual(unknown.status, 400);
  const big = await call("POST", "/ask", { cookie: cookieMember, body: { skill: "ig-dm", prompt: "x".repeat(300 * 1024) } });
  assert.strictEqual(big.status, 413); assert.strictEqual(big.data.error.code, "prompt_too_large");
  const badImg = await call("POST", "/ask", { cookie: cookieMember, body: { skill: "ig-dm", prompt: "x", images: [{ media_type: "application/pdf", data: "AAAA" }] } });
  assert.strictEqual(badImg.data.error.code, "image_rejected");
});

test("Stop in the browser aborts the upstream call and logs it as cancelled", async () => {
  const ctl = new AbortController();
  const res = await fetch(base + "/ask", { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", cookie: cookieAdmin }, body: JSON.stringify({ skill: "ig-dm", prompt: "MODE:slow", brandId: "cancel-test" }) });
  const reader = res.body.getReader(); await reader.read();
  ctl.abort();
  await new Promise(r => setTimeout(r, 400));
  const { db } = require("../../server/lib/db");
  const row = await db.one("SELECT status FROM usage_log WHERE brand_id = 'cancel-test'");
  assert.ok(row, "usage row written"); assert.strictEqual(row.status, "cancelled");
});

test("per-user limits come from usage_log", async () => {
  const { config } = require("../../server/lib/config");
  const before = config.askPerMinute; config.askPerMinute = 1;
  try {
    const r = await call("POST", "/ask", { cookie: cookieMember, body: { skill: "ig-dm", prompt: "MODE:ok" } });
    assert.strictEqual(r.status, 429); assert.strictEqual(r.data.error.code, "rate_limited");
  } finally { config.askPerMinute = before; }
});

test("changing a password signs out other sessions", async () => {
  const r = await call("POST", "/me/password", { cookie: cookieMember, body: { current: "member-password-1", next: "member-password-2" } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await call("GET", "/me", { cookie: cookieMember })).status, 401);
  assert.strictEqual((await call("GET", "/me", { cookie: r.cookie })).status, 200);
});

test("the API key is never in the frontend bundle", () => {
  const pub = path.join(__dirname, "../../public");
  if (!fs.existsSync(pub)) return;
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(pub)) assert.ok(!/sk-ant-/.test(fs.readFileSync(f, "utf8")), f);
});
