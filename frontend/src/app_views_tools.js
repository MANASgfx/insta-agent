"use strict";
/* ===== Tools: Humanizer, Quick checks · Brand voice · History · Studio home · shell ===== */

// ---------------- /ig-human ----------------
function viewHuman(root) {
  const draft = area("hu-draft", { class: "tall", placeholder: "Paste any caption, script, comment or DM." });
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const ex = h("button", { class: "btn sm ghost", type: "button", onclick: () => { draft.value = "In today’s fast-paced world, it’s crucial to leverage robust craftsmanship — truly a testament to quality. Stop scrolling! The result?\nIt's not just a table, it's a lifestyle.\n🚀 Solid wood\n✨ Hand finished\n🎯 Built to last\nFollow for more and tag someone who needs this… #furniture #wood #decor #home #interior #viral"; } }, "Load a bad example");
  let lastClean = "", lastBefore = null;
  const run = runner("Clean it and score it", async () => {
    if (!draft.value.trim()) throw new Error("Paste a draft first.");
    paint(draft.value);
  }, { needsClaude: false });
  function paint(raw) {
    clear(out);
    const before = T.detect(raw, LEX); const hum = T.humanize(raw, LEX); const clean = hum.text.trim();
    lastClean = clean; lastBefore = before;
    const det = h("div"); det.append(detectPanel(T.detect(clean, LEX), before));
    const ed = editableBlock("Cleaned draft (edit to re-score)", clean, t => { lastClean = t; clear(det).append(detectPanel(T.detect(t, LEX), before)); });
    out.append(ed.el, det, humanReport(hum.report), rewrite.el, rewriteOut);
  }
  const rewriteOut = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const rewrite = runner("Rewrite the flagged shapes with Claude", async ({ signal, progress }) => {
    const rep = T.humanize(lastClean, LEX).report; const det = T.detect(lastClean, LEX);
    const flags = [...rep.structures.map(s => `${s.name}: ${s.fix}`), `Weakest check: ${det.weakest} (${det.checks[det.weakest].detail})`];
    const o = await askJSON("ig-human", [`<task>\nStep 2 of the order of operations: rewrite the flagged lines by hand, keeping the meaning and the facts. Change only what the flags point at; leave everything else as it is. Don't add facts.\n<pasted>\n${lastClean}\n</pasted>\nFlags:\n- ${flags.join("\n- ")}\n</task>`], `{"text":"the full rewritten draft"}`, { signal, progress });
    const t2 = T.humanize(str(o.text), LEX).text.trim();
    clear(rewriteOut).append(h("h2", {}, "Rewritten"), copyBlock("Rewritten draft", t2), detectPanel(T.detect(t2, LEX), lastBefore));
  });
  root.append(h("div", { class: "panel" }, field("Draft", draft), h("div", { class: "row" }, run.el, ex)), out);
  return {};
}

