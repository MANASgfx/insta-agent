"use strict";
/* ===== Create: Reel, Caption, Carousel, Stories, Repurpose ===== */
const wpmOf = () => { const b = Store.brand(); const w = b && Number(b.wpm); return w && w > 80 && w < 300 ? w : 165; };

// ---------------- /ig-reel ----------------
function viewReel(root) {
  const idea = area("reel-idea", { placeholder: "One raw idea. e.g. A client changed the wood after we'd already cut it. Here's the clause we added after." });
  const facts = area("reel-facts", { placeholder: "Numbers, names, what it cost or returned. Leave blank and the script will mark the gaps." });
  const len = select("reel-len", [["15", "15 seconds"], ["30", "30 seconds"], ["45", "45 seconds"], ["60", "60 seconds"]], "30");
  const hooksOut = h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
  const scriptOut = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  let cards = [], hooksData = [], sel = 0;

  const r1 = runner("Write 3 hooks", async ({ signal, progress }) => {
    if (!idea.value.trim()) throw new Error("Write the idea first.");
    const out = await askJSON("ig-reel", [
      `<hook_formulas>\n${hooksRef()}\n</hook_formulas>`, await swipeContext(), logContext(8),
      `<task>\nStep 1 of the loop only. Pick three formulas that genuinely fit this idea (three different formulas, not three rewrites of one) and write the spoken hook line and the separate on-screen line for each. Do not write the script yet.\nIf the idea is too thin to hook (no specific true thing: what happened, to whom, what it cost or returned), return an empty "hooks" array and put one batched question in "question".\nTarget length: ${len.value} seconds.\n<user_input>\nIdea: ${idea.value}\nFacts I can use: ${facts.value || "(none given)"}\n</user_input>\n</task>`],
      `{"hooks":[{"formula_id":3,"spoken":"the line said out loud","on_screen":"SIX WORDS OR FEWER","why":"one line on why this formula fits"}],"question":null,"missing":["what each {{placeholder}} needs"]}`, { signal, progress });
    hooksData = (Array.isArray(out.hooks) ? out.hooks : []).filter(x => x && x.spoken).slice(0, 5);
    clear(scriptOut);
    paintHooks(out);
  });

  function paintHooks(out) {
    clear(hooksOut);
    if (!hooksData.length) {
      hooksOut.append(h("div", { class: "panel" }, h("h3", {}, "Claude needs one thing first"), h("p", {}, str(out.question) || "The idea is too thin to hook. Add what happened, to whom, and what it cost or returned.")));
      return;
    }
    const scored = hooksData.map(x => ({ ...x, s: T.scoreHook(String(x.spoken)) })).sort((a, b) => b.s.overall - a.s.overall);
    hooksData = scored; sel = 0;
    hooksOut.append(h("div", { class: "grouphead" }, h("h2", {}, "Hooks, scored"), h("span", { class: "small muted" }, "Edit a line to re-score it. Click a card to choose it.")));
    if (scored[0].s.overall < 50) hooksOut.append(h("div", { class: "note" }, pill("WEAK", "fail"), h("span", {}, "The top hook is under 50. You don't have the hook yet. Add a number or a cost to the idea and write again.")));
    cards = scored.map((x, i) => {
      const extra = h("div", { class: "meta" }, pill(formulaLabel(x.formula_id), "info"), h("span", {}, "On screen: ", h("b", {}, str(x.on_screen))), x.why ? h("span", {}, str(x.why)) : null);
      const c = hookResult(x.s, extra);
      c.addEventListener("click", e => { if (e.target.tagName === "TEXTAREA") return; sel = i; cards.forEach((k, j) => k.classList.toggle("sel", j === i)); });
      if (i === 0) c.classList.add("sel");
      return c;
    });
    hooksOut.append(...cards, missingNote(strArr(out.missing)), r2.el);
  }

  const r2 = runner("Write the script on the chosen hook", async ({ signal, progress }) => {
    const pick = hooksData[sel]; if (!pick) throw new Error("Write hooks first.");
    const spoken = cards[sel].getHook();
    const wpm = wpmOf(), words = Math.round(Number(len.value) * wpm / 60);
    const out = await askJSON("ig-reel", [
      `<hook_formulas>\n${hooksRef()}\n</hook_formulas>`,
      `<task>\nSteps 3 to 4 of the loop: write the Reel on this hook.\nHook (spoken, use it exactly as line 1): ${spoken}\nOn-screen hook card: ${str(pick.on_screen)}\nFormula: ${formulaLabel(pick.formula_id)}\nTarget: ${len.value} seconds at ${wpm} words per minute, so about ${words} spoken words in total.\nOne beat per line: each line is one beat, and the frame changes every beat. Keep each line under about 10 words so no beat runs past 4 seconds. Put something concrete (a number, a name, a price) in most beats. The last line delivers the payoff, carries the single ask, and repeats one word from the hook so the replay loops.\n<user_input>\nIdea: ${idea.value}\nFacts I can use: ${facts.value || "(none given)"}\n</user_input>\n</task>`],
      `{"script_lines":["line 1 = the hook","..."],"on_screen":[{"at":"0:00","text":"SIX WORDS MAX"}],"shots":["what is on screen for each beat, same order as script_lines"],"ask":"the single ask","loop_word":"the echoed word","missing":[]}`, { signal, progress });
    paintScript(out, pick);
  });

  function paintScript(out, pick) {
    clear(scriptOut);
    const raw = strArr(out.script_lines).join("\n");
    if (!raw.trim()) { scriptOut.append(h("p", { class: "muted" }, "No script came back. Press the button again.")); return; }
    const before = T.detect(raw, LEX);
    const hum = T.humanize(raw, LEX);
    const clean = hum.text.trim();
    const live = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
    const paintLive = txt => { clear(live).append(beatTable(T.beatSheet(txt, wpmOf(), Number(len.value))), detectPanel(T.detect(txt, LEX), before)); };
    const ed = editableBlock("Script (one beat per line, humanized)", clean, txt => paintLive(txt));
    const shots = strArr(out.shots);
    scriptOut.append(
      h("h2", {}, "Script"), ed.el, missingNote(strArr(out.missing)),
      h("div", { class: "cols" },
        h("div", { class: "panel" }, h("h3", {}, "On-screen text"), h("p", { class: "small muted" }, "Six words or fewer per card. Keep it inside the safe zone: nothing above y=230 or below y=1440 on a 1080×1920 frame, right 230px clear."),
          h("div", { class: "table-wrap" }, h("table", {}, h("tbody", {}, (Array.isArray(out.on_screen) ? out.on_screen : []).map(c => h("tr", {}, h("td", { class: "tc" }, str(c.at)), h("td", {}, h("b", {}, str(c.text))))))))),
        shots.length ? h("div", { class: "panel" }, h("h3", {}, "Shot list"), h("ol", { class: "steps" }, shots.map(s => h("li", {}, s)))) : h("div")),
      live, humanReport(hum.report));
    paintLive(clean);
    const fix = runner("Fix the flagged beats with Claude", async ({ signal, progress }) => {
      const cur = ed.ta.value;
      const sheet = T.beatSheet(cur, wpmOf(), Number(len.value));
      const flags = [...sheet.notes.filter(n => n.level !== "pass").map(n => n.text), ...T.humanize(cur, LEX).report.structures.map(s => s.name + ": " + s.fix)];
      const o2 = await askJSON("ig-reel", [`<task>\nRevise this Reel script. Keep line 1 (the hook) unless a flag is about the hook. Fix every flag below and nothing else. One beat per line.\n<pasted>\n${cur}\n</pasted>\nFlags from the beat timer and humanizer:\n- ${flags.join("\n- ") || "(none)"}\n</task>`],
        `{"script_lines":["..."],"on_screen":[{"at":"0:00","text":"..."}],"shots":["..."],"ask":"...","loop_word":"...","missing":[]}`, { signal, progress });
      paintScript(o2, pick);
    });
    scriptOut.append(h("div", { class: "row" }, fix.el,
      saveBtn(() => ({ skill: "ig-reel", title: ed.ta.value.split("\n")[0], formula: pick.formula_id, body: ed.ta.value + "\n\nON SCREEN\n" + (out.on_screen || []).map(c => `${c.at}  ${c.text}`).join("\n") })),
      h("button", { class: "btn sm", type: "button", onclick: () => goTo("caption", { post: ed.ta.value, format: "Reel" }) }, "Write the caption →")));
  }

  root.append(
    h("div", { class: "panel" },
      field("The idea", idea, "One idea per Reel. If it has two, that's two Reels."),
      h("div", { class: "cols" }, field("Facts you can use", facts), h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } }, field("Length", len), h("p", { class: "small muted" }, "15 to 45 seconds is the working range. Speaking pace comes from your brand voice (default 165 wpm)."))),
      r1.el),
    hooksOut, scriptOut);
  return { onShow() { const p = Handoff.reel; if (p) { delete Handoff.reel; idea.value = p.idea || ""; if (p.facts) facts.value = p.facts; clear(hooksOut); clear(scriptOut); } } };
}

