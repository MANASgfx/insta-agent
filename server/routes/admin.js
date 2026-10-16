"use strict";
// Admin only: team logins and Claude usage per brand and per person.
const express = require("express");
const { db } = require("../lib/db");
const { ApiError, wrap } = require("../lib/errors");
const A = require("../lib/auth");

const r = express.Router();
r.use(A.requireAdmin);

// USD per million tokens [input, output]. Estimates only; the Anthropic console has the real bill.
const PRICES = {
  "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5": [2, 10], "claude-opus-5": [5, 25], "claude-fable-5-1": [10, 50],
};
const cost = (model, inp, out) => { const p = PRICES[model] || PRICES["claude-sonnet-5-5"]; return (inp * p[0] + out * p[1]) / 1e6; };

r.get("/users", wrap(async (req, res) => {
  const rows = await db.all("SELECT id, email, name, role, created_at FROM users ORDER BY name");
  res.json({ users: rows.map(u => ({ ...A.publicUser(u), createdAt: Number(u.created_at) })) });
}));

r.post("/users", wrap(async (req, res) => {
  const u = await A.createUser(req.body || {});
  res.json({ user: A.publicUser(u) });
}));

r.patch("/users/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.one("SELECT * FROM users WHERE id = ?", [id]);
  if (!u) throw new ApiError(404, "not_found", "No such user.");
  const b = req.body || {};
  if (b.role !== undefined) {
    const role = b.role === "admin" ? "admin" : "member";
    if (u.role === "admin" && role !== "admin") await mustKeepAnAdmin(id);
    await db.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  }
  if (b.name !== undefined) await db.run("UPDATE users SET name = ? WHERE id = ?", [String(b.name).trim().slice(0, 120) || u.name, id]);
  if (b.password !== undefined) {
    A.validatePassword(b.password);
    await db.run("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [await A.hashPassword(b.password), id]);
  }
  const out = await db.one("SELECT id, email, name, role FROM users WHERE id = ?", [id]);
  res.json({ user: A.publicUser(out) });
}));

r.delete("/users/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new ApiError(400, "bad_request", "You can't remove your own login.");
  const u = await db.one("SELECT role FROM users WHERE id = ?", [id]);
  if (u && u.role === "admin") await mustKeepAnAdmin(id);
  await db.run("DELETE FROM users WHERE id = ?", [id]);
  res.json({ ok: true });
}));

async function mustKeepAnAdmin(exceptId) {
  const n = await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND id <> ?", [exceptId]);
  if (Number(n.n) === 0) throw new ApiError(400, "bad_request", "Keep at least one admin.");
}

r.get("/usage", wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 366);
  const since = Date.now() - days * 864e5;
  const rows = await db.all(
    `SELECT ul.brand_id, ul.user_id, u.name AS user_name, ul.model, ul.status,
            COUNT(*) AS calls, SUM(ul.input_tokens) AS inp, SUM(ul.output_tokens) AS outp
       FROM usage_log ul LEFT JOIN users u ON u.id = ul.user_id
      WHERE ul.created_at > ?
      GROUP BY ul.brand_id, ul.user_id, u.name, ul.model, ul.status`, [since]);
  const brands = new Map((await db.all("SELECT id, data FROM brands")).map(b => { let n = b.id; try { n = JSON.parse(b.data).name || b.id; } catch (e) { /* keep id */ } return [b.id, n]; }));
  const add = (map, key, label, r) => {
    const x = map.get(key) || { key, label, calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    x.calls += Number(r.calls); if (r.status !== "ok") x.failed += Number(r.calls);
    x.inputTokens += Number(r.inp || 0); x.outputTokens += Number(r.outp || 0); x.costUsd += cost(r.model, Number(r.inp || 0), Number(r.outp || 0));
    map.set(key, x);
  };
  const byBrand = new Map(), byUser = new Map(), total = new Map();
  for (const row of rows) {
    add(byBrand, row.brand_id || "", brands.get(row.brand_id) || row.brand_id || "(no brand)", row);
    add(byUser, String(row.user_id || ""), row.user_name || "(removed user)", row);
    add(total, "all", "All", row);
  }
  const list = m => [...m.values()].map(x => ({ ...x, costUsd: Math.round(x.costUsd * 100) / 100 })).sort((a, b) => b.costUsd - a.costUsd);
  res.json({ days, total: list(total)[0] || { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }, byBrand: list(byBrand), byUser: list(byUser) });
}));

module.exports = r;
