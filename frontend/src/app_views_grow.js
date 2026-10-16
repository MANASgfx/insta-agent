"use strict";
/* ===== Engage: Comments, Replies, DMs · Grow: Plan, Profile, Viral, Audit ===== */
const BAD_OPENERS = /^(great post|love this|so true|this 👏|needed this|amazing|wow|nice|awesome)/i;
function commentFlags(t) {
  const f = [];
  if (BAD_OPENERS.test(t.trim())) f.push("Opens with a stock compliment. Those are invisible.");
  if (/^\p{Extended_Pictographic}/u.test(t.trim())) f.push("Starts with an emoji.");
  const sents = (t.match(/[^.!?]+[.!?]*/g) || []).filter(s => s.trim().split(/\s+/).length > 1).length;
  if (sents > 3) f.push(`${sents} sentences. One to three reads in a narrow column.`);
  if (/https?:\/\/|link in (my )?bio|check out my/i.test(t)) f.push("Pitches or links. Never in a comment.");
  return f;
}

// ---------------- /ig-comment ----------------
function viewComment(root) {
  const acct = input("cm-acct", { placeholder: "@account" });
  const post = area("cm-post", { class: "tall", placeholder: "Paste the post or reel text. For a batch, separate posts with a line containing only ---" });
  const angle = area("cm-angle", { placeholder: "Optional. Your experience or a number you could add. e.g. We switched to oil finish in 2023 and returns dropped." });
  const shots = imagePicker("cm-shots", "Screenshots of the post");
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const r = runner("Write comments", async ({ signal, progress }) => {
    if (!post.value.trim() && !shots.files()) throw new Error("Paste the post, or add a screenshot.");
    const o = await askJSON("ig-comment", [`<task>\nFor each post, give two comment options of different types (from the nine), and say which to post and why. If several posts are given, return one item per post.\n<pasted>\nAccount: ${acct.value || "(not given)"}\n${post.value}\n</pasted>\n<user_input>\nMy angle or experience: ${angle.value || "(none given; do not invent one)"}\n</user_input>\n</task>`],
      `{"items":[{"account":"@acct","post_summary":"6 words","options":[{"type_no":6,"type_name":"Receipt","text":"..."},{"type_no":3,"type_name":"Respectful disagree","text":"..."}],"pick":0,"why":"one line"}]}`, { signal, progress, images: shots.files() });
    clear(out);
    for (const it of (Array.isArray(o.items) ? o.items : [])) {
      out.append(h("div", { class: "panel" }, h("div", { class: "row" }, h("h3", {}, str(it.account) || "Post"), h("span", { class: "small muted" }, str(it.post_summary))),
        (Array.isArray(it.options) ? it.options : []).map((op, i) => {
          const t = T.humanize(str(op.text), LEX).text.trim(); const fl = commentFlags(t);
          return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            h("div", { class: "row" }, pill(`${op.type_no || "?"} · ${str(op.type_name).toUpperCase()}`, Number(it.pick) === i ? "info" : "plain"), Number(it.pick) === i ? h("span", { class: "small" }, "Post this one") : null, h("span", { class: "small muted mono" }, `${t.length} chars`)),
            copyBlock("Comment", t), ...fl.map(x => h("div", { class: "flag" }, x)));
        }),
        it.why ? h("p", { class: "small muted" }, str(it.why)) : null));
    }
    if (!out.children.length) out.append(h("p", { class: "muted" }, "Nothing came back. Press the button again."));
  });
  root.append(h("div", { class: "panel" }, h("div", { class: "cols" }, field("Account", acct), field("Your angle", angle)), field("The post", post), shots.el, r.el), out);
  return {};
}

