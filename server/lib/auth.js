"use strict";
// Sessions are a signed, httpOnly cookie: base64url(JSON {uid, sv, exp}) + "." + HMAC-SHA256.
// `sv` is the user's session_version, so changing a password or removing a user signs them out everywhere.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { config } = require("./config");
const { db } = require("./db");
const { ApiError } = require("./errors");

const COOKIE = "igs_session";
const b64 = s => Buffer.from(s).toString("base64url");
const sign = s => crypto.createHmac("sha256", config.sessionSecret).update(s).digest("base64url");

function makeToken(user) {
  const payload = b64(JSON.stringify({ uid: user.id, sv: user.session_version, exp: Date.now() + config.sessionDays * 864e5 }));
  return payload + "." + sign(payload);
}
function readToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(payload)); const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    return p && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSessionCookie(req, res, user) {
  res.cookie(COOKIE, makeToken(user), {
    httpOnly: true, sameSite: "lax", secure: req.secure, path: "/", maxAge: config.sessionDays * 864e5,
  });
}
function clearSessionCookie(req, res) { res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/" }); }

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });

async function loadSession(req, res, next) {
  try {
    const p = readToken(parseCookies(req.headers.cookie)[COOKIE]);
    if (p) {
      const u = await db.one("SELECT id, email, name, role, session_version FROM users WHERE id = ?", [p.uid]);
      if (u && u.session_version === p.sv) req.user = u;
    }
    next();
  } catch (e) { next(e); }
}
function requireUser(req, res, next) {
  if (!req.user) return next(new ApiError(401, "session_expired", "Please sign in."));
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return next(new ApiError(401, "session_expired", "Please sign in."));
  if (req.user.role !== "admin") return next(new ApiError(403, "forbidden", "Only an admin can do that."));
  next();
}

const hashPassword = pw => bcrypt.hash(pw, 11);
const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 10) throw new ApiError(400, "bad_request", "Passwords need at least 10 characters.");
  if (pw.length > 200) throw new ApiError(400, "bad_request", "That password is too long.");
}
function validateEmail(email) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new ApiError(400, "bad_request", "Enter a valid email address.");
  return email.trim().toLowerCase();
}

async function createUser({ email, name, password, role }) {
  email = validateEmail(email);
  validatePassword(password);
  name = String(name || "").trim().slice(0, 120) || email.split("@")[0];
  role = role === "admin" ? "admin" : "member";
  if (await db.one("SELECT id FROM users WHERE email = ?", [email])) throw new ApiError(409, "conflict", "There's already a login for that email.");
  const r = await db.run("INSERT INTO users (email, name, password_hash, role, session_version, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    [email, name, await hashPassword(password), role, Date.now()]);
  return db.one("SELECT id, email, name, role, session_version FROM users WHERE id = ?", [r.insertId]);
}

// 5 failed logins per 15 minutes, per IP and per email. In memory: fine for one Node process.
const FAILS = new Map();
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 5;
function failKeyCount(key) {
  const now = Date.now(); const arr = (FAILS.get(key) || []).filter(t => now - t < WINDOW);
  FAILS.set(key, arr); return arr.length;
}
function loginBlocked(ip, email) { return failKeyCount("ip:" + ip) >= MAX_FAILS || failKeyCount("em:" + email) >= MAX_FAILS; }
function noteLoginFail(ip, email) {
  for (const k of ["ip:" + ip, "em:" + email]) { const arr = FAILS.get(k) || []; arr.push(Date.now()); FAILS.set(k, arr); }
}
function clearLoginFails(ip, email) { FAILS.delete("ip:" + ip); FAILS.delete("em:" + email); }

module.exports = {
  loadSession, requireUser, requireAdmin, setSessionCookie, clearSessionCookie, publicUser,
  hashPassword, checkPassword, validatePassword, validateEmail, createUser,
  loginBlocked, noteLoginFail, clearLoginFails, _test: { makeToken, readToken },
};
