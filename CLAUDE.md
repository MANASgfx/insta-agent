# Digify Instagram Studio: notes for Claude Code

Multi-brand web app for the Digify agency (Mumbai; owner Manas). Always write the agency name as "Digify". Deployed on Hostinger Business as a Node.js web app from GitHub (see docs/DEPLOY_HOSTINGER.md).

## Layout
- `frontend/src/`: plain-JS dashboard. `app_core.js` holds the API layer (`api`, `askJSON`, `Store`), `app_auth.js` the sign-in gate and Team page, `app_views_*.js` the 13 skill views, `igtools.js` the scoring engine.
- `server/`: Express. `lib/anthropic.js` is the only Claude caller; `routes/ask.js` streams SSE; `lib/db.js` runs on MySQL (prod) or `node:sqlite` (dev/tests).
- `scripts/build-frontend.js` bundles `frontend/src` + `skills/` into `public/` (gitignored).

## Rules
- Don't refactor `frontend/src/igtools.js`. `npm run test:parity` must print `ALL MATCH` before and after any change near it.
- Views depend on `askJSON` returning a parsed object or throwing an Error with `.code` from `ERR_COPY`. Keep that contract; map new server errors onto those codes.
- API key only in server env. Never in frontend, repo or logs. Don't log prompts or pasted content.
- No posting, scheduling, scraping or auto-DM features (Instagram terms).
- Render model/user text with `textContent`, never `innerHTML`.
- `skills/` is the MIT pack by Jake Schincariol: read-only, keep `skills/LICENSE` and the in-app credit.

## Commands
- `npm run dev` (needs `.env` with `NODE_ENV=development`), `npm test`, `npm run test:browser`