// ---------------- /ig-reply ----------------
const BUCKETS = ["KEYWORD", "LEAD", "SUBSTANCE", "QUESTION", "SUPPORT", "NOISE"];
const BUCKET_CLS = { KEYWORD: "info", LEAD: "pass", SUBSTANCE: "pass", QUESTION: "warn", SUPPORT: "plain", NOISE: "fail" };
function viewReply(root) {
  const about = input("rp-about", { placeholder: "What the post was about, in one line" });
  const kw = input("rp-kw", { placeholder: "Keyword you asked for, if any" });
  const comments = area("rp-comments", { class: "tall", placeholder: "@handle: their comment\n@handle: their comment" });
  const shots = imagePicker("rp-shots", "Screenshots of the comments");
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const r = runner("Sort and reply", async ({ signal, progress }) => {
    if (!comments.value.trim() && !shots.files()) throw new Error("Paste the comments, or add screenshots.");
    const o = await askJSON("ig-reply", [`<task>\nTriage every comment into the six buckets, then write replies in bucket order. SUPPORT gets 3 to 8 words. NOISE gets no reply (empty string). Flag QUESTIONs that deserve a reply Reel with a hook line.\nPost: ${about.value || "(not given)"}\nKeyword asked for: ${kw.value || "(none)"}\n<pasted>\n${comments.value}\n</pasted>\n</task>`],
      `{"groups":[{"bucket":"KEYWORD|LEAD|SUBSTANCE|QUESTION|SUPPORT|NOISE","items":[{"handle":"@x","comment":"their words","reply":"your reply, or empty","reel_hook":"only for QUESTION worth a Reel, else empty"}]}],"keyword_note":"what to send keyword commenters, or empty"}`, { signal, progress, images: shots.files() });
    clear(out);
    const groups = (Array.isArray(o.groups) ? o.groups : []).map(g => ({ bucket: str(g.bucket).toUpperCase(), items: Array.isArray(g.items) ? g.items : [] }));
    groups.sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket));
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    out.append(h("div", { class: "row" }, h("h2", {}, `${total} comments`), groups.map(g => pill(`${g.items.length} ${g.bucket}`, BUCKET_CLS[g.bucket] || "plain"))));
    if (o.keyword_note) out.append(h("div", { class: "note" }, pill("KEYWORD", "info"), h("span", {}, str(o.keyword_note))));
    for (const g of groups) {
      out.append(h("div", { class: "panel" }, h("div", { class: "row" }, pill(g.bucket, BUCKET_CLS[g.bucket] || "plain"), h("span", { class: "small muted" }, `${g.items.length}`)),
        g.items.map(it => {
          const rep = it.reply ? T.humanize(str(it.reply), LEX).text.trim() : "";
          return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid var(--line)", paddingTop: "10px" } },
            h("div", { class: "small" }, h("b", {}, str(it.handle)), " ", h("span", { class: "muted" }, "“" + str(it.comment) + "”")),
            rep ? h("div", { class: "row" }, h("span", { style: { flex: "1", minWidth: "0" } }, rep), copyBtn(rep)) : h("span", { class: "small muted" }, g.bucket === "NOISE" ? "Skip. A reply gives them reach." : "No reply needed."),
            it.reel_hook ? h("div", { class: "row" }, pill("REEL #16", "warn"), h("span", { class: "small" }, str(it.reel_hook)), h("button", { class: "btn sm", type: "button", onclick: () => goTo("reel", { idea: `Reply-to-comment Reel (formula #16, The Verbatim Question). The comment: "${str(it.comment)}" from ${str(it.handle)}. Hook idea: ${str(it.reel_hook)}` }) }, "Make this a Reel →")) : null);
        })));
    }
  });
  root.append(h("div", { class: "panel" }, h("div", { class: "cols" }, field("The post", about), field("Keyword", kw)), field("The comments", comments), shots.el, r.el), out);
  return {};
}

// ---------------- /ig-dm ----------------
function viewDM(root) {
  const kind = select("dm-kind", ["Keyword delivery", "Reply to a story or poll", "Warm first message", "Collab or brand pitch", "Cold message"], "Keyword delivery");
  const who = area("dm-who", { placeholder: "Handle, what they do, and what they posted or did." });
  const trig = input("dm-trig", { placeholder: "Why message today. e.g. commented TEAK on Tuesday's reel" });
  const want = input("dm-want", { placeholder: "A conversation, a sale, a collab, a referral" });
  const thing = input("dm-thing", { placeholder: "The thing or link you're sending, if any" });
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const r = runner("Write the DM", async ({ signal, progress }) => {
    if (!who.value.trim()) throw new Error("Say who it's to first.");
    const o = await askJSON("ig-dm", [`<task>\nWrite the DM and its two follow-ups (+4 days adds something new, +10 days closes the loop). If there is no real trigger, say so in "warning" and still write the best version. If this is a cold message, put the honest warning in "warning".\nKind: ${kind.value}\n<user_input>\nWho: ${who.value}\nTrigger: ${trig.value || "(none given)"}\nWhat I want: ${want.value || "(not said)"}\nThe thing to send: ${thing.value || "(none)"}\n</user_input>\n</task>`],
      `{"warning":"or empty","message":"message one","followups":[{"day":4,"text":"..."},{"day":10,"text":"..."}],"missing":[]}`, { signal, progress });
    clear(out);
    const msg = T.humanize(str(o.message), LEX).text.trim();
    const fl = [];
    if (/https?:\/\/|calendly|cal\.com/i.test(msg) && !/keyword/i.test(kind.value)) fl.push("Link or calendar in message one. It reads as a funnel because it is one.");
    const sents = (msg.match(/[^.!?]+[.!?]*/g) || []).length; if (sents > 5) fl.push(`${sents} sentences. Two to four. A screen of text is a delete.`);
    out.append(o.warning ? h("div", { class: "banner" }, str(o.warning)) : null,
      h("div", { class: "row" }, h("h2", {}, "Message"), h("span", { class: "small muted mono" }, `${msg.length} chars`)), copyBlock("Send by hand", msg), ...fl.map(x => h("div", { class: "flag" }, x)),
      missingNote(strArr(o.missing)),
      (Array.isArray(o.followups) ? o.followups : []).map(f => copyBlock(`Follow-up · day +${f.day}`, T.humanize(str(f.text), LEX).text.trim())),
      h("p", { class: "small muted" }, "Then stop. A third follow-up converts nobody. Never automate outreach DMs: only keyword auto-replies through Instagram's own tools are allowed."),
      h("div", { class: "row" }, saveBtn(() => ({ skill: "ig-dm", title: `${kind.value}: ${who.value.split("\n")[0]}`, body: msg + "\n\n" + (o.followups || []).map(f => `+${f.day}d: ${f.text}`).join("\n\n") }))));
  });
  root.append(h("div", { class: "panel" }, h("div", { class: "cols" }, field("Kind", kind), field("Trigger", trig)), field("Who", who), h("div", { class: "cols" }, field("What you want", want), field("The thing", thing)), r.el), out);
  return {};
}