// ---------------- /ig-caption ----------------
function viewCaption(root) {
  const post = area("cap-post", { class: "tall", placeholder: "Paste the Reel script, or describe the photo or carousel." });
  const fmt = select("cap-format", ["Reel", "Carousel", "Photo"], "Reel");
  const kw = input("cap-kw", { placeholder: "e.g. solid wood dining table, teak furniture Mumbai" });
  const cta = input("cap-cta", { placeholder: "e.g. TEAK" });
  const facts = area("cap-facts", { placeholder: "Anything true you want in it: price, timeline, a client line you're allowed to use." });
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const r = runner("Write the caption", async ({ signal, progress }) => {
    if (!post.value.trim()) throw new Error("Paste the post first.");
    const o = await askJSON("ig-caption", [`<task>\nWrite the caption.\nFormat: ${fmt.value}\nSearch terms to work into the body as normal sentences: ${kw.value || "(none given, suggest two in the body anyway)"}\nKeyword CTA: ${cta.value || (Store.brand() && Store.brand().keyword) || "(none, pick the one ask that fits)"}\n<user_input>\nThe post:\n${post.value}\nFacts I can use: ${facts.value || "(none)"}\n</user_input>\n</task>`],
      `{"job":"A or B","job_reason":"one sentence","caption":"the full caption with line breaks as \\n, up to 5 hashtags on the last line or none","alt_text":"one or two sentences","first_comment":"only if there is a link, else empty","missing":[]}`, { signal, progress });
    paint(o);
  });
  function paint(o) {
    clear(out);
    const raw = str(o.caption);
    const hum = T.humanize(raw, LEX); const clean = hum.text.trim();
    const kws = kw.value.split(",").map(s => s.trim()).filter(Boolean);
    const lintBox = h("div");
    const ed = editableBlock("Caption (humanized, edit freely)", clean, t => clear(lintBox).append(captionPanel(t, kws)));
    lintBox.append(captionPanel(clean, kws));
    out.append(h("div", { class: "row" }, h("h2", {}, "Caption"), pill("JOB " + str(o.job || "?").toUpperCase(), "info"), h("span", { class: "small muted" }, str(o.job_reason))),
      ed.el, missingNote(strArr(o.missing)), lintBox,
      o.alt_text ? copyBlock("Alt text", str(o.alt_text)) : null,
      o.first_comment ? copyBlock("First comment", str(o.first_comment)) : null,
      humanReport(hum.report),
      h("div", { class: "row" }, saveBtn(() => ({ skill: "ig-caption", title: ed.ta.value.split("\n")[0], body: ed.ta.value }))));
  }
  root.append(h("div", { class: "panel" },
    field("The post", post),
    h("div", { class: "cols3" }, field("Format", fmt, "Reel: the video hooks, so the caption carries the ask. Photo or carousel: line one is the hook."), field("Search terms", kw, "Comma-separated. Instagram search reads caption text."), field("Keyword CTA", cta, "One word, no spaces.")),
    field("Facts you can use", facts), r.el), out);
  return { onShow() { const p = Handoff.caption; if (p) { delete Handoff.caption; post.value = p.post || ""; if (p.format) fmt.value = p.format; clear(out); } if (!cta.value && Store.brand() && Store.brand().keyword) cta.value = Store.brand().keyword; } };
}

