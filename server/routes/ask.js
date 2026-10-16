"use strict";
// POST /api/ask: the Claude proxy. Validates, rate-limits, then streams progress back as Server-Sent Events:
//   event: progress  data: {"chars": 1234}
//   event: done      data: {"data": {...parsed JSON...}, "usage": {...}}
//   event: error     data: {"error": {"code", "message"}}
// Validation failures before the stream starts come back as ordinary JSON errors with an HTTP status.
const express = require("express");
const { db } = require("../lib/db");
const { config } = require("../lib/config");
const { ApiError, wrap } = require("../lib/errors");
const claude = require("../lib/anthropic");

const SKILLS = new Set(["ig-reel", "ig-caption", "ig-carousel", "ig-story", "ig-repurpose", "ig-comment", "ig-reply", "ig-dm", "ig-plan", "ig-profile", "ig-viral", "ig-audit", "ig-human"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_PROMPT = 256 * 1024, MAX_IMAGES = 5, MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const r = express.Router();

async function logUsage(row) {
  try {
    await db.run("INSERT INTO usage_log (user_id, brand_id, skill, model, input_tokens, output_tokens, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [row.userId, row.brandId || null, row.skill, row.model, row.input_tokens || 0, row.output_tokens || 0, row.status, Date.now()]);
  } catch (e) { console.error("[usage] couldn't write usage_log:", e.message); }
}

async function checkLimits(userId) {
  const now = Date.now();
  const row = await db.one(
    "SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS minute, COUNT(*) AS day FROM usage_log WHERE user_id = ? AND created_at > ?",
    [now - 60e3, userId, now - 864e5]);
  if (Number(row.minute || 0) >= config.askPerMinute) throw new ApiError(429, "rate_limited", `You've hit ${config.askPerMinute} requests a minute. Wait a moment.`);
  if (Number(row.day || 0) >= config.askPerDay) throw new ApiError(429, "rate_limited", `You've hit today's limit of ${config.askPerDay} requests. It resets over the next 24 hours.`);
}

function validate(body) {
  const { skill, prompt, images, brandId } = body || {};
  if (!SKILLS.has(skill)) throw new ApiError(400, "bad_request", "Unknown skill.");
  if (typeof prompt !== "string" || !prompt.trim()) throw new ApiError(400, "bad_request", "Empty prompt.");
  if (Buffer.byteLength(prompt) > MAX_PROMPT) throw new ApiError(413, "prompt_too_large", "Too much text for one request.");
  const imgs = Array.isArray(images) ? images : [];
  if (imgs.length > MAX_IMAGES) throw new ApiError(400, "image_rejected", `At most ${MAX_IMAGES} screenshots per request.`);
  for (const im of imgs) {
    if (!im || !IMAGE_TYPES.has(im.media_type) || typeof im.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(im.data.slice(0, 200)))
      throw new ApiError(400, "image_rejected", "One of the screenshots isn't a PNG, JPG, WebP or GIF.");
    if (im.data.length * 0.75 > MAX_IMAGE_BYTES) throw new ApiError(400, "image_rejected", "One of the screenshots is over 5 MB.");
  }
  return { skill, prompt, images: imgs.map(im => ({ media_type: im.media_type, data: im.data })), brandId: typeof brandId === "string" ? brandId.slice(0, 64) : null };
}

r.post("/", wrap(async (req, res) => {
  const input = validate(req.body);
  await checkLimits(req.user.id);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // ask nginx/LiteSpeed not to buffer, so progress arrives live
  });
  res.flushHeaders();
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  send("progress", { chars: 0 });

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); }); // Stop in the browser stops spending upstream
  const ping = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, 15000);

  const base = { userId: req.user.id, brandId: input.brandId, skill: input.skill, model: config.model };
  try {
    const out = await claude.askJSON({ prompt: input.prompt, images: input.images, signal: ctl.signal, onChars: n => send("progress", { chars: n }) });
    await logUsage({ ...base, model: out.model, ...out.usage, status: "ok" });
    send("done", { data: out.data, usage: out.usage });
  } catch (e) {
    const err = e instanceof ApiError ? e : claude.mapError(e);
    await logUsage({ ...base, ...(e.usage || {}), status: err.code === "cancelled" ? "cancelled" : err.code });
    send("error", { error: { code: err.code, message: err.message } });
  } finally {
    clearInterval(ping);
    if (!res.writableEnded) res.end();
  }
}));

module.exports = r;
module.exports.SKILLS = SKILLS;
