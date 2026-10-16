> **Historical.** This is the original build brief the app was built from. Paths like `prototype/src/` now live in `frontend/src/`; the current behaviour is described in the README and docs/ACCEPTANCE.md. Differences from this brief: sessions are a signed cookie (no session table), `/api/ask` streams Server-Sent Events, usage is logged per brand, and there is a Team & account page.

# Instagram Studio: build spec

Turn the working prototype in `prototype/` into a self-hosted web app on Manas's Hostinger domain. The frontend is finished and tested. What's missing is everything the claude.ai artifact runtime used to provide: calling Claude, storing data, downloads, and a login.

## 1. What the prototype is

`prototype/instagram-studio.html` is one self-contained page, built by `prototype/src/build.py` from:

| file | what it holds | change it? |
| --- | --- | --- |
| `src/igtools.js` | JS port of the pack's five Python tools (hook scorer, beat timer, caption linter, humanizer, detector, swipe ranking). Verified to match Python output exactly. | **No.** Only touch with the parity test green before and after. |
| `src/app_core.js` | DOM kit, **the capability layer (`initCaps`, `askJSON`, `Store`)**, prompt building, shared renderers | **Yes**: the capability layer is what you replace |
| `src/app_views_create.js` | Reel, Caption, Carousel, Stories, Repurpose | Only the carousel download (see 4.3) |
| `src/app_views_grow.js` | Comments, Replies, DMs, Plan, Profile, Viral, Audit | No |
| `src/app_views_tools.js` | Humanizer, Quick checks, Brand voice, History, Home, shell/router, `boot()` | Add a login gate + sign-out in the shell |
| `src/app.css` | All styling, light + dark tokens | Keep the look |
| `skills/` | The original pack (MIT, Jake Schincariol): 13 `SKILL.md`, `hooks.json`, `slop.json`, `rubric.json`, Python tools | Read-only reference; `build.py` embeds SKILL.md + JSON into the page |

How a writing skill runs today: a view calls `askJSON(skillId, parts, shape, {signal, progress, images})`. That builds one prompt (fixed preface + the SKILL.md text + the brand voice + task parts + the JSON shape) and calls `CAP.sample.json(prompt, opts)`, which returns the parsed object. The view then runs the local tools on the result. **Keep this contract**: every view depends on `askJSON` returning a parsed object or throwing `{code, message}`.

Error codes the views already understand (see `ERR_COPY` in app_core.js): `cancelled, not_granted, rate_limited, session_expired, refused, empty_completion, invalid_json, prompt_too_large, image_rejected, upstream_error`. Map server errors onto these.

## 2. Target architecture

```
browser (static frontend, same page as prototype)
   │  fetch('/api/...')  with session cookie
   ▼
backend (Node/Express  OR  PHP, see 2.1)
   ├── POST /api/ask   → Anthropic Messages API (key lives here only)
   ├── brands / logs / docs CRUD → MySQL
   └── auth (session cookie)
```

### 2.1 Which backend: ask Manas first

Hostinger runs Node.js web apps only on **Business Web Hosting and Cloud plans** (also VPS, manually). Premium/Single plans run PHP only.

- **Business / Cloud plan → Node 22 + Express** (default). Deploy via hPanel › Websites › Add website › Node.js Web App, from a GitHub repo (auto-redeploys on push) or zip upload.
- **Premium / Single plan → PHP 8.2+ backend** in `public_html/api/` with the same routes and JSON shapes, and the frontend as static files in `public_html/`.
- **VPS → Node**, behind nginx + pm2.

Build the API contract (section 3) once, implement the one backend that matches his plan. Don't build both.

Both use **MySQL** from hPanel › Databases. Schema: `db/schema.sql`.

### 2.2 Suggested repo layout (Node)

```
/public            built frontend (index.html + assets), served statically
/frontend/src      the prototype src files, moved here
/server            index.js (express), routes/, lib/anthropic.js, lib/db.js, lib/auth.js
/scripts           build-frontend.js (replaces build.py), create-user.js, seed.js
/skills            unchanged pack (build reads SKILL.md + JSON from here)
/tests             parity + browser tests (keep them running in CI or before each deploy)
.env.example
```