// ---------------- /ig-plan ----------------
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
function viewPlan(root) {
  const happened = area("pl-happened", { class: "tall", placeholder: "What actually happened this week: a client call, a number, a mistake, a piece you built, an argument you had. Posts come from here." });
  const themes = input("pl-themes", { placeholder: "3 or 4 themes you want to be known for, comma-separated" });
  const accounts = area("pl-accounts", { placeholder: "Ten accounts worth being visible to, one per line" });
  const tz = input("pl-tz", { value: "India (IST)" });
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const saved = h("div");
  const r = runner("Plan the week", async ({ signal, progress }) => {
    if (!happened.value.trim()) throw new Error("Say what happened this week. That's where posts come from.");
    const o = await askJSON("ig-plan", [`<hook_formulas>\n${hooksRef()}\n</hook_formulas>`, await swipeContext(), logContext(14),
      `<task>\nPlan next week: 4 to 5 posts (at least 3 Reels), mix of PROOF/TEACH/OPINION/STORY/OFFER with no two of the same type back to back, a time for each in the audience's timezone, and the engagement list split 5 reach / 3 peers / 2 buyers (use the accounts given; if fewer than ten, say what kind of account to find).\nAudience timezone: ${tz.value}\n<user_input>\nThis week: ${happened.value}\nThemes: ${themes.value || "(not given)"}\nAccounts:\n${accounts.value || "(none given)"}\n</user_input>\n</task>`],
      `{"week_of":"date or label","days":[{"day":"MON","time":"","format":"REEL|CAROUSEL|STORIES|ENGAGE|REST","type":"PROOF|TEACH|OPINION|STORY|OFFER|","formula_id":5,"angle":"the specific angle, not a topic"}],"stories":"one line on the daily stories","engage":{"reach":["@a"],"peers":["@b"],"buyers":["@c"]},"note":"one honest line"}`, { signal, progress });
    o.savedAt = Date.now();
    paint(o, true);
  });
  function paint(o, fresh) {
    clear(out);
    const byDay = Object.fromEntries((Array.isArray(o.days) ? o.days : []).map(d => [str(d.day).slice(0, 3).toUpperCase(), d]));
    out.append(h("div", { class: "row" }, h("h2", {}, "Week " + (str(o.week_of) || "")), o.savedAt ? h("span", { class: "small muted" }, (fresh ? "New · " : "Saved · ") + new Date(o.savedAt).toLocaleString()) : null),
      h("div", { class: "week" }, DAYS.map(d => {
        const x = byDay[d]; const fm = x ? str(x.format).toUpperCase() : "REST";
        const writable = ["REEL", "CAROUSEL", "STORIES"].includes(fm);
        return h("div", { class: "day" + (!x || fm === "REST" ? " rest" : "") }, h("div", { class: "d" }, h("span", {}, d), h("span", {}, x ? str(x.time) : "")),
          x ? [h("div", { class: "row" }, pill(fm, fm === "REEL" ? "info" : "plain"), x.type ? pill(str(x.type).toUpperCase(), "plain") : null), h("div", { class: "t" }, str(x.angle)), x.formula_id ? h("div", { class: "small muted" }, formulaLabel(x.formula_id)) : null,
            writable ? h("button", { class: "btn sm", type: "button", onclick: () => goTo(fm === "REEL" ? "reel" : fm === "CAROUSEL" ? "carousel" : "story", { idea: str(x.angle) + (x.formula_id ? `\n(Planned formula: ${formulaLabel(x.formula_id)})` : "") }) }, "Write this →") : null] : h("span", { class: "small muted" }, "Rest"));
      })),
      o.stories ? h("div", { class: "note" }, pill("STORIES", "plain"), h("span", {}, str(o.stories))) : null,
      o.engage ? h("div", { class: "panel" }, h("h3", {}, "Engagement round · 20 minutes a day, before posting"),
        h("div", { class: "cols3" }, [["reach", "Reach (5)"], ["peers", "Peers (3)"], ["buyers", "Buyers (2)"]].map(([k, l]) => h("div", {}, h("span", { class: "field-label" }, l), h("ul", { class: "steps" }, strArr(o.engage[k]).map(a => h("li", {}, a)))))),
        h("p", { class: "small muted" }, "Write the comments in /ig-comment. Never pitch in a comment.")) : null,
      o.note ? h("p", { class: "muted" }, str(o.note)) : null,
      fresh ? h("div", { class: "row" }, (() => { const b = h("button", { class: "btn", type: "button" }, "Save as this week's plan"); b.onclick = async () => { b.disabled = true; try { await Store.setDoc("plans/" + (Store.brandId || "none"), JSON.parse(JSON.stringify(o))); b.textContent = "Saved"; } catch (e) { b.textContent = "Couldn't save"; b.disabled = false; } }; return b; })()) : null);
  }
  root.append(h("div", { class: "panel" }, field("What happened this week", happened), h("div", { class: "cols" }, field("Themes", themes), field("Audience timezone", tz)), field("Accounts to engage with", accounts), r.el), saved, out);
  return { async onShow() { if (out.children.length) return; try { const p = await Store.getDoc("plans/" + (Store.brandId || "none")); if (p && p.days) paint(p, false); } catch (e) { /* no plan yet */ } } };
}