// ---------------- quick checks (local) ----------------
function viewChecks(root) {
  const hooks = area("qc-hooks", { value: "Hey guys, today I want to show you our new dining table\nNobody tells you solid teak moves with every Mumbai monsoon\nWe lost {{₹ amount}} on one table because of a missing clause" });
  const hooksOut = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
  const paintHooks = () => { clear(hooksOut).append(...T.rankHooks(hooks.value.split("\n")).map(s => hookResult(s))); };
  hooks.addEventListener("input", debounce(paintHooks, 250));
  const script = area("qc-script", { class: "tall", placeholder: "One beat per line." });
  const target = input("qc-target", { type: "number", value: "30" });
  const wpm = input("qc-wpm", { type: "number", value: String(wpmOf()) });
  const beatsOut = h("div");
  const paintBeats = () => { const s = T.beatSheet(script.value, Number(wpm.value) || 165, Number(target.value) || null); clear(beatsOut).append(s ? beatTable(s) : h("p", { class: "small muted" }, "Paste a script to time it.")); };
  [script, target, wpm].forEach(x => x.addEventListener("input", debounce(paintBeats, 250)));
  const cap = area("qc-cap", { class: "tall", placeholder: "Paste a caption." });
  const kws = input("qc-kws", { placeholder: "search terms, comma-separated" });
  const capOut = h("div");
  const paintCap = () => { clear(capOut).append(cap.value.trim() ? captionPanel(cap.value, kws.value.split(",")) : h("p", { class: "small muted" }, "Paste a caption to lint it.")); };
  [cap, kws].forEach(x => x.addEventListener("input", debounce(paintCap, 250)));
  root.append(
    h("div", { class: "panel" }, h("div", { class: "grouphead" }, h("h2", {}, "Hook scorer"), h("span", { class: "small muted" }, "Catches weak hooks well. Can't pick between two decent ones: trust your retention graph for that.")), field("One hook per line", hooks, "Three examples are loaded so you can see the scoring. Replace them with yours."), hooksOut),
    h("div", { class: "panel" }, h("h2", {}, "Beat timer"), field("Script", script), h("div", { class: "cols" }, field("Target seconds", target), field("Words per minute", wpm)), beatsOut),
    h("div", { class: "panel" }, h("h2", {}, "Caption checker"), field("Caption", cap), field("Search terms", kws), capOut));
  paintHooks(); paintBeats(); paintCap();
  return {};
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------------- brand voice ----------------
function viewBrand(root) {
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  root.append(body);
  let editing = null; let controls = {};
  function paint() {
    const b = editing || Store.brand() || { name: "" };
    clear(body); controls = {};
    const pick = select("bv-pick", [...Store.brands.map(x => [x.id, x.name || x.id]), ["__new", "+ New brand"]], editing && !editing.id ? "__new" : (b.id || "__new"));
    pick.addEventListener("change", () => { if (pick.value === "__new") { editing = { name: "" }; } else { editing = null; Store.setBrand(pick.value); } paint(); });
    const grid = h("div", { class: "cols" });
    for (const [k, label, type, extra] of VOICE_FIELDS) {
      let c;
      if (type === "textarea") c = area("bv-" + k, { value: b[k] || "" });
      else if (type === "select") c = select("bv-" + k, extra, b[k] || extra[0]);
      else if (type === "number") c = input("bv-" + k, { type: "number", value: b[k] || "" });
      else if (type === "color") c = h("input", { id: "bv-" + k, type: "color", value: b[k] || { slideBg: "#F7F6F2", slideInk: "#16201C", slideAccent: "#2B47D9" }[k] });
      else c = input("bv-" + k, { value: b[k] || "" });
      controls[k] = c;
      const wide = type === "textarea";
      const f = field(label, c, type !== "select" ? extra : null);
      if (wide) f.style.gridColumn = "1 / -1";
      grid.append(f);
    }
    const status = h("span", { class: "run-status" });
    const save = h("button", { class: "btn primary", type: "button" }, "Save brand voice");
    save.onclick = async () => {
      const data = { ...(editing || Store.brand() || {}) };
      for (const [k, , type] of VOICE_FIELDS) data[k] = type === "number" ? (controls[k].value ? Number(controls[k].value) : "") : controls[k].value;
      if (!String(data.name || "").trim()) { status.textContent = "Give the brand a name first."; return; }
      save.disabled = true; status.textContent = "Saving…";
      try { const id = await Store.saveBrand(data); editing = null; Store.setBrand(id); status.textContent = "Saved."; }
      catch (e) { status.textContent = "Couldn't save. " + (e && e.message ? e.message : ""); }
      finally { save.disabled = false; }
    };
    let delArmed = false;
    const del = h("button", { class: "btn ghost", type: "button", hidden: !b.id || !Auth.isAdmin() }, "Delete brand");
    del.onclick = async () => { if (!delArmed) { delArmed = true; del.textContent = "Click again to delete"; return; } try { await Store.deleteBrand(b.id); editing = null; paint(); } catch (e) { status.textContent = errText(e); } };
    const samples = area("bv-fill", { class: "tall", placeholder: "Paste three of your own captions or reel transcripts, the ones that sound most like you." });
    const fill = runner("Fill the voice from these", async ({ signal, progress }) => {
      if (samples.value.trim().length < 120) throw new Error("Paste at least three real captions or transcripts.");
      const o = await askJSON("ig-reel", [`<task>\nRead these samples of the brand's own captions or spoken reels and infer its voice profile. Only describe what the samples show; leave a field empty if they don't show it. Never invent proof, numbers or positions.\n<pasted>\n${samples.value}\n</pasted>\n</task>`],
        `{"onCamera":"","delivery":"","language":"","wordsUse":"","wordsNever":"","swear":"no|mild|yes","emoji":"never|one, rarely|freely","positions":"","notes":"anything else about how they talk"}`, { signal, progress });
      for (const k of ["onCamera", "delivery", "language", "wordsUse", "wordsNever", "positions", "notes"]) if (o[k] && controls[k] && !controls[k].value.trim()) controls[k].value = str(o[k]);
      for (const k of ["swear", "emoji"]) if (o[k] && controls[k]) { const v = str(o[k]); if ([...controls[k].options].some(op => op.value === v)) controls[k].value = v; }
      if (controls.samples && !controls.samples.value.trim()) controls.samples.value = samples.value;
      fillMsg.textContent = "Filled the empty fields from your samples. Check them, then save.";
    });
    const fillMsg = h("p", { class: "small", "aria-live": "polite" });
    body.append(
      h("div", { class: "panel" }, h("div", { class: "row" }, field("Brand", pick), h("div", { class: "meter" }, bar(voiceCompleteness(b)), h("span", { class: "mono small" }, voiceCompleteness(b) + "% filled"))),
        h("p", { class: "small muted" }, "Brand voices are shared with the whole Digify team. Every skill writes in the voice of the brand picked at the top.")),
      h("div", { class: "panel" }, h("h3", {}, "Fill it from your own posts"), h("p", { class: "small muted" }, "Faster and more accurate than guessing at the answers."), samples, fill.el, fillMsg),
      h("div", { class: "panel" }, grid, h("div", { class: "row" }, save, del, status)));
  }
  let sig = "";
  const sigOf = () => Store.brandId + "|" + Store.brands.map(x => x.id + ":" + (x.updatedAt || 0)).join(",");
  Store.on(() => { const s2 = sigOf(); if (s2 === sig) return; sig = s2; if (!editing) paint(); });
  sig = sigOf(); paint();
  return { onShow() { if (!editing) { sig = sigOf(); paint(); } } };
}

// ---------------- history ----------------
const SKILL_NAMES = { "ig-reel": "Reel", "ig-caption": "Caption", "ig-carousel": "Carousel", "ig-story": "Stories", "ig-repurpose": "Repurpose", "ig-comment": "Comment", "ig-reply": "Replies", "ig-dm": "DM", "ig-plan": "Plan", "ig-profile": "Profile", "ig-viral": "Viral", "ig-audit": "Audit", "ig-human": "Humanizer" };
function historyList(list) {
  if (!list.length) return h("div", { class: "empty" }, "Nothing saved yet. Every result has a Save to history button. Saved Reels record their hook formula, so the audit and the weekly plan can learn from them.");
  return h("div", { class: "hist" }, list.map(l => {
    let armed = false;
    const del = h("button", { class: "btn sm ghost", type: "button" }, "Delete");
    del.onclick = async () => { if (!armed) { armed = true; del.textContent = "Click again to delete"; return; } await Store.deleteLog(l.id); };
    return h("details", {}, h("summary", {}, pill(SKILL_NAMES[l.skill] || l.skill, "plain"), h("span", { style: { flex: "1", minWidth: "0" } }, str(l.title).slice(0, 140)), l.formula ? h("span", { class: "small muted" }, formulaLabel(l.formula)) : null, h("span", { class: "when" }, new Date(l.createdAt).toLocaleString())),
      h("div", { class: "body" }, copyBlock("Saved text", str(l.body)), h("div", { class: "row" }, del)));
  }));
}
function viewHistory(root) {
  const body = h("div");
  const paint = () => clear(body).append(historyList(Store.logs));
  Store.on(paint); paint();
  root.append(body);
  return { onShow: paint };
}

// ---------------- studio home ----------------
function viewHome(root) {
  const top = h("div", { class: "cols" });
  const recent = h("div");
  function paint() {
    const b = Store.brand();
    clear(top).append(
      h("div", { class: "panel" }, h("span", { class: "field-label muted" }, "Brand voice"),
        b ? [h("h2", {}, b.name), h("p", { class: "small muted" }, str(b.whatIDo) || "No one-line description yet."), h("div", { class: "meter" }, bar(voiceCompleteness(b)), h("span", { class: "mono small" }, voiceCompleteness(b) + "% filled")),
          voiceCompleteness(b) < 70 ? h("p", { class: "small" }, "Every skill reads this. Ten minutes here is the difference between scripts you shoot and scripts you rewrite.") : null]
          : [h("h2", {}, "No brand yet"), h("p", { class: "small muted" }, "Add your brand's voice first. Every skill reads it.")],
        h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => goTo("brand") }, b ? "Edit brand voice" : "Add a brand"))),
      h("div", { class: "panel" }, h("span", { class: "field-label muted" }, "How this works"),
        h("ol", { class: "steps" }, h("li", {}, "Pick a skill on the left and fill in the form."), h("li", {}, "Claude writes the draft in your brand's voice."), h("li", {}, "The pack's own tools score it right here: hook strength, timing, caption cut, AI tells."), h("li", {}, "You copy it and post it yourself. Nothing is ever posted for you.")),
        h("p", { class: "small muted" }, "Pick the brand at the top first. Every skill writes in that brand's voice.")));
    clear(recent).append(h("div", { class: "grouphead" }, h("h2", {}, "Recent"), Store.logs.length ? h("button", { class: "btn sm ghost", type: "button", onclick: () => goTo("history") }, "All history →") : null), historyList(Store.logs.slice(0, 3)));
  }
  const groups = NAV.filter(g => g.tiles);
  root.append(top,
    ...groups.map(g => h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, h("h2", {}, g.label),
      h("div", { class: "tiles" }, g.items.map(v => h("button", { class: "tile", type: "button", onclick: () => goTo(v.id) }, h("code", {}, "/" + v.cmd), h("b", {}, v.title), h("span", {}, v.blurb)))))),
    recent);
  Store.on(paint); paint();
  return { onShow: paint };
}

