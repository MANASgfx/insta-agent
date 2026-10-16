"use strict";
// Builds public/ from frontend/src + skills/ (replaces the prototype's build.py).
// The skill texts and the pack's JSON tables are embedded as window.IG_DATA, exactly as before.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "frontend", "src");
const SKILLS = path.join(ROOT, "skills");
const OUT = path.join(ROOT, "public");
const ASSETS = path.join(OUT, "assets");
const read = p => fs.readFileSync(p, "utf8");

const skills = {};
for (const d of fs.readdirSync(SKILLS).sort()) {
  const f = path.join(SKILLS, d, "SKILL.md");
  if (fs.existsSync(f)) skills[d] = read(f);
}
const data = {
  hooks: JSON.parse(read(path.join(SKILLS, "ig-reel/hooks.json"))),
  slop: JSON.parse(read(path.join(SKILLS, "ig-human/slop.json"))),
  rubric: JSON.parse(read(path.join(SKILLS, "ig-profile/rubric.json"))),
  skills,
};
const ORDER = ["igtools.js", "app_core.js", "app_views_create.js", "app_views_grow.js", "app_auth.js", "app_views_tools.js"];
const js = "window.IG_DATA = " + JSON.stringify(data) + ";\n" + ORDER.map(f => `/* ---- ${f} ---- */\n` + read(path.join(SRC, f))).join("\n");
const css = read(path.join(SRC, "app.css")) + `
.main { display: flex; flex-direction: column; gap: 20px; }
.main > .inner { width: 100%; }
#views { display: block; }
`;

// Content hashes in the asset URLs, so a redeploy is picked up at once instead of after the 1-hour asset cache.
const v = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);
const jszip = fs.readFileSync(require.resolve("jszip/dist/jszip.min.js"), "utf8");
const jsOut = js.replace('"/assets/jszip.min.js"', `"/assets/jszip.min.js?v=${v(jszip)}"`);

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2B47D9"/><rect x="16" y="16" width="32" height="32" rx="10" fill="none" stroke="#fff" stroke-width="5"/><circle cx="32" cy="32" r="7" fill="none" stroke="#fff" stroke-width="5"/><circle cx="42.5" cy="21.5" r="2.6" fill="#fff"/></svg>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Digify Instagram Studio</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&family=Schibsted+Grotesk:wght@700;800&display=swap">
<link rel="stylesheet" href="/assets/app.css?v=${v(css)}">
<script src="/assets/app.js?v=${v(jsOut)}" defer></script>
</head>
<body>
<div id="gate"></div>
<div class="app" id="app" hidden>
  <aside id="rail" class="rail" aria-label="Skills"></aside>
  <main class="main">
    <div class="inner"><div class="topbar" id="topbar"></div></div>
    <div id="views"></div>
  </main>
</div>
</body>
</html>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(ASSETS, { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.writeFileSync(path.join(OUT, "favicon.svg"), favicon);
fs.writeFileSync(path.join(ASSETS, "app.js"), jsOut);
fs.writeFileSync(path.join(ASSETS, "app.css"), css);
fs.writeFileSync(path.join(ASSETS, "jszip.min.js"), jszip);
console.log(`Built public/ · app.js ${(Buffer.byteLength(jsOut) / 1024) | 0} KB · ${Object.keys(skills).length} skills`);
