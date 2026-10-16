# Acceptance checklist

Local status as of the first build (2026-10-16). Re-tick the "live" column after deploying.

| check | local | live |
| --- | --- | --- |
| **Engine** | | |
| `npm run test:parity` prints `ALL MATCH` | ✅ | n/a |
| **Backend** (`npm run test:api`, 11 tests) | | |
| Every route except login/setup/health returns 401 without a session | ✅ | |
| First-run setup creates exactly one admin, then locks | ✅ | |
| Bad login → `bad_login`; 5 failures in 15 min → `rate_limited` | ✅ (first part) | |
| Non-JSON POSTs rejected (CSRF guard) | ✅ | |
| Brands, history and docs are shared between two users; members can't delete brands | ✅ | |
| `/api/ask` streams progress and returns parsed JSON (fenced JSON, image + text blocks) | ✅ fake Claude | |
| Bad answer → `invalid_json`, refusal → `refused`, upstream 429 → `rate_limited`, too long → `prompt_too_large`, bad image → `image_rejected` | ✅ fake Claude | |
| Over the per-user limit → `rate_limited` | ✅ | |
| Stop cancels upstream and logs `cancelled` | ✅ | |
| `usage_log` row per call with tokens and brand | ✅ | |
| Changing a password signs out other sessions | ✅ | |
| API key never in `public/` | ✅ | |
| `/api/ask` returns parsed JSON for all 13 skills against the **real** Claude API | not run (no key locally) | |
| MySQL driver against Hostinger's MySQL/MariaDB | not run (no MySQL locally; SQLite tested) | |
| **Frontend** (checked in a real browser against the real server, Claude stubbed) | | |
| First-run setup screen → admin created → app loads with seeded Wootique | ✅ | |
| Missing API key shows "Claude isn't set up on the server yet" | ✅ | |
| Reel: 3 scored hooks → script → beat sheet → Save to history (row on server) | ✅ | |
| Carousel, Stories, Comments, Replies, DMs, Plan, Profile, Repurpose render with no errors | ✅ | |
| Weekly plan saves to the server | ✅ | |
| Carousel zip: `<brand>-carousel.zip`, 6 × 1080×1350 PNG + caption.txt | ✅ | |
| Team & account: team list, add login, usage per brand and person | ✅ | |
| No horizontal scroll at 375 px (home, account, reel, carousel, brand, checks, history) | ✅ | |
| Sign out returns to the sign-in screen | ✅ | |
| Full Playwright click-through `npm run test:browser` (13 skills, desktop + phone dark) | not run (Chromium not installed here) | |
| **Deploy** | | |
| HTTPS on the domain, HTTP redirects to HTTPS | | |
| A 60-second Claude call doesn't time out on the host | | |
| `docs/DEPLOY_HOSTINGER.md` matches what was actually done | | |