// ---------------- shell ----------------
const NAV = [
  { label: "Studio", items: [{ id: "home", cmd: "studio", title: "Home", blurb: "", build: viewHome }] },
  { label: "Create", tiles: true, items: [
    { id: "reel", cmd: "ig-reel", title: "Reel", blurb: "One idea into three scored hooks, a script and a timed beat sheet.", build: viewReel },
    { id: "caption", cmd: "ig-caption", title: "Caption", blurb: "The caption, linted against the 125-character feed cut.", build: viewCaption },
    { id: "carousel", cmd: "ig-carousel", title: "Carousel", blurb: "Slide copy plus 1080×1350 slides you can download.", build: viewCarousel },
    { id: "story", cmd: "ig-story", title: "Stories", blurb: "Today's frames, which sticker goes where, and the DM funnel.", build: viewStory },
    { id: "repurpose", cmd: "ig-repurpose", title: "Repurpose", blurb: "One video, podcast or article into a week of posts.", build: viewRepurpose }] },
  { label: "Engage", tiles: true, items: [
    { id: "comment", cmd: "ig-comment", title: "Comments", blurb: "Comments on other people's posts that read like a person.", build: viewComment },
    { id: "reply", cmd: "ig-reply", title: "Replies", blurb: "Sort the comments under your post and answer the ones that matter.", build: viewReply },
    { id: "dm", cmd: "ig-dm", title: "DMs", blurb: "Keyword delivery, first message, collab pitch, two follow-ups.", build: viewDM }] },
  { label: "Grow", tiles: true, items: [
    { id: "plan", cmd: "ig-plan", title: "Weekly plan", blurb: "What to post, when, and the ten accounts to engage with.", build: viewPlan },
    { id: "profile", cmd: "ig-profile", title: "Profile score", blurb: "Your profile out of 100, then the rewrites, fix-first.", build: viewProfile },
    { id: "viral", cmd: "ig-viral", title: "Viral research", blurb: "Rank reels in your niche by how far each beat its own account.", build: viewViral },
    { id: "audit", cmd: "ig-audit", title: "Audit", blurb: "What actually worked in your last posts, and what to stop.", build: viewAudit }] },
  { label: "Tools", tiles: true, items: [
    { id: "human", cmd: "ig-human", title: "Humanizer", blurb: "Strip AI tells from any draft and score it on five checks.", build: viewHuman },
    { id: "checks", cmd: "checks", title: "Quick checks", blurb: "Hook scorer, beat timer and caption checker. No Claude needed.", build: viewChecks }] },
  { label: "Library", items: [
    { id: "brand", cmd: "voice", title: "Brand voice", blurb: "", build: viewBrand },
    { id: "history", cmd: "history", title: "History", blurb: "", build: viewHistory },
    { id: "account", cmd: "team", title: "Team & account", blurb: "Your password, the team's logins, and Claude usage per brand.", build: viewAccount }] },
];
const VIEWS = Object.fromEntries(NAV.flatMap(g => g.items).map(v => [v.id, v]));
const BUILT = {};

