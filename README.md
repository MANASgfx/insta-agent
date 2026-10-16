# Digify Instagram Studio

A private web app for the Digify team. Pick a client brand, use any of the 13 Instagram skills, and Claude writes the draft in that brand's voice. The pack's own scoring tools check every draft in the browser. You copy it and post it yourself: **nothing is ever posted to Instagram by this app.**

| | |
| --- | --- |
| **Create** | Reel (3 scored hooks → script → timed beat sheet), Caption, Carousel (1080×1350 PNG slides as a zip), Stories, Repurpose |
| **Engage** | Comments, Replies, DMs |
| **Grow** | Weekly plan, Profile score, Viral research, Audit |
| **Tools** | Humanizer, Quick checks (hook scorer, beat timer, caption checker: no Claude needed) |
| **Library** | Brand voice (one per client), History, Team & account |

## How it works for the team

- **One login per person.** An admin adds logins on the *Team & account* page. There's no public sign-up.
- **Every brand is shared.** Add each Digify client under *Brand voice → + New brand*. The brand picked at the top is the one every skill writes for. Brand voices, saved history, swipe files and weekly plans are stored on the server, so the whole team sees the same thing.
- **Usage per brand.** Admins see Claude requests, tokens and estimated cost per brand and per person on the *Team & account* page.
- **Cost guard.** Each person is limited to `ASK_PER_MINUTE` and `ASK_PER_DAY` Claude requests.

## Stack

```
browser ── /api (session cookie) ──► Node 22 + Express ──► Claude API (key stays on the server)
                                           └──► MySQL (Hostinger) or SQLite (local)
```

- `frontend/src/`: the dashboard (plain JS, no framework). `npm run build` bundles it with the skill texts into `public/`.
- `server/`: Express API. `lib/anthropic.js` is the only code that talks to Claude (official SDK, streaming; progress is forwarded to the browser as Server-Sent Events).
- `skills/`: the original MIT-licensed [Instagram Agent pack](https://github.com/Jakeschincariol/instagram-agent-skill) by Jake Schincariol. Read-only; the build embeds it.
- Tables are created automatically on start. `db/schema.sql` is for reference.

## Run it locally

```bash
npm install
```

```bash
cp .env.example .env
```

Put your `ANTHROPIC_API_KEY` in `.env`, set `SETUP_TOKEN=anything`, and leave `DB_NAME` empty (uses SQLite in `data/`). Set `NODE_ENV=development`. Then:

```bash
npm run dev
```

Open http://localhost:3000, enter the setup code, and create your admin login.

## Tests

```bash
npm test
```

Runs the engine parity test (the JS scoring tools must match the pack's Python output exactly: `ALL MATCH`) and the API tests (auth, brands, history, docs, the Claude proxy against a fake Claude server, rate limits, cancel).

The browser click-through (all 13 skills, desktop and phone, light and dark) needs Playwright:

```bash
pip install playwright && python3 -m playwright install chromium
```

```bash
npm run test:browser
```

## Deploy

See **[docs/DEPLOY_HOSTINGER.md](docs/DEPLOY_HOSTINGER.md)**. Short version: push this repo to GitHub, add it as a Node.js web app in hPanel (Express, entry `server/index.js`, build script `build`), create a MySQL database, set the environment variables, open the site and create the first admin.

## Ground rules (keep these)

- The Anthropic API key lives only in the server's environment. Never in the frontend, the repo, or logs.
- No posting, scheduling, scraping or auto-DM features. They break Instagram's terms. The skills write, people post.
- `frontend/src/igtools.js` is a verified port of the pack's Python tools. Run `npm run test:parity` before and after touching it.
- Model output is rendered with `textContent` only. Never `innerHTML` with model or user text.
- Keep `skills/LICENSE` and the credit to Jake Schincariol in the app.