// ---------------- /ig-carousel ----------------
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean); let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
function drawSlide(cv, s, i, n) {
  const b = Store.brand() || {};
  const bg = b.slideBg || "#F7F6F2", ink = b.slideInk || "#16201C", acc = b.slideAccent || "#2B47D9";
  const W = 1080, H = 1350, M = 120, ctx = cv.getContext("2d");
  cv.width = W; cv.height = H;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = acc; ctx.fillRect(M, M, 64, 8);
  ctx.textBaseline = "top";
  ctx.font = '500 30px "IBM Plex Mono", monospace'; ctx.fillStyle = ink; ctx.globalAlpha = 0.6;
  ctx.textAlign = "right"; ctx.fillText(`${i + 1}/${n}`, W - M, M - 8); ctx.textAlign = "left";
  const handle = b.handle ? (b.handle.startsWith("@") ? b.handle : "@" + b.handle) : "";
  if (handle) ctx.fillText(handle, M, H - M - 10);
  ctx.globalAlpha = 1;
  const role = String(s.role || "").toUpperCase();
  const isCover = role === "COVER";
  const hs = isCover ? 112 : 76;
  ctx.font = `800 ${hs}px "Schibsted Grotesk", Arial, sans-serif`; ctx.fillStyle = ink;
  let y = isCover ? 300 : 230;
  const hl = wrapLines(ctx, s.headline || "", W - 2 * M);
  for (const l of hl) { ctx.fillText(l, M, y); y += hs * 1.08; }
  y += 36;
  ctx.font = `400 ${isCover ? 46 : 42}px "Public Sans", Arial, sans-serif`; ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
  for (const l of wrapLines(ctx, s.body || "", W - 2 * M)) { if (y > H - M - 90) break; ctx.fillText(l, M, y); y += 58; }
  ctx.globalAlpha = 1;
}
function viewCarousel(root) {
  const idea = area("car-idea", { placeholder: "A list-shaped or step-shaped idea. e.g. 4 things to check before you buy a solid wood bed" });
  const count = select("car-count", ["6", "7", "8", "9", "10"], "8");
  const cta = input("car-cta", { placeholder: "e.g. SAVE or a keyword" });
  const facts = area("car-facts", { placeholder: "Numbers, materials, prices, timelines you can stand behind." });
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  let slides = [];
  const r = runner("Write the carousel", async ({ signal, progress }) => {
    if (!idea.value.trim()) throw new Error("Write the idea first.");
    const o = await askJSON("ig-carousel", [`<task>\nBuild the carousel copy: ${count.value} slides. Slide 1 COVER (headline six words or fewer, one line of promise in body), slide 2 STAKE, then one idea per slide (headline 3 to 7 words, body at most 25 words), then RECAP (the whole thing as a short list), then CTA (one action). Then the caption (Job B: the caption's line one is the hook) and alt text for the cover. Do not write HTML.\n<user_input>\nIdea: ${idea.value}\nCTA: ${cta.value || "(pick one: save, comment a keyword, or follow)"}\nFacts I can use: ${facts.value || "(none)"}\n</user_input>\n</task>`],
      `{"slides":[{"role":"COVER","headline":"...","body":"..."},{"role":"STAKE","headline":"...","body":"..."},{"role":"BODY","headline":"...","body":"..."},{"role":"RECAP","headline":"...","body":"line\\nline"},{"role":"CTA","headline":"...","body":"..."}],"caption":"...","alt_text":"...","missing":[]}`, { signal, progress });
    slides = (Array.isArray(o.slides) ? o.slides : []).map(s => ({ role: str(s.role), headline: T.humanize(str(s.headline), LEX).text.trim(), body: T.humanize(str(s.body), LEX).text.trim() }));
    paint(o);
  });
  function slideFlags(s, i) {
    const f = [];
    const hw = s.headline.split(/\s+/).filter(Boolean).length, bw = s.body.split(/\s+/).filter(Boolean).length;
    if (i === 0 && hw > 6) f.push(`Cover is ${hw} words. Six or fewer.`);
    if (i > 0 && s.role.toUpperCase() !== "RECAP" && bw > 25) f.push(`${bw} words under the headline. 25 max, or split it.`);
    return f;
  }
  function paint(o) {
    clear(out);
    if (!slides.length) { out.append(h("p", { class: "muted" }, "No slides came back. Press the button again.")); return; }
    const grid = h("div", { class: "slides" });
    slides.forEach((s, i) => {
      const cv = h("canvas", { width: 1080, height: 1350, "aria-label": `Slide ${i + 1}` });
      const hl = input(`car-h-${i}`, { value: s.headline, "aria-label": "Headline" });
      const bd = area(`car-b-${i}`, { value: s.body, "aria-label": "Body" });
      const fl = h("div");
      const redraw = () => { s.headline = hl.value; s.body = bd.value; drawSlide(cv, s, i, slides.length); clear(fl).append(...slideFlags(s, i).map(t => h("div", { class: "flag" }, t))); };
      hl.addEventListener("input", redraw); bd.addEventListener("input", redraw);
      grid.append(h("div", { class: "slide" }, cv, h("div", { class: "row" }, pill(s.role || "SLIDE", "plain")), hl, bd, fl));
      redraw();
    });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => slides.forEach((s, i) => drawSlide(grid.children[i].querySelector("canvas"), s, i, slides.length)));
    const cap = T.humanize(str(o.caption), LEX).text.trim();
    const lintBox = h("div").appendChild(captionPanel(cap, [])).parentNode;
    const ed = editableBlock("Caption", cap, t => clear(lintBox).append(captionPanel(t, [])));
    const dl = runner("Download slides (.zip of 1080×1350 PNGs)", async ({ progress }) => {
      progress("Packing slides…");
      if (!window.JSZip) await loadScript("/assets/jszip.min.js");
      const zip = new window.JSZip();
      const cvs = grid.querySelectorAll("canvas");
      for (let i = 0; i < cvs.length; i++) { const blob = await new Promise(r2 => cvs[i].toBlob(r2, "image/png")); zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, blob); }
      zip.file("caption.txt", ed.ta.value + "\n\nALT TEXT\n" + str(o.alt_text));
      const blob = await zip.generateAsync({ type: "blob" });
      const b = Store.brand();
      const a = h("a", { href: URL.createObjectURL(blob), download: `${slug(b ? b.name : "carousel")}-carousel.zip`, hidden: true });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }, { needsClaude: false });
    out.append(h("div", { class: "grouphead" }, h("h2", {}, `Slides (${slides.length})`), h("span", { class: "small muted" }, "Edit any line and the preview redraws. Colours come from your brand voice.")),
      grid, missingNote(strArr(o.missing)), dl.el, h("h2", {}, "Caption"), ed.el, lintBox,
      o.alt_text ? copyBlock("Alt text (cover)", str(o.alt_text)) : null,
      h("div", { class: "row" }, copyBtn(() => slides.map((s, i) => `${i + 1}  ${s.role}\n${s.headline}\n${s.body}`).join("\n\n"), "Copy slide text"),
        saveBtn(() => ({ skill: "ig-carousel", title: slides[0].headline, body: slides.map((s, i) => `${i + 1} ${s.role}: ${s.headline}\n${s.body}`).join("\n\n") + "\n\nCAPTION\n" + ed.ta.value }))));
  }
  root.append(h("div", { class: "panel" }, field("The idea", idea, "Carousels are for ideas with sequence that people re-read. A single claim belongs in a Reel."),
    h("div", { class: "cols3" }, field("Slides", count), field("The one ask", cta), h("div")), field("Facts you can use", facts), r.el), out);
  return { onShow() { const p = Handoff.carousel; if (p) { delete Handoff.carousel; idea.value = p.idea || ""; clear(out); } } };
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the zip tool. Check your connection and try again.")); document.head.append(s); });
}

