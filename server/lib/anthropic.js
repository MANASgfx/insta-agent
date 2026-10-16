"use strict";
// The only place that talks to Claude. The API key never leaves this process.
const Anthropic = require("@anthropic-ai/sdk");
const { config } = require("./config");
const { ApiError } = require("./errors");

let client = null;
function getClient() {
  if (!config.anthropicKey) throw new ApiError(503, "not_configured", "The Claude API key isn't set on the server.");
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey, baseURL: config.anthropicBaseUrl, timeout: 10 * 60 * 1000, maxRetries: 2 });
  return client;
}

// Models that accept the server-side refusal fallback ("default" form, Claude API only).
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

// Same tolerant parse the artifact runtime used: whole text, else the first ``` fence, else first "{" to last "}".
function parseJSONText(text) {
  const t = String(text || "").trim();
  const tryParse = s => { try { const v = JSON.parse(s); return v && typeof v === "object" ? v : null; } catch (e) { return null; } };
  let v = tryParse(t); if (v) return v;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) { v = tryParse(fence[1].trim()); if (v) return v; }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { v = tryParse(t.slice(a, b + 1)); if (v) return v; }
  return null;
}

function mapError(e) {
  if (e instanceof ApiError) return e;
  if (e instanceof Anthropic.APIUserAbortError || (e && e.name === "AbortError")) return new ApiError(499, "cancelled", "Stopped.");
  if (e instanceof Anthropic.RateLimitError) return new ApiError(429, "rate_limited", "Claude is busy for this account. Wait a minute and try again.");
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    console.error("[claude] the API key was rejected:", e.status);
    return new ApiError(503, "not_configured", "The server's Claude key isn't working.");
  }
  if (e instanceof Anthropic.BadRequestError) {
    const m = String(e.message || "").toLowerCase();
    if (m.includes("too long") || m.includes("too many tokens") || m.includes("context")) return new ApiError(413, "prompt_too_large", "Too much text for one request.");
    if (m.includes("image")) return new ApiError(400, "image_rejected", "One of the images couldn't be read.");
    console.error("[claude] bad request:", e.message);
    return new ApiError(502, "upstream_error", "Claude rejected the request.");
  }
  if (e instanceof Anthropic.APIError) { console.error("[claude] upstream error:", e.status); return new ApiError(502, "upstream_error", "Claude didn't answer. Try again."); }
  console.error("[claude] unexpected error:", e && e.message);
  return new ApiError(502, "upstream_error", "Claude didn't answer. Try again.");
}

/**
 * Stream one request and return {data, usage, model}. Throws ApiError.
 * onChars(n) is called as text arrives, so the browser can show progress.
 */
async function askJSON({ prompt, images, signal, onChars }) {
  const anthropic = getClient();
  const content = [
    ...(images || []).map(im => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
    { type: "text", text: prompt },
  ];
  const params = { model: config.model, max_tokens: config.maxTokens, messages: [{ role: "user", content }] };
  if (config.effort) params.output_config = { effort: config.effort };
  const useFallbacks = config.fallbacks && FALLBACK_MODELS.has(config.model) && !config.anthropicBaseUrl;
  if (useFallbacks) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }

  let final;
  try {
    const stream = useFallbacks ? anthropic.beta.messages.stream(params, { signal }) : anthropic.messages.stream(params, { signal });
    let chars = 0, lastSent = 0;
    stream.on("text", delta => {
      chars += delta.length;
      if (onChars && chars - lastSent >= 200) { lastSent = chars; onChars(chars); }
    });
    final = await stream.finalMessage();
  } catch (e) { throw mapError(e); }

  const usage = { input_tokens: (final.usage && final.usage.input_tokens) || 0, output_tokens: (final.usage && final.usage.output_tokens) || 0 };
  if (final.stop_reason === "refusal") throw Object.assign(new ApiError(422, "refused", "Claude declined this one."), { usage });

  // If a fallback model took over mid-answer, only its text counts.
  const blocks = final.content || [];
  let start = 0;
  blocks.forEach((b, i) => { if (b && typeof b.type === "string" && b.type.includes("fallback")) start = i + 1; });
  const text = blocks.slice(start).filter(b => b.type === "text").map(b => b.text).join("");

  if (!text.trim()) throw Object.assign(new ApiError(502, "empty_completion", "Claude returned nothing."), { usage });
  if (final.stop_reason === "max_tokens") throw Object.assign(new ApiError(502, "invalid_json", "The answer was cut off."), { usage });
  const data = parseJSONText(text);
  if (!data) throw Object.assign(new ApiError(502, "invalid_json", "Claude's answer came back in the wrong shape."), { usage });
  return { data, usage, model: final.model || config.model };
}

module.exports = { askJSON, parseJSONText, mapError };
