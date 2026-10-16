"use strict";
// Brands (brand voices), history logs, and per-brand docs (swipe files, weekly plans). Shared by the whole team.
const express = require("express");
const crypto = require("crypto");
const { db } = require("../lib/db");
const { ApiError, wrap } = require("../lib/errors");
const { requireAdmin } = require("../lib/auth");
const { SKILLS } = require("./ask");

const r = express.Router();
const BRAND_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DOC_KINDS = new Set(["swipes", "plans"]);
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const brandOut = row => ({ ...(parse(row.data) || {}), id: row.id, updatedAt: Number(row.updated_at) });
const logOut = row => ({ id: row.id, brandId: row.brand_id, skill: row.skill, title: row.title, formula: row.formula === null ? null : Number(row.formula), body: row.body, createdAt: Number(row.created_at), createdBy: row.created_by_name || null });

// ---- brands ----
r.get("/brands", wrap(async (req, res) => {
  const rows = await db.all("SELECT id, data, updated_at FROM brands ORDER BY id");
  res.json({ brands: rows.map(brandOut).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))) });
}));

r.put("/brands/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!BRAND_ID.test(id)) throw new ApiError(400, "bad_request", "Brand ids are lowercase letters, numbers and dashes.");
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? { ...req.body } : null;
  if (!body || !String(body.name || "").trim()) throw new ApiError(400, "bad_request", "A brand needs a name.");
  delete body.id; delete body.updatedAt;
  const data = JSON.stringify(body);
  if (data.length > 200 * 1024) throw new ApiError(413, "bad_request", "That brand voice is too long. Trim the samples.");
  const now = Date.now();
  await db.upsert("brands", { id, data, updated_at: now, updated_by: req.user.id }, "id");
  res.json({ brand: { ...body, id, updatedAt: now } });
}));

r.delete("/brands/:id", requireAdmin, wrap(async (req, res) => {
  await db.run("DELETE FROM brands WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

// ---- history ----
r.get("/logs", wrap(async (req, res) => {
  const brandId = String(req.query.brandId || "");
  const rows = await db.all(
    "SELECT l.*, u.name AS created_by_name FROM logs l LEFT JOIN users u ON u.id = l.created_by WHERE l.brand_id = ? ORDER BY l.created_at DESC LIMIT 80", [brandId]);
  res.json({ logs: rows.map(logOut) });
}));

r.post("/logs", wrap(async (req, res) => {
  const b = req.body || {};
  if (!SKILLS.has(b.skill)) throw new ApiError(400, "bad_request", "Unknown skill.");
  const row = {
    id: crypto.randomBytes(13).toString("hex"),
    brand_id: String(b.brandId || "").slice(0, 64),
    skill: b.skill,
    title: String(b.title || "").slice(0, 500),
    formula: Number.isInteger(Number(b.formula)) && b.formula !== null && b.formula !== "" ? Number(b.formula) : null,
    body: String(b.body || "").slice(0, 60000),
    created_at: Date.now(),
    created_by: req.user.id,
  };
  await db.run("INSERT INTO logs (id, brand_id, skill, title, formula, body, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [row.id, row.brand_id, row.skill, row.title, row.formula, row.body, row.created_at, row.created_by]);
  res.json({ log: logOut({ ...row, created_by_name: req.user.name }) });
}));

r.delete("/logs/:id", wrap(async (req, res) => {
  await db.run("DELETE FROM logs WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
}));

// ---- docs: swipes/<brandId>, plans/<brandId> ----
function docPath(req) {
  const { kind, brandId } = req.params;
  if (!DOC_KINDS.has(kind) || !/^[a-z0-9-]{1,64}$/.test(brandId)) throw new ApiError(400, "bad_request", "Unknown document.");
  return kind + "/" + brandId;
}
r.get("/docs/:kind/:brandId", wrap(async (req, res) => {
  const row = await db.one("SELECT data FROM docs WHERE path = ?", [docPath(req)]);
  res.json({ data: row ? parse(row.data) : null });
}));
r.put("/docs/:kind/:brandId", wrap(async (req, res) => {
  const path = docPath(req);
  const data = JSON.stringify(req.body === undefined ? null : req.body);
  if (data.length > 900 * 1024) throw new ApiError(413, "bad_request", "That document is too large.");
  await db.upsert("docs", { path, data, updated_at: Date.now() }, "path");
  res.json({ ok: true });
}));

module.exports = r;
