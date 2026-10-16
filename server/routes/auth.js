"use strict";
// Login, logout, current user, own password, and the one-time first-admin setup.
const express = require("express");
const crypto = require("crypto");
const { db } = require("../lib/db");
const { config } = require("../lib/config");
const { ApiError, wrap } = require("../lib/errors");
const A = require("../lib/auth");

const r = express.Router();
let dummy = null;
const dummyHash = async () => (dummy = dummy || await A.hashPassword(crypto.randomBytes(16).toString("hex")));

r.post("/login", wrap(async (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  if (A.loginBlocked(req.ip, email)) throw new ApiError(429, "rate_limited", "Too many failed attempts. Wait 15 minutes and try again.");
  const u = email ? await db.one("SELECT * FROM users WHERE email = ?", [email]) : null;
  // Unknown emails still pay for one bcrypt compare, so response time doesn't reveal which emails have logins.
  const ok = u ? await A.checkPassword(password, u.password_hash) : (await A.checkPassword(password, await dummyHash()), false);
  if (!ok) { A.noteLoginFail(req.ip, email); throw new ApiError(401, "bad_login", "That email and password don't match."); }
  A.clearLoginFails(req.ip, email);
  A.setSessionCookie(req, res, u);
  res.json({ user: A.publicUser(u) });
}));

r.post("/logout", (req, res) => { A.clearSessionCookie(req, res); res.json({ ok: true }); });

r.get("/me", A.requireUser, (req, res) => res.json({ user: A.publicUser(req.user) }));

r.post("/me/password", A.requireUser, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  const u = await db.one("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!(await A.checkPassword(String(current || ""), u.password_hash))) throw new ApiError(400, "bad_request", "Your current password is wrong.");
  A.validatePassword(next);
  await db.run("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [await A.hashPassword(next), u.id]);
  A.setSessionCookie(req, res, { ...u, session_version: u.session_version + 1 });
  res.json({ ok: true });
}));

// First run: if there are no users yet and SETUP_TOKEN is set, the login page can create the first admin.
r.get("/setup", wrap(async (req, res) => {
  const n = await db.one("SELECT COUNT(*) AS n FROM users");
  res.json({ needed: Number(n.n) === 0, enabled: !!config.setupToken });
}));
r.post("/setup", wrap(async (req, res) => {
  const n = await db.one("SELECT COUNT(*) AS n FROM users");
  if (Number(n.n) > 0) throw new ApiError(403, "forbidden", "Setup is already done. Sign in instead.");
  const token = String((req.body && req.body.token) || "");
  const want = Buffer.from(config.setupToken || ""), got = Buffer.from(token);
  if (!config.setupToken || want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    A.noteLoginFail(req.ip, "setup");
    throw new ApiError(403, "forbidden", "That setup code is wrong. It's the SETUP_TOKEN value in the server's environment variables.");
  }
  const u = await A.createUser({ ...req.body, role: "admin" });
  A.setSessionCookie(req, res, u);
  res.json({ user: A.publicUser(u) });
}));

module.exports = r;