function show(id) {
  if (!VIEWS[id]) id = "home";
  const v = VIEWS[id];
  for (const [k, b] of Object.entries(BUILT)) b.el.hidden = k !== id;
  if (!BUILT[id]) {
    const el = h("section", { class: "inner", "aria-labelledby": "vh-" + id });
    el.append(h("div", { class: "viewhead" }, v.id !== "home" ? h("span", { class: "cmd" }, "/" + v.cmd) : null, h("h1", { id: "vh-" + id }, v.id === "home" ? "Digify Instagram Studio" : v.title),
      v.id === "home" ? h("p", {}, "The thirteen skills from the Instagram Agent pack in one place. Claude writes in your brand's voice, the pack's scoring tools check it here, and you post it.") : v.blurb ? h("p", {}, v.blurb) : null));
    const ctl = v.build(el) || {};
    $("#views").append(el);
    BUILT[id] = { el, ctl };
  }
  for (const b of document.querySelectorAll(".navbtn")) b.setAttribute("aria-current", b.dataset.view === id ? "page" : "false");
  const c = BUILT[id].ctl; if (c.onShow) c.onShow();
  try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ }
}

function buildShell() {
  const rail = $("#rail");
  rail.append(h("div", { class: "wordmark" }, h("b", {}, "Digify Instagram Studio"), h("span", {}, "13 skills · you post")));
  for (const g of NAV) rail.append(h("nav", { class: "navgroup", "aria-label": g.label }, h("span", { class: "navlabel" }, g.label),
    g.items.map(v => h("button", { class: "navbtn", type: "button", "data-view": v.id, onclick: () => goTo(v.id) }, h("span", {}, v.title), h("code", {}, "/" + v.cmd)))));
  const pick = h("select", { id: "brand-select", "aria-label": "Brand" });
  const paintPick = () => {
    clear(pick);
    if (!Store.brands.length) pick.append(h("option", { value: "" }, "No brand yet"));
    for (const b of Store.brands) pick.append(h("option", { value: b.id, selected: b.id === Store.brandId ? true : null }, b.name || b.id));
  };
  pick.addEventListener("change", () => Store.setBrand(pick.value));
  Store.on(paintPick); paintPick();
  rail.append(h("p", { class: "credit small muted" }, "Skills from the MIT-licensed ", h("a", { href: "https://github.com/Jakeschincariol/instagram-agent-skill", target: "_blank", rel: "noopener" }, "Instagram Agent pack"), " by Jake Schincariol."));
  const status = h("span", { class: "status" }, h("span", { class: "dot on" }), Auth.user.name,
    h("button", { class: "btn sm ghost", type: "button", onclick: () => Auth.signOut() }, "Sign out"));
  $("#topbar").append(h("div", { class: "brandpick" }, h("span", { class: "small muted" }, "Writing for"), pick, h("button", { class: "btn sm ghost", type: "button", onclick: () => goTo("brand") }, "Voice")), status);
}

async function boot() {
  await initCaps();
  try { await Store.init(); }
  catch (e) { $("#views").append(h("div", { class: "inner" }, h("div", { class: "banner" }, "Couldn't load your brands: " + errText(e) + " Reload the page to try again."))); }
  buildShell();
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || "home");
}
Auth.start(boot);
