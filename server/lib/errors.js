"use strict";
// Every API failure is {error: {code, message}} with a real HTTP status.
// The codes match ERR_COPY in frontend/src/app_core.js so the views show the right message.
class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, wrap };
