# Deploying to Hostinger

Written for Digify's account: the **Business** plan that already hosts `digify.marketing` and the `crm.digify.marketing` Node.js app (hosting user `u172665074`). This app deploys the same way the CRM does: GitHub repo → hPanel Node.js web app → auto-redeploy on every push to `main`.

Suggested address: **`studio.digify.marketing`**. Any subdomain works.

## Status of the live setup (2026-10-16)

Done through the Hostinger API:

- Website **`studio.digify.marketing`** created on the Business plan with `digify.marketing` (order 1009737284, user `u172665074`).
- MySQL database **`u172665074_igstudio`** (user `u172665074_igstudio`) created with a platform-generated password. Hostinger wrote `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` and `DATABASE_URL` into the app's environment. (`DB_HOST` is `localhost`; the app maps that to `127.0.0.1`.)
- Environment variables set: `NODE_ENV=production`, `SESSION_SECRET` (random), `CLAUDE_MODEL=claude-sonnet-5-5`, `ASK_PER_MINUTE=6`, `ASK_PER_DAY=150`.
- Build settings stored: Express, Node 22, entry `server/index.js`, build script `build`, npm.

Still to do by hand: push the repo and give Hostinger's GitHub app access to it, connect it as the app's Git source and run the first build, add `ANTHROPIC_API_KEY` and `SETUP_TOKEN` in hPanel, then sections 4–5 below. Add variables **in hPanel**, one by one: don't use an API "replace all variables" call, which would delete the database password.

## 0. Before you start

1. **Anthropic API key.** Go to https://platform.claude.com › Settings › API keys and create a key named `digify-instagram-studio`. Under Billing, add credit and **set a monthly spend limit**. This is billed per use, separately from any Claude subscription.
2. **A GitHub repo.** Create a **private** repo, e.g. `MANASgfx/digify-instagram-studio`, and push this folder to it:

   ```bash
   git remote add origin git@github.com:MANASgfx/digify-instagram-studio.git
   ```

   ```bash
   git push -u origin main
   ```

   Hostinger's GitHub app is already installed on the `MANASgfx` account (the CRM uses it). If the new repo doesn't show up in step 2, give the app access to it in GitHub › Settings › Applications › Hostinger › Configure.

## 1. Database

hPanel › Websites › `digify.marketing` › Databases › MySQL Databases:

- Create a database, e.g. `u172665074_studio`, and a user, e.g. `u172665074_studio`, with a strong password.
- Note the database name, user and password. The host for the app is **`127.0.0.1`** (not the `srvNNNN.hstgr.io` address, which is only for connecting from outside Hostinger).
- You don't need to run any SQL. The app creates its tables on first start.

## 2. Create the Node.js app

hPanel › Websites › **Add website** › **Node.js Web App** › choose the Business plan that has `digify.marketing` › **Import Git repository** › pick `digify-instagram-studio`, branch `main`.

Build settings (same shape as the CRM's):

| setting | value |
| --- | --- |
| Framework / app type | **Express** |
| Node.js version | **22** |
| Entry file | **`server/index.js`** |
| Build script | **`build`** (runs `npm run build`) |
| Package manager | npm |
| Root directory | leave empty |

Domain: choose **`studio.digify.marketing`** (hPanel creates the subdomain). Turn on SSL when offered, or later in hPanel › Security › SSL.

## 3. Environment variables

In the app's **Environment variables** section, add:

| name | value |
| --- | --- |
| `ANTHROPIC_API_KEY` | the key from step 0 |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` |
| `DB_HOST` | `127.0.0.1` |
| `DB_NAME` | from step 1 |
| `DB_USER` | from step 1 |
| `DB_PASSWORD` | from step 1 |
| `SESSION_SECRET` | a long random string (run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `SETUP_TOKEN` | any one-time code you choose, e.g. 6 random words |
| `ASK_PER_MINUTE` | `6` |
| `ASK_PER_DAY` | `150` |
| `NODE_ENV` | `production` |

Save, then **Redeploy** (or push any commit) so the app restarts with them.

## 4. First login

1. Open `https://studio.digify.marketing`. Because there are no users yet, it shows **First-time setup**.
2. Enter the `SETUP_TOKEN` code, your name, email and a password (10+ characters). That creates the first **admin** and signs you in.
3. Delete `SETUP_TOKEN` from the environment variables. It stops working once any user exists anyway, but there's no reason to keep it.

No shell needed. (If you do have SSH: `npm run create-user -- you@digify.marketing "Manas" admin` from the app folder does the same.)

## 5. Set it up for the team

1. **Team & account › Add someone**: add your social media person as a **Member** with a starting password. Send it to them privately; they can change it on the same page.
2. **Brand voice**: Wootique is pre-loaded as a starter. For each client brand, pick **+ New brand**, fill in the fields (or paste three real captions into *Fill it from your own posts*), and save. Slide colours here are what the Carousel uses.
3. Run one Reel end to end on a real brand and check *Team & account › Claude usage* shows the request.

## Redeploys

Every push to `main` rebuilds and restarts the app automatically. Don't edit files on the server; they're replaced on each deploy. Brands, history and logins live in MySQL and survive redeploys.

## If something goes wrong

- **The page says "The frontend isn't built yet"**: the build script didn't run. The server also builds on start if `public/` is missing, so redeploying usually fixes it. Check hPanel's build logs.
- **"Claude isn't set up on the server yet"**: `ANTHROPIC_API_KEY` is missing or wrong. Fix it and redeploy.
- **Login works but every save fails / the app won't start**: check `DB_*` values and that `DB_HOST` is `127.0.0.1`. The app's runtime log in hPanel shows the exact error.
- **Long Reels time out**: the app streams progress, which keeps the connection alive. If Hostinger still cuts requests, check the app's runtime logs for the duration and contact Hostinger support about the proxy timeout for Node.js apps.

## What it costs to run

Hosting: nothing extra (it runs on the existing Business plan). Claude: per request. A Reel is two requests of roughly 6–8K input and 1–2K output tokens each, roughly $0.05–0.10 per Reel on Sonnet 5.5 at $2/$10 per million tokens (thinking tokens count as output). The *Claude usage* panel shows estimates per brand; the Anthropic console has the real bill. Check current prices at https://platform.claude.com/docs/en/about-claude/pricing.