// ---------------- /ig-story ----------------
function viewStory(root) {
  const today = area("st-today", { placeholder: "What's actually happening today? e.g. Polishing a walnut console for a client in Bandra. Customer asked if teak cracks in the monsoon." });
  const goal = select("st-goal", ["Start DM conversations", "Sell an offer", "Teach one thing", "Behind the scenes"], "Start DM conversations");
  const offer = input("st-offer", { placeholder: "Optional. What you'd sell, plainly." });
  const frames = select("st-frames", ["3", "4", "5", "6", "7"], "5");
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const r = runner("Write today's stories", async ({ signal, progress }) => {
    if (!today.value.trim()) throw new Error("Say what's happening today first.");
    const o = await askJSON("ig-story", [`<task>\nWrite today's story sequence: ${frames.value} frames. Goal: ${goal.value}. The ask (one sticker) goes on frame 4 at the latest.\n<user_input>\nToday: ${today.value}\nOffer: ${offer.value || "(none)"}\n</user_input>\n</task>`],
      `{"frames":[{"visual":"what is filmed, e.g. selfie walking / screen recording","on_screen":"short text","said":"what is said, or empty","sticker":{"type":"poll|question|quiz|slider|link|countdown|add yours","prompt":"...","options":["Yes","Not yet"]}}],"after":"what to do with the answers","missing":[]}`, { signal, progress });
    paint(o);
  });
  function paint(o) {
    clear(out);
    const fr = (Array.isArray(o.frames) ? o.frames : []).map(f => ({ ...f, on_screen: T.humanize(str(f.on_screen), LEX).text.trim(), said: T.humanize(str(f.said), LEX).text.trim() }));
    const askAt = fr.findIndex(f => f.sticker && f.sticker.type);
    const notes = [];
    if (fr.length > 7) notes.push(["warn", `${fr.length} frames. Past about seven, the last ones play to nobody.`]);
    if (askAt >= 4) notes.push(["warn", `The ask is on frame ${askAt + 1}. Move it to frame 4 or earlier.`]);
    if (askAt === -1) notes.push(["warn", "No sticker. Stories without an ask start no conversations."]);
    const text = fr.map((f, i) => `${i + 1}  [${str(f.visual)}]  ${f.on_screen}${f.said ? "\n   said: " + f.said : ""}${f.sticker && f.sticker.type ? `\n   sticker: ${f.sticker.type} - ${str(f.sticker.prompt)}${f.sticker.options && f.sticker.options.length ? " (" + f.sticker.options.join(" / ") + ")" : ""}` : ""}`).join("\n\n") + (o.after ? `\n\nAFTER: ${o.after}` : "");
    out.append(h("h2", {}, `Stories · ${fr.length} frames`),
      h("div", { class: "frames" }, fr.map((f, i) => h("div", { class: "frame" }, h("span", { class: "vis" }, `${i + 1} · ${str(f.visual)}`), h("span", { class: "os" }, f.on_screen), f.said ? h("span", { class: "muted" }, "“" + f.said + "”") : null,
        f.sticker && f.sticker.type ? h("div", { class: "sticker" }, h("b", {}, f.sticker.type.toUpperCase()), " ", str(f.sticker.prompt), f.sticker.options && f.sticker.options.length ? h("div", {}, f.sticker.options.join(" / ")) : null) : null))),
      ...notes.map(([l, t]) => h("div", { class: "note" }, pill(l.toUpperCase(), l), h("span", {}, t))),
      o.after ? h("div", { class: "panel" }, h("h3", {}, "After"), h("p", {}, str(o.after))) : null,
      missingNote(strArr(o.missing)),
      h("div", { class: "row" }, copyBtn(text, "Copy the sequence"), saveBtn(() => ({ skill: "ig-story", title: fr[0] ? fr[0].on_screen : "Stories", body: text }))));
  }
  root.append(h("div", { class: "panel" }, field("What's happening today", today), h("div", { class: "cols3" }, field("Goal", goal), field("Frames", frames), field("Offer", offer)), r.el), out);
  return { onShow() { const p = Handoff.story; if (p) { delete Handoff.story; today.value = p.idea || ""; clear(out); } } };
}