// ---------------- /ig-profile ----------------
function viewProfile(root) {
  const f = {
    name: input("pf-name", { placeholder: "The bold line under the photo (30 characters)" }), handle: input("pf-handle", { placeholder: "@handle" }),
    bio: area("pf-bio", { placeholder: "Your bio as it is now (150 characters)" }), link: input("pf-link", { placeholder: "Where the link goes" }),
    hl: input("pf-hl", { placeholder: "Highlight names, comma-separated" }), pinned: area("pf-pinned", { placeholder: "What's pinned, if anything" }),
    grid: area("pf-grid", { placeholder: "Describe the first nine grid covers, or add a screenshot below" }),
  };
  const shots = imagePicker("pf-shots", "Profile screenshots (top of profile + first two grid rows)");
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const rub = DATA.rubric.items;
  const r = runner("Score my profile", async ({ signal, progress }) => {
    if (!f.bio.value.trim() && !f.name.value.trim() && !shots.files()) throw new Error("Paste the profile fields, or add a screenshot.");
    const o = await askJSON("ig-profile", [`<rubric>\n${JSON.stringify(DATA.rubric)}\n</rubric>`,
      `<task>\nScore every rubric item honestly (integers from 0 to that item's points). Then write the rewrites in fix-first order (most points lost first): three options for the name field (30 characters max each), bio rewrites (150 characters max), and what to pin, highlights, link and grid covers where they lost points. Estimate the score after the rewrites honestly and say what the rest needs.\n<pasted>\nName field: ${f.name.value}\nHandle: ${f.handle.value}\nBio: ${f.bio.value}\nLink: ${f.link.value}\nHighlights: ${f.hl.value}\nPinned: ${f.pinned.value}\nGrid: ${f.grid.value}\n</pasted>\n</task>`],
      `{"scores":[{"id":"name_field","score":2,"note":"why"}],"rewrites":[{"field":"name field|bio|pinned three|highlights|link|grid covers","options":["..."],"why":"..."}],"after_estimate":70,"after_note":"what the rest needs"}`, { signal, progress, images: shots.files() });
    clear(out);
    const byId = Object.fromEntries((Array.isArray(o.scores) ? o.scores : []).map(s => [s.id, s]));
    let total = 0;
    const rows = rub.map(it => { const s = byId[it.id] || {}; const sc = Math.max(0, Math.min(it.points, Math.round(Number(s.score) || 0))); total += sc; return { it, sc, note: str(s.note) }; });
    out.append(h("div", { class: "panel" },
      h("div", { class: "scoretotal" }, h("span", { class: "bignum", style: { color: scoreColor(total) } }, total), h("span", { class: "mono muted" }, "/ 100"), h("span", { class: "small muted" }, "Most first-pass profiles land in the 30s and 40s. A generous score helps nobody.")),
      h("div", { class: "table-wrap" }, h("table", {}, h("tbody", {}, rows.map(x => h("tr", {}, h("td", { style: { whiteSpace: "nowrap" } }, x.it.id.replace(/_/g, " ")), h("td", { class: "num" }, `${x.sc}/${x.it.points}`), h("td", { style: { minWidth: "90px" } }, bar(x.sc / x.it.points * 100)), h("td", { class: "small" }, x.note))))))));
    out.append(h("h2", {}, "Rewrites, fix-first"));
    for (const rw of (Array.isArray(o.rewrites) ? o.rewrites : [])) {
      const fieldName = str(rw.field).toLowerCase(); const cap = fieldName.includes("name") ? 30 : fieldName.includes("bio") ? 150 : 0;
      out.append(h("div", { class: "panel" }, h("h3", {}, str(rw.field)), rw.why ? h("p", { class: "small muted" }, str(rw.why)) : null,
        strArr(rw.options).map(op => { const t = T.humanize(op, LEX).text.trim(); const n = [...t].length; return h("div", { class: "row" }, h("span", { style: { flex: "1", minWidth: "0" } }, t), cap ? pill(`${n}/${cap}`, n > cap ? "fail" : "pass") : null, copyBtn(t)); })));
    }
    if (o.after_estimate) out.append(h("div", { class: "note" }, pill(`AFTER ≈ ${Math.round(Number(o.after_estimate))}`, "info"), h("span", {}, str(o.after_note))));
    out.append(h("div", { class: "row" }, saveBtn(() => ({ skill: "ig-profile", title: `Profile score ${total}/100`, body: rows.map(x => `${x.it.id}: ${x.sc}/${x.it.points} ${x.note}`).join("\n") + "\n\n" + (o.rewrites || []).map(rw => `${rw.field}:\n- ${strArr(rw.options).join("\n- ")}`).join("\n\n") }))));
  });
  root.append(h("div", { class: "panel" }, h("div", { class: "cols" }, field("Name field", f.name), field("Handle", f.handle)), field("Bio", f.bio), h("div", { class: "cols" }, field("Link", f.link), field("Highlights", f.hl)), h("div", { class: "cols" }, field("Pinned posts", f.pinned), field("First nine grid covers", f.grid)), shots.el, r.el), out);
  return { onShow() { const b = Store.brand(); if (b && b.handle && !f.handle.value) f.handle.value = b.handle; } };
}