Plain JS is fine; no framework migration is needed. If you add a bundler (Vite), keep the output a static `public/` folder.

## 3. API contract

All routes are JSON, require a valid session (except `/api/login`), and return `{error: {code, message}}` with a proper HTTP status on failure.

| method | route | body / query | returns |
| --- | --- | --- | --- |
| POST | `/api/login` | `{email, password}` | `{user: {id, name, role}}` + sets an httpOnly, Secure, SameSite=Lax cookie |
| POST | `/api/logout` | | `{ok: true}` |
| GET | `/api/me` | | `{user}` or 401 |
| POST | `/api/ask` | `{skill, prompt, images?: [{media_type, data(base64)}]}` | `{data: <parsed JSON object>, usage: {input_tokens, output_tokens}}` |
| GET | `/api/brands` | | `{brands: [{id, ...fields, updatedAt}]}` |
| PUT | `/api/brands/:id` | full brand object | `{brand}` |
| DELETE | `/api/brands/:id` | | `{ok}` (admin only) |
| GET | `/api/logs?brandId=` | | `{logs: [...]}` newest first, limit 80 |
| POST | `/api/logs` | `{brandId, skill, title, formula?, body}` | `{log}` |
| DELETE | `/api/logs/:id` | | `{ok}` |
| GET | `/api/docs/:kind/:brandId` | kind ∈ `swipes`, `plans` | `{data}` or `{data: null}` |
| PUT | `/api/docs/:kind/:brandId` | the object | `{ok}` |

### 3.1 `/api/ask`: the Claude proxy