// ---------------- /ig-repurpose ----------------
function viewRepurpose(root) {
  const title = input("rp-title", { placeholder: "e.g. Podcast ep 4: why we stopped using MDF" });
  const src = area("rp-src", { class: "tall", placeholder: "Paste the transcript, article, newsletter or call notes. All of it." });
  const own = h("input", { id: "rp-own", type: "checkbox", checked: true });
  const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  const r = runner("Find the posts in it", async ({ signal, progress }) => {
    if (src.value.trim().length < 200) throw new Error("Paste the whole source. That's too short to pull four posts out of.");
    const o = await askJSON("ig-repurpose", [`<hook_formulas>\n${hooksRef()}\n</hook_formulas>`, logContext(10),
      `<task>\nExtract, do not summarise. Count what you found, list the strongest extracts, then build the week (4 to 6 posts, each standing alone, different hook formulas, strongest claim first, story midweek, mechanism last). ${own.checked ? "The source is the user's own recording, so note which clip to use where you can tell." : ""}\n<pasted title="${title.value.replace(/"/g, "'")}">\n${src.value.slice(0, 120000)}\n</pasted>\n</task>`],
      `{"found":{"claims":0,"numbers":0,"stories":0,"mechanisms":0,"mistakes":0,"lines":0},"thin":false,"thin_note":"","extracts":[{"kind":"claim|number|story|mechanism|mistake|line","text":"verbatim or near-verbatim"}],"week":[{"day":"TUE","format":"REEL|CAROUSEL|STORY","formula_id":2,"angle":"the post in one line","note":"which clip, or what to show"}]}`, { signal, progress });
    paint(o);
  });
  function paint(o) {
    clear(out);
    const f = o.found || {};
    const wk = Array.isArray(o.week) ? o.week : [];
    out.append(h("h2", {}, "What's in it"),
      h("div", { class: "row" }, ["claims", "numbers", "stories", "mechanisms", "mistakes", "lines"].map(k => h("span", { class: "pill plain" }, `${Number(f[k]) || 0} ${k}`))),
      o.thin ? h("div", { class: "note" }, pill("THIN", "warn"), h("span", {}, str(o.thin_note) || "Fewer than four strong extracts. Posts squeezed out of this will be thin too.")) : null,
      h("h2", {}, "The week"),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Day"), h("th", {}, "Format"), h("th", {}, "Hook"), h("th", {}, "Post"), h("th", {}, ""))),
        h("tbody", {}, wk.map(w => h("tr", {}, h("td", { class: "mono" }, str(w.day)), h("td", {}, pill(str(w.format).toUpperCase() || "POST", "plain")), h("td", { class: "small" }, w.formula_id ? formulaLabel(w.formula_id) : "-"),
          h("td", {}, str(w.angle), w.note ? h("div", { class: "small muted" }, str(w.note)) : null),
          h("td", {}, h("button", { class: "btn sm", type: "button", onclick: () => { const fm = str(w.format).toUpperCase(); const payload = { idea: `${str(w.angle)}${w.note ? "\n(" + str(w.note) + ")" : ""}\n\nFrom: ${title.value || "my long-form source"}`, facts: "" }; goTo(fm.startsWith("CAR") ? "carousel" : fm.startsWith("STOR") ? "story" : "reel", payload); } }, "Write this →"))))))),
      Array.isArray(o.extracts) && o.extracts.length ? h("details", { class: "panel" }, h("summary", {}, `All extracts (${o.extracts.length})`), h("ul", { class: "steps" }, o.extracts.map(x => h("li", {}, pill(str(x.kind).toUpperCase() || "-", "plain"), " ", str(x.text))))) : null,
      h("div", { class: "row" }, saveBtn(() => ({ skill: "ig-repurpose", title: title.value || "Repurpose plan", body: wk.map(w => `${w.day}  ${w.format}  ${w.formula_id ? formulaLabel(w.formula_id) : ""}  ${w.angle}`).join("\n") }))));
  }
  root.append(h("div", { class: "panel" }, field("Source title", title), field("The long asset", src), h("label", { class: "check" }, own, "This is my own video or podcast (use the real footage)"), r.el), out);
  return {};
}