// ---------------- table editor shared by Viral + Audit ----------------
function tableEditor(cols, rows, onChange) {
  const wrap = h("div", { class: "table-wrap" });
  function render() {
    clear(wrap).append(h("table", {}, h("thead", {}, h("tr", {}, cols.map(c => h("th", {}, c.label)), h("th", {}, ""))),
      h("tbody", {}, rows.map((r, i) => h("tr", {}, cols.map(c => h("td", { style: c.wide ? { minWidth: "240px" } : { minWidth: "90px" } }, h("input", { type: "text", value: r[c.key] === null || r[c.key] === undefined ? "" : String(r[c.key]), "aria-label": c.label, oninput: e => { r[c.key] = e.target.value; onChange && onChange(); } }))),
        h("td", {}, h("button", { class: "btn sm ghost", type: "button", "aria-label": "Remove row", onclick: () => { rows.splice(i, 1); render(); onChange && onChange(); } }, "×")))))));
  }
  render();
  return { el: wrap, render };
}
function pasteRows(raw, cols, aliases) {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map(c => c.trim().toLowerCase());
  const map = head.map(hd => { for (const [k, al] of Object.entries(aliases)) if (al.some(a => hd.includes(a))) return k; return null; });
  const hasHead = map.filter(Boolean).length >= 2;
  const keys = hasHead ? map : cols.map(c => c.key);
  return (hasHead ? lines.slice(1) : lines).map(l => { const cells = l.split(sep); const r = {}; keys.forEach((k, i) => { if (k) r[k] = (cells[i] || "").trim(); }); return r; });
}