- Call `POST https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Use the official SDK if you prefer (`@anthropic-ai/sdk` for Node). PHP has no official SDK, so use cURL.
- Model from env `CLAUDE_MODEL`, default **`claude-sonnet-5-5`** (fast, good quality, $2/$10 per MTok). Let Manas switch to `claude-opus-5-5` for better drafts or `claude-haiku-5-5` for cheaper ones. Check model IDs against https://platform.claude.com/docs/en/models/overview before shipping.
- `max_tokens`: 8000. The single user message has content `[...image blocks, {type:"text", text: prompt}]`. Image blocks are `{type:"image", source:{type:"base64", media_type, data}}`, at most 5, each at most 5 MB.
- **JSON out:** the prompt already ends with "Reply with only one JSON object of exactly this shape". Parse the text tolerantly, the same way the artifact runtime did: whole text → else the body of the first ``` fence → else from the first `{` to the last `}`. If nothing parses, or `stop_reason` is `max_tokens`, return code `invalid_json`. If `stop_reason` is `refusal`, return `refused`. (Optional upgrade: `output_config.format` JSON-schema structured outputs. That needs a schema per skill, with `additionalProperties:false` and no min/max constraints. See https://platform.claude.com/docs/en/build-with-claude/structured-outputs.)
- Map Anthropic errors: 429 → `rate_limited`; 400 with prompt too long → `prompt_too_large`; 400 image errors → `image_rejected`; 5xx or network → `upstream_error`.
- Reject prompts over 256 KB (`prompt_too_large`) and unknown `skill` values (allow-list the 13 ids).
- Write a `usage_log` row for every call (user, skill, model, tokens, status).
- **Cost guard:** per-user limits from env (`ASK_PER_MINUTE=6`, `ASK_PER_DAY=150`), enforced from `usage_log`. Over the limit → `rate_limited`.
- **Timeouts:** Claude calls can take 30–90 s. Set the server and proxy timeout to at least 180 s. On PHP: `set_time_limit(180)`, and check Hostinger's `max_execution_time`. If shared hosting cuts requests short, switch `/api/ask` to streaming (`stream: true`, forward progress as SSE) and drive the existing `progress()` callback from it.
- **Abort:** forward the client's abort (`req.on('close')`) to the upstream request so Stop actually stops spending.
- The API key never leaves the server: no `NEXT_PUBLIC_`, no inline config, not in git.

### 3.2 Prompt assembly

Keep `buildPrompt` client-side as in the prototype. It already embeds the SKILL.md text and the brand voice. The server is the trust boundary: it authenticates, allow-lists `skill`, caps size, rate-limits and logs. Don't pass the user's text as a system prompt. The preface already tells Claude that pasted text is data, not instructions.

## 4. Frontend changes (all in the capability layer)

### 4.1 `initCaps()` → real capabilities

```js
CAP.sample = { json: (prompt, opts) => apiAsk(skillOf(prompt), prompt, opts) }; // or refactor askJSON to call apiAsk directly
CAP.db = null; CAP.downloads = nativeDownloads; CAP.images = true; CAP.imageMax = 5;
```

Simplest: rewrite `askJSON` to `fetch('/api/ask', {method:'POST', body: JSON.stringify({skill: skillId, prompt, images}), signal})`. Make it throw `{code, message}` from the server's error. On a 401, throw `{code:'session_expired'}` and show the login screen. Call `progress('Thinking…')` before the request. If you add SSE, call `progress('Writing… N characters')` while it streams.

**Images:** `images` arrive as a `FileList`. Downscale each one client-side to about 1.2 MP JPEG with a canvas, base64 it, and send `{media_type:'image/jpeg', data}`. This keeps uploads small on shared hosting.

### 4.2 `Store` → REST

Replace the `db` branch with fetch calls to section 3. Keep the method names (`init, on, emit, brand, setBrand, saveBrand, deleteBrand, addLog, deleteLog, getDoc, setDoc`) and their behaviour, so no view changes. Use `getDoc('swipes/'+id)` → `GET /api/docs/swipes/:id`. There are no live subscriptions: refetch brands on load and after saves, and refetch logs on brand change and after add/delete. Keep the localStorage branch as an offline fallback only if it's cheap. It's not required.

### 4.3 Carousel download

On a real domain `<a download>` works. Replace `CAP.downloads.save({filename, data: blob})` with `URL.createObjectURL(blob)` + a temporary `<a download="carousel.zip">` click. Keep JSZip, loaded from cdnjs or bundled.

### 4.4 Shell

- Add a login screen (email + password) shown when `/api/me` is 401. Add the user's name and "Sign out" in the top bar.
- Replace the "Claude connected / Scoring tools only" status: connected = logged in.
- Remove the artifact-only bits: `<meta name="claude:viewport-fit-sides">`, `window.claude` checks, the banner about opening the page inside Claude. Add a real `<!doctype html><html lang="en"><head>` with charset, viewport, title, favicon.
- History "Delete" and Brand "Delete" use a two-click confirm. Keep that. Native `confirm()` works now too, but the in-page pattern is fine.

## 5. Auth and accounts

- `users` table, bcrypt hashes (`bcryptjs` on Node, `password_hash()` on PHP). No public sign-up. `scripts/create-user.js` (or `create-user.php` run once over SSH or the browser, then deleted) creates the first admin.
- Sessions: signed httpOnly cookie (`express-session` with a MySQL store, or PHP native sessions). 30-day expiry.
- Admin-only: delete brand. Members: everything else.
- Login rate limit: 5 failed attempts per 15 minutes per IP and email.

## 6. Seed data

`seed/brands.json` has a starter Wootique profile. `scripts/seed.js` inserts it if `brands` is empty.

## 7. Security checklist

- HTTPS only (Hostinger gives free SSL). Set `Secure` cookies and HSTS.
- CSRF: SameSite=Lax cookies + require `Content-Type: application/json` on mutating routes.
- Parameterised SQL everywhere.
- Body size limit: 25 MB on `/api/ask` (images), 1 MB elsewhere.
- Never log prompts or pasted content at info level. Log usage numbers only.
- `.env` outside the web root (PHP: one level above `public_html`), and in `.gitignore`.
- The frontend already renders all Claude output via `textContent`. Keep it that way: no `innerHTML` with model or user text.

## 8. Done means

See `docs/ACCEPTANCE.md`. All of it, on the live domain.