// ---------------- /ig-viral ----------------
const SWIPE_COLS = [{ key: "account", label: "Account" }, { key: "followers", label: "Followers" }, { key: "median", label: "Median views" }, { key: "views", label: "This reel" }, { key: "hook", label: "Hook (first line, verbatim)", wide: true }];
function viewViral(root) {
  const rows = [];
  const ed = tableEditor(SWIPE_COLS, rows);
  const paste = area("vr-paste", { placeholder: "account\tfollowers\tmedian\tviews\thook\n@someone\t48000\t11000\t412000\tnobody tells you..." });
  const shots = imagePicker("vr-shots", "Or read rows from screenshots of reels");
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  let analysis = null;
  const addPaste = h("button", { class: "btn", type: "button", onclick: () => { const got = pasteRows(paste.value, SWIPE_COLS, { account: ["account", "handle"], followers: ["follower"], median: ["median"], views: ["views", "plays"], hook: ["hook", "first line"] }); rows.push(...got); paste.value = ""; ed.render(); } }, "Add pasted rows");
  const addRow = h("button", { class: "btn", type: "button", onclick: () => { rows.push({ account: "", followers: "", median: "", views: "", hook: "" }); ed.render(); } }, "Add a row");
  const readShots = runner("Read the screenshots", async ({ signal, progress }) => {
    const files = shots.files(); if (!files) throw new Error("Add screenshots first.");
    const o = await askJSON("ig-viral", ["<task>\nRead these screenshots of Instagram reels or profiles and return one row per reel you can see. Copy the hook (first spoken or on-screen line) verbatim if visible, else leave it empty. Numbers as plain integers (1.2M = 1200000). Do not guess numbers you cannot see.\n</task>"],
      `{"rows":[{"account":"@x","followers":48000,"median":null,"views":412000,"hook":"..."}]}`, { signal, progress, images: files });
    for (const x of (Array.isArray(o.rows) ? o.rows : [])) rows.push({ account: str(x.account), followers: x.followers ?? "", median: x.median ?? "", views: x.views ?? "", hook: str(x.hook) });
    ed.render();
  });
  const rank = runner("Rank by outlier multiple", async () => {
    const clean = rows.map(r => ({ account: str(r.account), followers: T.parseNum(r.followers), median: T.parseNum(r.median), views: T.parseNum(r.views) || 0, hook: str(r.hook).trim() })).filter(r => r.views && r.hook);
    if (!clean.length) throw new Error("Add at least one row with views and a hook.");
    analysis = T.swipe(clean, HOOKS);
    paint();
  }, { needsClaude: false });
  function paint() {
    clear(out);
    const a = analysis;
    out.append(h("div", { class: "grouphead" }, h("h2", {}, `Swipe file · ${a.n} reels · ${a.accounts} accounts`), h("span", { class: "small muted" }, "baseline: " + a.baseline)),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Multiple"), h("th", {}, "Hook score"), h("th", {}, "Formula"), h("th", {}, "Account"), h("th", {}, "Views"), h("th", {}, "Hook"))),
        h("tbody", {}, a.reels.map(r => h("tr", {}, h("td", { class: "num" }, r.outlier ? r.outlier.toFixed(1) + "×" : "?"), h("td", { class: "num", style: { color: scoreColor(r.hook_score) } }, Math.round(r.hook_score)), h("td", { class: "small" }, r.formula_id ? `#${r.formula_id} ${r.formula}` : pill("UNCLASSIFIED", "warn")), h("td", {}, r.account), h("td", { class: "num" }, fmtInt(r.views)), h("td", {}, r.hook)))))),
      h("div", { class: "panel" }, h("h3", {}, "What's working in this batch"),
        h("dl", { class: "kv" }, h("dt", {}, "Top third by multiple"), h("dd", {}, a.topFormulas.slice(0, 4).map(([n, c]) => `${n} ×${c}`).join(", ") || "-"),
          h("dt", {}, "Median hook score"), h("dd", {}, `top ${a.topHookScore ?? "-"} vs bottom ${a.bottomHookScore ?? "-"}`),
          h("dt", {}, "Median hook length"), h("dd", {}, `top ${a.topWords ?? "-"} words vs bottom ${a.bottomWords ?? "-"} words`),
          h("dt", {}, "Unclassified"), h("dd", {}, `${a.unclassified} of ${a.n}. Read those by hand: a formula you don't have yet hides there.`)),
        h("p", { class: "small muted" }, a.n < 30 ? `${a.n} reels is evidence, not proof. Forty across six accounts starts to show something.` : "A decent sample. Still, trust it for a season, not forever.")),
      h("div", { class: "row" }, (() => { const b = h("button", { class: "btn", type: "button" }, "Save as this brand's swipe file"); b.onclick = async () => { b.disabled = true; try { await Store.setDoc("swipes/" + (Store.brandId || "none"), { updatedAt: Date.now(), n: a.n, accounts: a.accounts, baseline: a.baseline, topFormulas: a.topFormulas, reels: a.reels.slice(0, 120).map(r => ({ account: r.account, followers: r.followers, median: r.median, views: r.views, hook: r.hook, outlier: r.outlier, formula_id: r.formula_id, formula: r.formula, hook_score: Math.round(r.hook_score) })) }); b.textContent = "Saved. Reels and plans will use it."; } catch (e) { b.textContent = "Couldn't save"; b.disabled = false; } }; return b; })(), pattern.el),
      patternOut);
  }
  const patternOut = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } });
  const pattern = runner("Turn it into hooks I can shoot", async ({ signal, progress }) => {
    if (!analysis) throw new Error("Rank the rows first.");
    const table = analysis.reels.map(r => `${r.outlier ?? "?"}x\t${r.formula_id ? "#" + r.formula_id + " " + r.formula : "unclassified"}\t${r.account}\t${r.views}\t${r.hook}`).join("\n");
    const o = await askJSON("ig-viral", [`<hook_formulas>\n${hooksRef()}\n</hook_formulas>`, `<task>\nSteps 4 and 5. Report which formulas over-index in the top third (with counts), what the top third share structurally that the bottom third do not, what the unclassified rows have in common, and how confident this sample lets you be. Then write the brand's own version of the top three formulas: a hook line they could say tomorrow, about their own work, using only facts from the brand voice (else {{placeholders}}).\n<pasted>\nmultiple\tformula\taccount\tviews\thook\n${table}\n</pasted>\n</task>`],
      `{"over_indexing":[{"formula_id":3,"count":5,"note":"..."}],"structure":["..."],"unclassified":"...","confidence":"...","your_versions":[{"formula_id":3,"hook":"...","on_screen":"..."}]}`, { signal, progress });
    clear(patternOut).append(h("div", { class: "panel" }, h("h3", {}, "What it means"),
      h("ul", { class: "steps" }, (o.over_indexing || []).map(x => h("li", {}, h("b", {}, `${formulaLabel(x.formula_id)} ×${x.count}`), " ", str(x.note))), strArr(o.structure).map(s => h("li", {}, s))),
      o.unclassified ? h("p", { class: "small" }, h("b", {}, "Unclassified: "), str(o.unclassified)) : null, o.confidence ? h("p", { class: "small muted" }, str(o.confidence)) : null),
      h("h2", {}, "Your versions"),
      (o.your_versions || []).map(v => hookResult(T.scoreHook(T.humanize(str(v.hook), LEX).text.trim()), h("div", { class: "meta" }, pill(formulaLabel(v.formula_id), "info"), v.on_screen ? h("span", {}, "On screen: ", h("b", {}, str(v.on_screen))) : null,
        h("button", { class: "btn sm", type: "button", onclick: () => goTo("reel", { idea: `Use formula ${formulaLabel(v.formula_id)}. Hook direction: ${str(v.hook)}` }) }, "Write this Reel →")))));
  });
  root.append(
    h("div", { class: "panel" }, h("h3", {}, "How to collect (20 minutes, once a month)"),
      h("ol", { class: "steps" },
        h("li", {}, "Pick 6 to 12 accounts within about 10× your size: 4 in your niche, 4 adjacent (same audience, different niche), 2 to 4 much bigger ones for format only."),
        h("li", {}, "For each, eyeball the last 12 reels and note the middle view count. That's the median, and it's the column that matters."),
        h("li", {}, "Write down the reels that clearly beat it: views, and the first line spoken or on screen, word for word."),
        h("li", {}, "Your own Saved folder is the fastest corpus there is. Start there.")),
      h("p", { class: "small muted" }, "Read at human speed in your own app. Never log in for anyone, never use a scraper: automated collection gets accounts action-blocked. Copy the formula, never the video.")),
    h("div", { class: "panel" }, h("div", { class: "grouphead" }, h("h3", {}, "Reels you collected"), h("div", { class: "row" }, addRow)), ed.el,
      field("Paste rows from a sheet", paste, "Tab- or comma-separated, with or without a header row."), h("div", { class: "row" }, addPaste), shots.el, CAP.images ? readShots.el : null, rank.el),
    out);
  return {};
}

// ---------------- /ig-audit ----------------
const AUDIT_COLS = [{ key: "post", label: "Post (first line)", wide: true }, { key: "format", label: "Format" }, { key: "length", label: "Length s" }, { key: "views", label: "Views" }, { key: "reach", label: "Reach" }, { key: "nonfollower", label: "Non-follower %" }, { key: "hold3", label: "Hold@3s %" }, { key: "shares", label: "Sends" }, { key: "saves", label: "Saves" }, { key: "follows", label: "Follows" }];
const AUDIT_ALIASES = { post: ["post", "caption", "title", "hook", "description"], format: ["format", "type"], length: ["length", "duration"], views: ["views", "plays"], reach: ["reach", "accounts reached"], nonfollower: ["non-follower", "nonfollower", "non follower"], hold3: ["hold", "3s", "3 s"], shares: ["share", "send"], saves: ["save"], follows: ["follow"] };
function viewAudit(root) {
  const rows = [];
  const ed = tableEditor(AUDIT_COLS, rows);
  const paste = area("au-paste", { placeholder: "Paste an export or a sheet: post, views, reach, shares, saves, follows..." });
  const shots = imagePicker("au-shots", "Or read rows from insights screenshots");
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  let computed = null;
  const addPaste = h("button", { class: "btn", type: "button", onclick: () => { rows.push(...pasteRows(paste.value, AUDIT_COLS, AUDIT_ALIASES)); paste.value = ""; ed.render(); } }, "Add pasted rows");
  const addRow = h("button", { class: "btn", type: "button", onclick: () => { rows.push({}); ed.render(); } }, "Add a row");
  const readShots = runner("Read the screenshots", async ({ signal, progress }) => {
    const files = shots.files(); if (!files) throw new Error("Add screenshots first.");
    const o = await askJSON("ig-audit", ["<task>\nRead these Instagram insights screenshots and return one row per post. Numbers as plain numbers, percentages as numbers without %. Leave a field null if it is not visible. Never guess.\n</task>"],
      `{"rows":[{"post":"first line","format":"reel","length":28,"views":4100,"reach":3800,"nonfollower":62,"hold3":71,"shares":12,"saves":30,"follows":4}]}`, { signal, progress, images: files });
    for (const x of (Array.isArray(o.rows) ? o.rows : [])) rows.push(Object.fromEntries(AUDIT_COLS.map(c => [c.key, x[c.key] ?? ""])));
    ed.render();
  });
  const compute = runner("Compute the numbers", async () => {
    const num = v => { const n = T.parseNum(String(v ?? "").replace("%", "")); return n === null || isNaN(n) ? null : n; };
    const posts = rows.map(r => ({ post: str(r.post), format: str(r.format), length: num(r.length), views: num(r.views), reach: num(r.reach), nonfollower: num(r.nonfollower), hold3: num(r.hold3), shares: num(r.shares), saves: num(r.saves), follows: num(r.follows) })).filter(p => p.views);
    if (posts.length < 3) throw new Error("Add at least three posts with views.");
    const vs = posts.map(p => p.views).sort((a, b) => a - b); const med = vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2;
    for (const p of posts) { p.multiple = p.views / med; p.sendsPerReach = p.reach && p.shares !== null ? p.shares / p.reach : null; p.followsPerReach = p.reach && p.follows !== null ? p.follows / p.reach : null; }
    posts.sort((a, b) => b.multiple - a.multiple || (b.sendsPerReach || 0) - (a.sendsPerReach || 0));
    computed = { med, posts };
    paint();
  }, { needsClaude: false });
  const pct = v => v === null || v === undefined ? "-" : (v * 100).toFixed(2) + "%";
  function postTable(list) {
    return h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Multiple", "Views", "Non-follower", "Hold@3s", "Sends/reach", "Follows/reach", "Post"].map(x => h("th", {}, x)))),
      h("tbody", {}, list.map(p => h("tr", {}, h("td", { class: "num" }, p.multiple.toFixed(1) + "×"), h("td", { class: "num" }, fmtInt(p.views)), h("td", { class: "num" }, p.nonfollower ?? "-"), h("td", { class: "num" }, p.hold3 ?? "-"), h("td", { class: "num" }, pct(p.sendsPerReach)), h("td", { class: "num" }, pct(p.followsPerReach)), h("td", {}, p.post))))));
  }
  function paint() {
    clear(out);
    const { med, posts } = computed;
    const n = posts.length, k = Math.min(5, Math.ceil(n / 2));
    out.append(h("div", { class: "grouphead" }, h("h2", {}, `Audit · ${n} posts · median views ${fmtInt(med)}`), h("span", { class: "small muted" }, "Ranked by multiple over your own median, not raw views.")),
      h("h3", {}, `Top ${k}`), postTable(posts.slice(0, k)), h("h3", {}, `Bottom ${k}`), postTable(posts.slice(-k).reverse()),
      n < 15 ? h("div", { class: "note" }, pill("SMALL SAMPLE", "warn"), h("span", {}, `With ${n} posts you can't see a pattern yet. Thirty is where one starts to show.`)) : null,
      interp.el, interpOut);
  }
  const interpOut = h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
  const interp = runner("Read what the data says", async ({ signal, progress }) => {
    if (!computed) throw new Error("Compute the numbers first.");
    const tsv = computed.posts.map(p => [p.multiple.toFixed(2), p.views, p.reach ?? "", p.nonfollower ?? "", p.hold3 ?? "", p.shares ?? "", p.saves ?? "", p.follows ?? "", p.format, p.length ?? "", p.post].join("\t")).join("\n");
    const o = await askJSON("ig-audit", [`<hook_formulas>\n${hooksRef()}\n</hook_formulas>`, logContext(30), `<task>\nThe numbers are computed already (median views ${Math.round(computed.med)}). Find what separates the top from the bottom, in the order the skill gives (hold at 3s first, day and time last). State each finding as a claim with evidence and a confidence. Separate hook problems (no views) from profile problems (views, no follows). Be willing to say something the user won't like, and say plainly if the sample is too small.\n<pasted>\nmultiple\tviews\treach\tnonfollower%\thold3s%\tsends\tsaves\tfollows\tformat\tlength_s\tpost\n${tsv}\n</pasted>\n</task>`],
      `{"findings":[{"claim":"...","evidence":"...","confidence":"high|medium|low"}],"diagnosis":"hook|profile|mixed|unclear","stop":"...","do_more":"...","sample_note":"..."}`, { signal, progress });
    clear(interpOut).append(h("div", { class: "panel" }, h("div", { class: "row" }, h("h3", {}, "What the data says"), o.diagnosis ? pill(str(o.diagnosis).toUpperCase() + " PROBLEM", "info") : null),
      h("ol", { class: "steps" }, (o.findings || []).map(fd => h("li", {}, h("b", {}, str(fd.claim)), " ", h("span", { class: "muted" }, str(fd.evidence)), " ", pill(str(fd.confidence).toUpperCase() || "?", fd.confidence === "high" ? "pass" : fd.confidence === "low" ? "fail" : "warn")))),
      h("dl", { class: "kv" }, h("dt", {}, "Stop"), h("dd", {}, str(o.stop)), h("dt", {}, "Do more"), h("dd", {}, str(o.do_more))),
      o.sample_note ? h("p", { class: "small muted" }, str(o.sample_note)) : null,
      str(o.diagnosis).toLowerCase() === "profile" ? h("button", { class: "btn sm", type: "button", onclick: () => goTo("profile") }, "Go to profile score →") : null,
      h("div", { class: "row" }, saveBtn(() => ({ skill: "ig-audit", title: `Audit: ${str(o.stop) ? "stop " + str(o.stop) : "findings"}`, body: (o.findings || []).map(fd => `- ${fd.claim} (${fd.confidence}) ${fd.evidence}`).join("\n") + `\n\nSTOP: ${o.stop}\nDO MORE: ${o.do_more}` })))));
  });
  root.append(h("div", { class: "panel" }, h("div", { class: "grouphead" }, h("h3", {}, "Your last posts"), h("div", { class: "row" }, addRow)),
    h("p", { class: "small muted" }, "From Instagram insights. The 3-second hold is the hook's grade, and the retention graph of your best and worst reel is worth more than every other number."),
    ed.el, field("Paste rows", paste), h("div", { class: "row" }, addPaste), shots.el, CAP.images ? readShots.el : null, compute.el), out);
  return {};
}
