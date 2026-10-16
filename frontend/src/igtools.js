/* igtools.js - JavaScript port of the Instagram Agent pack's five local tools
   (hookscore.py, beats.py, caption.py, humanize.py + detect.py, swipe.py).
   Original: github.com/Jakeschincariol/instagram-agent-skill (MIT). */
(function (root) {
  "use strict";

  // ---------- helpers ----------
  // Convert a Python regex source to a JS RegExp: leading inline flags, \UXXXXXXXX escapes.
  function pyre(src, flags) {
    flags = flags || "";
    let m = /^\(\?([aiLmsux]+)\)/.exec(src);
    if (m) {
      src = src.slice(m[0].length);
      for (const f of m[1]) if ("ims".includes(f) && !flags.includes(f)) flags += f;
    }
    src = src.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h) => "\\u{" + parseInt(h, 16).toString(16) + "}");
    if (!flags.includes("u")) flags += "u";
    try { return new RegExp(src, flags); }
    catch (e) { return new RegExp(src.replace(/\\([^\w\s\\^$.*+?()[\]{}|\/-])/g, "$1"), flags); }
  }
  const countAll = (re, text) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let n = 0, m;
    while ((m = g.exec(text)) !== null) { n++; if (m[0] === "") g.lastIndex++; }
    return n;
  };
  const findAll = (re, text) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const out = []; let m;
    while ((m = g.exec(text)) !== null) { out.push(m.length > 1 && m[1] !== undefined ? m[1] : m[0]); if (m[0] === "") g.lastIndex++; }
    return out;
  };
  const clamp = n => Math.max(0, Math.min(100, n));
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const pstdev = a => { const mu = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - mu) ** 2, 0) / a.length); };
  const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
  const stripQ = w => w.replace(/^['’]+|['’]+$/g, "");

  // ---------- hookscore ----------
  const H_WORD_RE = /[A-Za-z0-9$%'’-]+/g;
  const H_NUMBER_SRC = String.raw`\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|k\b|x\b|hrs?\b|hours?\b|mins?\b|minutes?\b|days?\b|weeks?\b|months?\b|years?\b)?`;
  const H_NUMBER_RE = new RegExp(H_NUMBER_SRC, "gi");
  const H_NUMBER_START = new RegExp("^(?:" + H_NUMBER_SRC + ")", "i");
  const H_PROPER_RE = /(?<!^)\b[A-Z][a-z]{2,}\b/g;
  const H_HASHTAG_RE = /(?:^|\s)#\w+/;
  const H_EMOJI_RE = /[\u{1F300}-\u{1FAFF}☀-➿]/u;
  const SPOKEN_NUMBERS = new Set("zero two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen half twice triple".split(" "));
  const MONEY_WORDS = new Set("dollars dollar bucks grand percent cents millionaire billionaire revenue profit salary rent".split(" "));
  const STAKES = new Set(("stop never wrong mistake mistakes lost lose losing cost costs broke broken failed failure fail nobody no not don't dont doesn't didn't can't won't quit quitting fired deleted delete killed kills kill replaced replaces cut beat free paid charged hired saved first banned illegal worst hate hated wasted waste scam lie lied lying truth secret hidden stole stolen before until instead but except unless problem risk danger warning regret wish should shouldn't still already only without versus vs actually").split(" "));
  const WEAK_OPENERS = ["so", "ok", "okay", "hey", "hi", "hello", "guys", "yo", "alright", "welcome", "today", "basically", "honestly", "look", "listen", "um", "just", "let", "lets", "let's", "i wanted", "i want", "one of", "have you", "did you", "do you", "are you", "in this", "in today", "the thing", "a lot", "there is", "there are", "this is", "it is", "as a", "when it", "if you've", "you know"];
  const IMPERATIVES = new Set("stop steal copy delete try watch read save use build make write send take start quit never always don't dont do put run check".split(" "));
  const DEALBREAKERS = [
    [/^\s*(?:stop scrolling|don'?t scroll)/i, "Opens with \"stop scrolling\". Asking for attention proves you have not earned it."],
    [/\b(?:in (?:this|today'?s) (?:video|reel)|i'?m going to show you|i'?ll show you how)\b/i, "Video preamble. Delete it and open on the payoff."],
    [/^\s*(?:hey |hi |what'?s up |welcome )/i, "Greeting. Nobody came to the feed to be greeted."],
    [H_HASHTAG_RE, "Hashtag in the hook. Hashtags belong at the bottom of the caption, if anywhere."],
    [H_EMOJI_RE, "Emoji in the hook. On-screen text at hook size has room for words or for an emoji, not both."],
  ];
  const hWords = t => (t.replace(/(?<=\d),(?=\d)/g, "").match(H_WORD_RE) || []);

  function hCheckLength(t) {
    const n = hWords(t).length, secs = n / 2.75, chars = [...t.trim()].length;
    let s = (n >= 5 && n <= 12) ? 100 : n < 5 ? clamp(100 - (5 - n) * 20) : clamp(100 - (n - 12) * 11);
    if (chars > 60) s -= 12;
    return [clamp(s), `${n} words, ${chars} chars, ~${secs.toFixed(1)}s spoken (want 5-12 words)`];
  }
  function hCheckSpecificity(t) {
    const nums = (t.match(H_NUMBER_RE) || []).map(x => x.trim()).filter(Boolean);
    const propers = [...new Set(t.match(H_PROPER_RE) || [])];
    const low = hWords(t).map(w => stripQ(w.toLowerCase()));
    const spoken = low.filter(w => SPOKEN_NUMBERS.has(w) || MONEY_WORDS.has(w));
    const hits = nums.length + propers.length + spoken.length;
    const s = hits === 0 ? 15 : clamp(45 + hits * 30);
    const found = [...nums.slice(0, 2), ...propers.sort().slice(0, 2), ...spoken.slice(0, 2)].join(", ");
    return [s, `${hits} concrete marker(s)` + (found ? `: ${found}` : " - no number, no name, nothing checkable")];
  }
  function hCheckStakes(t) {
    const w = hWords(t).map(x => stripQ(x.toLowerCase()));
    const markers = [...new Set(w.filter(x => STAKES.has(x)))].sort();
    if (/\$\s?\d|₹\s?\d/.test(t)) markers.push("a price");
    const n = markers.length;
    const s = n === 0 ? 20 : n === 1 ? 70 : 100;
    return [clamp(s), `${n} tension marker(s)` + (markers.length ? `: ${markers.slice(0, 4).join(", ")}` : " - nothing is at stake in this line")];
  }
  function hCheckFrontload(t) {
    const w = hWords(t);
    if (!w.length) return [0, "empty"];
    const low = w.map(x => stripQ(x.toLowerCase()));
    const opener = low.slice(0, 2).join(" ");
    let penalty = 0, hit = null;
    for (const weak of WEAK_OPENERS) if (opener.startsWith(weak) || low[0] === weak) { penalty = 30; hit = weak; break; }
    let payload = null;
    for (let i = 0; i < low.length; i++) {
      const tok = low[i];
      if (STAKES.has(tok) || SPOKEN_NUMBERS.has(tok) || MONEY_WORDS.has(tok) || H_NUMBER_START.test(w[i])) { payload = i; break; }
    }
    let base, where;
    if (payload === null) { base = 30; where = "no payload word anywhere in the line"; }
    else if (payload <= 3) { base = 100; where = `payload at word ${payload + 1}`; }
    else if (payload <= 6) { base = 70; where = `payload at word ${payload + 1}, could move forward`; }
    else { base = 40; where = `payload at word ${payload + 1}, too late`; }
    return [clamp(base - penalty), where + (hit ? `; weak opener "${hit}"` : "")];
  }
  function hCheckAddress(t) {
    const low = t.toLowerCase();
    const w = hWords(t).map(x => stripQ(x.toLowerCase()));
    if (/\b(you|your|you're|youre|yourself)\b/.test(low)) return [100, "speaks to the viewer"];
    if (w.length && IMPERATIVES.has(w[0])) return [90, `imperative opener ("${w[0]}")`];
    if (/\b(i|my|me|we|our)\b/.test(low)) return [70, "first person, no viewer named"];
    return [35, "third person, nobody in the room"];
  }
  const HOOK_CHECKS = ["LENGTH", "SPECIFICITY", "STAKES", "FRONTLOAD", "ADDRESS"];
  function scoreHook(text) {
    const r = { LENGTH: hCheckLength(text), SPECIFICITY: hCheckSpecificity(text), STAKES: hCheckStakes(text), FRONTLOAD: hCheckFrontload(text), ADDRESS: hCheckAddress(text) };
    const flags = DEALBREAKERS.filter(([p]) => p.test(text)).map(([, m]) => m);
    const scores = HOOK_CHECKS.map(c => r[c][0]);
    const overall = clamp(mean(scores) * 0.6 + Math.min(...scores) * 0.4 - flags.length * 15);
    const verdict = overall >= 70 && Math.min(...scores) >= 55 && !flags.length ? "STRONG" : overall >= 50 ? "OK" : "WEAK";
    const weakest = HOOK_CHECKS.reduce((a, c) => r[c][0] < r[a][0] ? c : a, HOOK_CHECKS[0]);
    return { hook: text, checks: Object.fromEntries(HOOK_CHECKS.map(c => [c, { score: r[c][0], detail: r[c][1] }])), overall, verdict, flags, weakest };
  }
  function rankHooks(lines) {
    return lines.map(l => l.trim()).filter(Boolean).map(scoreHook).sort((a, b) => b.overall - a.overall);
  }

  // ---------- beats ----------
  const B_SENT_RE = /[^.!?]+[.!?]*/g;
  const B_CONCRETE_RE = /\$\s?\d|₹\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm;
  const B_STOP = new Set("the a an and or but if of to in on for with that this it is are was were be been you your i my me we our they them he she so just not no do did does have has had will can at as by from out up off one all".split(" "));
  const HOOK_WINDOW = 3.0, MAX_BEAT = 4.0, ABSTRACT_RUN = 3;
  const tc = s => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, "0")}`; };
  const prettyNum = tok => tok.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
  function splitBeats(raw, wps) {
    const beats = [];
    for (const line of raw.split(/\r?\n/).map(l => l.trim())) {
      if (!line) continue;
      if (hWords(line).length / wps <= MAX_BEAT * 1.5) { beats.push(line); continue; }
      const parts = (line.match(B_SENT_RE) || []).map(p => p.trim()).filter(Boolean);
      let buf = "";
      for (const part of parts) {
        const cand = (buf + " " + part).trim();
        if (buf && hWords(cand).length / wps > MAX_BEAT) { beats.push(buf); buf = part; } else buf = cand;
      }
      if (buf) beats.push(buf);
    }
    return beats;
  }
  function beatSheet(raw, wpm = 165, target = null) {
    const wps = wpm / 60;
    const beats = splitBeats(raw, wps);
    if (!beats.length) return null;
    const rows = []; let clock = 0;
    beats.forEach((text, i) => {
      const n = hWords(text).length, dur = n / wps;
      rows.push({ n: i + 1, start: clock, dur, words: n, text, concrete: countAll(B_CONCRETE_RE, text), label: "", flags: [] });
      clock += dur;
    });
    const total = clock;
    for (const r of rows) if (r.n === 1 || r.start + r.dur <= HOOK_WINDOW) r.label = "HOOK";
    rows[rows.length - 1].label = rows[rows.length - 1].label !== "HOOK" ? "CTA" : "HOOK/CTA";
    const half = total / 2;
    for (const r of rows) if (!r.label && r.start <= half && half < r.start + r.dur) r.label = "MID";
    const notes = [];
    if (rows[0].dur > HOOK_WINDOW) {
      rows[0].flags.push(`hook runs ${rows[0].dur.toFixed(1)}s, past the 3s mark`);
      notes.push({ level: "fail", text: `Beat 1 takes ${rows[0].dur.toFixed(1)}s to say. Cut it to ${Math.floor(HOOK_WINDOW * wps)} words or fewer, or the hook lands after the decision has been made.` });
    }
    if (rows[0].concrete === 0) notes.push({ level: "warn", text: "Beat 1 has no number and no name in it. Hooks without something checkable are the ones that get scrolled." });
    for (const r of rows) if (r.dur > MAX_BEAT) r.flags.push(`${r.dur.toFixed(1)}s on one beat`);
    const long = rows.filter(r => r.dur > MAX_BEAT).map(r => r.n);
    if (long.length) notes.push({ level: "warn", text: `Beat(s) ${long.join(", ")} run past 4s. Either split the line or change what is on screen inside it. A static frame is where people leave.` });
    let run = 0, start = null;
    for (const r of rows) {
      if (r.concrete === 0) { run++; if (start === null) start = r.n; if (run === ABSTRACT_RUN) notes.push({ level: "warn", text: `Beats ${start}-${r.n} have nothing concrete in them. Put a number, a name or a price in one of them.` }); }
      else { run = 0; start = null; }
    }
    const first = new Set(hWords(rows[0].text).map(w => w.toLowerCase()).filter(w => !B_STOP.has(w)));
    const last = new Set(hWords(rows[rows.length - 1].text).map(w => w.toLowerCase()).filter(w => !B_STOP.has(w)));
    const loop = [...first].filter(w => last.has(w)).map(prettyNum).sort();
    if (loop.length) notes.push({ level: "pass", text: `Loops: the last beat repeats "${loop.slice(0, 3).join(", ")}" from the hook. Second watches are free reach.` });
    else notes.push({ level: "warn", text: "No loop. The last beat shares no word with the hook, so the video ends flat. Echoing one word from beat 1 is the cheapest replay you get." });
    if (target) {
      const d = total - target;
      if (Math.abs(d) <= target * 0.1) notes.push({ level: "pass", text: `Length is on target (${total.toFixed(1)}s against ${target}s).` });
      else if (d > 0) notes.push({ level: "warn", text: `${d.toFixed(1)}s over target. Cut about ${Math.floor(d * wps)} words.` });
      else notes.push({ level: "info", text: `${(-d).toFixed(1)}s under target. Either add ${Math.floor(-d * wps)} words or shoot it short. Short is usually right.` });
    }
    return { wpm, target, total, totalWords: rows.reduce((s, r) => s + r.words, 0), beats: rows.map(r => ({ ...r, tc: tc(r.start) })), notes };
  }

  // ---------- caption ----------
  const C_LIMIT = 2200, C_TRUNC = 125, C_TAGS = 5;
  const C_HASHTAG_RE = /(?:^|\s)(#[A-Za-z0-9_]+)/g;
  const C_MENTION_RE = /(?:^|\s)(@[A-Za-z0-9_.]+)/g;
  const C_LINK_RE = /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app|in)\/\S*/gi;
  const C_EMOJI_RE = /[\u{1F300}-\u{1FAFF}☀-➿←-⇿️]/gu;
  const C_CONCRETE_RE = /\$\s?\d|₹\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm;
  const C_ASKS = [
    [/\bcomment (?:the word |")?[A-Z0-9]{2,}\b/i, "comment a keyword"],
    [/\b(?:dm|message) me\b/i, "DM me"],
    [/\bsave (?:this|it)\b/i, "save this"],
    [/\bshare (?:this|it)\b/i, "share this"],
    [/\bfollow (?:me|for)\b/i, "follow"],
    [/\blink in (?:my )?bio\b/i, "link in bio"],
    [/\b(?:swipe|tap) (?:through|left|right|for|to)\b/i, "swipe or tap"],
    [/\btell me\b|\bwhat would you\b|\bwhich one\b/i, "answer a question"],
  ];
  const FILLER_TAGS = new Set(["#viral", "#fyp", "#explore", "#explorepage", "#foryou", "#foryoupage", "#trending", "#instagood", "#love", "#follow", "#like4like", "#reels", "#reelsinstagram", "#viralreels", "#instadaily"]);
  function lintCaption(text, keywords = [], cut = C_TRUNC) {
    const stripped = text.replace(/\s+$/, "").trim();
    const chars = [...stripped].length;
    const firstLine = (stripped.split("\n")[0] || "").trim();
    const tags = findAll(C_HASHTAG_RE, stripped);
    const links = stripped.match(C_LINK_RE) || [];
    const emoji = stripped.match(C_EMOJI_RE) || [];
    const window = chars <= cut ? stripped : [...stripped].slice(0, cut).join("");
    const truncated = chars > cut;
    const asks = C_ASKS.filter(([p]) => p.test(stripped)).map(([, n]) => n);
    const filler = tags.filter(t => FILLER_TAGS.has(t.toLowerCase()));
    keywords = keywords.map(k => k.trim()).filter(Boolean);
    const checks = [];
    const add = (check, status, detail) => checks.push({ check, status, detail });
    add("LENGTH", chars > C_LIMIT ? "FAIL" : "PASS", `${chars} / ${C_LIMIT} characters` + (chars > C_LIMIT ? `, ${chars - C_LIMIT} over the limit` : ""));
    const flen = [...firstLine].length;
    if (!firstLine) add("FIRST LINE", "FAIL", "the caption opens on a blank line");
    else if (firstLine.startsWith("#") || firstLine.startsWith("@")) add("FIRST LINE", "FAIL", "opens on a hashtag or a mention, which is the one position worth a sentence");
    else if (flen > cut) add("FIRST LINE", "WARN", `${flen} characters, so it gets cut at ${cut} mid-thought. Fine if the cut is a cliffhanger, bad if it is a subordinate clause`);
    else add("FIRST LINE", "PASS", `${flen} characters, lands whole`);
    const conc = countAll(C_CONCRETE_RE, window);
    add("HOOK IS CONCRETE", conc ? "PASS" : "WARN", `${conc} number(s) or name(s) in the visible window` + (conc ? "" : " - nothing checkable before the tap"));
    if (tags.length > C_TAGS) add("HASHTAGS", "FAIL", `${tags.length} tags, over Instagram's cap of ${C_TAGS}. Tags past the fifth do not count and the block reads as old`);
    else if (tags.length === C_TAGS && filler.length) add("HASHTAGS", "WARN", `${tags.length} tags, at the cap, and ${filler.length} of them generic. Spend the five on topics`);
    else if (filler.length) add("HASHTAGS", "WARN", `${tags.length} tags, ${filler.length} of them generic (${filler.slice(0, 3).join(", ")}). Those describe nothing`);
    else add("HASHTAGS", "PASS", `${tags.length} tag(s)` + (tags.length ? `: ${tags.join(" ")}` : ""));
    if (!tags.length) add("TAG PLACEMENT", "PASS", "no tags to place");
    else if (tags.some(t => new RegExp("(?:^|\\s)" + reEsc(t) + "\\b").test(window))) add("TAG PLACEMENT", "WARN", "a hashtag is inside the visible window, spending feed space on a label");
    else add("TAG PLACEMENT", "PASS", "tags are below the fold");
    add("LINKS", links.length ? "WARN" : "PASS", links.length ? `${links.length} link(s) in the caption, and captions are not clickable. Move it to the bio or the DM` : "no dead links in the body");
    if (asks.length === 1) add("ONE ASK", "PASS", `one call to action: ${asks[0]}`);
    else if (!asks.length) add("ONE ASK", "WARN", "no call to action. Decide what this post is for");
    else add("ONE ASK", "WARN", `${asks.length} asks (${asks.join(", ")}). Two asks is the same as none`);
    const density = emoji.length * 100 / Math.max(chars, 1);
    add("EMOJI", density > 4 ? "WARN" : "PASS", `${emoji.length} emoji, ${density.toFixed(1)} per 100 characters` + (density > 4 ? " - reads as decoration" : ""));
    if (keywords.length) {
      const low = stripped.toLowerCase(), wl = window.toLowerCase();
      const found = keywords.filter(k => low.includes(k.toLowerCase()));
      const missing = keywords.filter(k => !low.includes(k.toLowerCase()));
      const inWin = found.filter(k => wl.includes(k.toLowerCase()));
      add("SEARCH TERMS", !missing.length ? "PASS" : found.length ? "WARN" : "FAIL",
        `${found.length}/${keywords.length} present` + (found.length ? `, ${inWin.length} in the visible window` : "") + (missing.length ? `. Missing: ${missing.join(", ")}` : ""));
    }
    const fails = checks.filter(c => c.status === "FAIL").length, warns = checks.filter(c => c.status === "WARN").length;
    return { characters: chars, limit: C_LIMIT, cut, visible: window, truncated, hashtags: tags, links, emoji: emoji.length, asks, checks, verdict: fails ? "FIX" : warns ? "REVIEW" : "READY" };
  }

  // ---------- humanize ----------
  const URL_RE = /https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g;
  const HU_SENT_RE = /[^.!?\n]+[.!?]*/g;
  function cp(spec) {
    if (spec.includes("-")) { const [a, b] = spec.split("-"); return [parseInt(a.slice(2), 16), parseInt(b.slice(2), 16)]; }
    return parseInt(spec.slice(2), 16);
  }
  const uEsc = n => "\\u{" + n.toString(16) + "}";
  function passInvisible(text, lex) {
    const hits = [];
    for (const e of lex.invisible) {
      const c = cp(e.cp);
      const re = new RegExp(Array.isArray(c) ? `[${uEsc(c[0])}-${uEsc(c[1])}]` : uEsc(c), "gu");
      const n = countAll(re, text);
      if (n) { hits.push({ name: e.cp + " " + e.name, count: n, action: e.action }); text = text.replace(re, e.action === "delete" ? "" : " "); }
    }
    const stray = (text.match(/\p{Cf}/gu) || []).length;
    if (stray) { hits.push({ name: "other invisible format chars", count: stray, action: "delete" }); text = text.replace(/\p{Cf}/gu, ""); }
    return [text, hits];
  }
  function passTypographic(text, lex) {
    const hits = [];
    for (const e of lex.typographic) {
      const ch = e.from; const n = text.split(ch).length - 1;
      if (!n) continue;
      hits.push({ name: `${ch} ${e.name}`, count: n, to: e.to.trim() || "(space)" });
      if (ch === "—") text = text.replace(/\s*—\s*/g, ", ");
      else if (ch === "–") { text = text.replace(/\s*–\s*(?=\d)/g, "-"); text = text.replace(/\s+–\s+/g, ", "); text = text.split("–").join("-"); }
      else text = text.split(ch).join(e.to);
    }
    text = text.replace(/,\s*([,.;:!?])/g, "$1");
    text = text.replace(/,\s*\n/g, "\n");
    return [text, hits];
  }
  function matchCase(src, repl) {
    if (!repl) return repl;
    const isUpper = src === src.toUpperCase() && src !== src.toLowerCase();
    if (isUpper && src.length > 1) return repl.toUpperCase();
    if (src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase()) return repl[0].toUpperCase() + repl.slice(1);
    return repl;
  }
  const lexRe = find => new RegExp("\\b" + reEsc(find).replace(/ /g, "\\s+") + "\\b", "gi");
  function passLexical(text, lex) {
    const hits = [];
    const entries = [...lex.phrases, ...lex.words].sort((a, b) => b.find.length - a.find.length);
    for (const e of entries) {
      const re = lexRe(e.find);
      const n = countAll(re, text);
      if (!n) continue;
      hits.push({ find: e.find, replace: e.replace || "(deleted)", count: n, family: e.family });
      text = text.replace(re, m => matchCase(m, e.replace));
    }
    text = text.replace(/[ \t]{2,}/g, " ");
    text = text.replace(/^[ \t]*(?:[,.;:]+[ \t]*)+/gm, "");
    text = text.replace(/^[ \t](?=\S)/gm, "");
    text = text.replace(/\s+([,.;:!?])/g, "$1");
    text = text.replace(/,\s*([,.;:!?])/g, "$1");
    text = text.split("...").join("\x00ELL\x00");
    text = text.replace(/\.\s*\.+/g, ".");
    text = text.replace(/([!?])\s*\./g, "$1");
    text = text.split("\x00ELL\x00").join("...");
    text = text.replace(/^[ \t]+$/gm, "");
    text = text.replace(/\n{3,}/g, "\n\n");
    text = text.replace(/,\s*(also|so|still|basically|in the end)\s*,\s*/g, (_, w) => ". " + w[0].toUpperCase() + w.slice(1) + ", ");
    return [text, hits];
  }
  let _structCache = null;
  function structures(lex) {
    if (_structCache && _structCache.lex === lex) return _structCache.list;
    const list = [];
    for (const s of lex.structures) { try { list.push({ ...s, re: pyre(s.regex, "g") }); } catch (e) { /* skip like python */ } }
    _structCache = { lex, list };
    return list;
  }
  function scanStructures(text, lex) {
    const flags = [];
    for (const s of structures(lex)) { const n = countAll(s.re, text); if (n) flags.push({ name: s.name, count: n, fix: s.fix }); }
    const lens = (text.match(HU_SENT_RE) || []).map(s => s.split(/\s+/).filter(Boolean).length).filter(n => n > 2);
    if (lens.length >= 4) {
      const mu = mean(lens), cv = mu ? pstdev(lens) / mu : 0;
      if (cv < 0.35) flags.push({ name: `Uniform sentence length (variation ${cv.toFixed(2)})`, count: lens.length, fix: "Break one sentence in half. Let another run long. Machines write even." });
    }
    return flags;
  }
  function restoreCapitals(original, text) {
    const starts = []; const re = /(?:^|[.!?]\s+|\n)\s*([A-Za-z])/g; let m;
    while ((m = re.exec(original)) !== null) starts.push(m[1]);
    if (!starts.length || starts.filter(c => c === c.toUpperCase()).length * 2 < starts.length) return text;
    return text.replace(/(?:^|(?<=[.!?] )|(?<=[.!?]\n)|(?<=\n))\s*([a-z])/g, (g0, g1) => g0.slice(0, -1) + g1.toUpperCase());
  }
  function humanize(text, lex) {
    const raw = text; const urls = [];
    text = text.replace(URL_RE, m => { urls.push(m); return `\x00URL${urls.length - 1}\x00`; });
    let inv, typo, lexi;
    [text, inv] = passInvisible(text, lex);
    [text, typo] = passTypographic(text, lex);
    [text, lexi] = passLexical(text, lex);
    text = restoreCapitals(raw, text);
    urls.forEach((u, i) => { text = text.split(`\x00URL${i}\x00`).join(u); });
    const report = { invisible: inv, typographic: typo, lexical: lexi, structures: scanStructures(text, lex) };
    report.removed = [...inv, ...typo, ...lexi].reduce((s, h) => s + h.count, 0);
    return { text: text.trim() + "\n", report };
  }

  // ---------- detect ----------
  const D_SENT_RE = /[^.!?\n]+[.!?]*/g;
  const D_WORD_RE = /[A-Za-z']+/g;
  const D_CONTR = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;
  const D_PRON = /\b(i|me|my|mine|we|us|our|you|your)\b/gi;
  const D_NUM = /\b\d[\d,.]*%?\b|\$\d|₹\d/g;
  const D_PROPER = /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm;
  const scale = (v, human, machine) => human === machine ? 50 : clamp((v - machine) / (human - machine) * 100);
  const dSentences = t => (t.match(D_SENT_RE) || []).map(s => s.trim()).filter(s => s.split(/\s+/).filter(Boolean).length > 2);
  const dWords = t => t.match(D_WORD_RE) || [];
  function dBurst(t) {
    const lens = dSentences(t).map(s => s.split(/\s+/).filter(Boolean).length);
    if (lens.length < 4) return [50, "too short to judge"];
    const mu = mean(lens), cv = mu ? pstdev(lens) / mu : 0;
    return [scale(cv, 0.70, 0.22), `variation ${cv.toFixed(2)} across ${lens.length} sentences (want 0.55+)`];
  }
  function dSpec(t) {
    const w = dWords(t); if (w.length < 25) return [50, "too short to judge"];
    const hits = (t.match(D_NUM) || []).length + new Set(t.match(D_PROPER) || []).size;
    const d = hits * 100 / w.length;
    return [scale(d, 6.0, 0.5), `${hits} concrete markers, ${d.toFixed(1)} per 100 words (want 4+)`];
  }
  function dSlop(t, lex) {
    const w = dWords(t); if (!w.length) return [50, "empty"];
    let hits = 0; const found = [];
    for (const e of [...lex.words, ...lex.phrases]) { const n = countAll(lexRe(e.find), t); if (n) { hits += n; found.push(e.find); } }
    const d = hits * 100 / w.length;
    let detail = `${hits} stock terms, ${d.toFixed(1)} per 100 words`;
    if (found.length) detail += " (" + found.sort().slice(0, 4).join(", ") + (found.length > 4 ? ", ..." : "") + ")";
    return [scale(d, 0, 4.0), detail];
  }
  function dPrint(t) {
    const inv = (t.match(/\p{Cf}/gu) || []).length;
    const cnt = ch => t.split(ch).length - 1;
    const em = cnt("—"), curly = ["‘", "’", "“", "”"].reduce((s, c) => s + cnt(c), 0), ell = cnt("…");
    const nb = [" ", " ", " "].reduce((s, c) => s + cnt(c), 0);
    const total = inv * 4 + em * 2 + curly + ell + nb;
    const per1k = total * 1000 / Math.max([...t].length, 1);
    return [scale(per1k, 0, 12.0), `${inv} invisible, ${em} em dash, ${curly} curly quote, ${ell} ellipsis, ${nb} hard space`];
  }
  function dVoice(t, lex) {
    const w = dWords(t); if (w.length < 25) return [50, "too short to judge"];
    const per = 100 / w.length;
    const con = countAll(D_CONTR, t) * per, per2 = countAll(D_PRON, t) * per;
    let tells = 0; const names = [];
    for (const s of structures(lex)) { const n = countAll(s.re, t); if (n) { tells += n; names.push(s.id); } }
    const bullets = []; const bre = /^\s*[-*•]\s+(.+)$/gm; let m;
    while ((m = bre.exec(t)) !== null) bullets.push(m[1].split(/\s+/).filter(Boolean).length);
    const uniform = bullets.length >= 3 && pstdev(bullets) < 1.6;
    let s = scale(con, 3.0, 0) * 0.35 + scale(per2, 8.0, 1.0) * 0.35 + clamp(100 - tells * 22) * 0.30;
    if (uniform) { s -= 12; names.push("uniform-bullets"); }
    let detail = `${con.toFixed(1)} contractions, ${per2.toFixed(1)} personal pronouns per 100 words, ${tells} structural tell(s)`;
    if (names.length) detail += " [" + names.slice(0, 4).join(", ") + "]";
    return [clamp(s), detail];
  }
  const DETECT_CHECKS = ["BURSTINESS", "SPECIFICITY", "SLOP DENSITY", "FINGERPRINT", "VOICE"];
  function detect(text, lex) {
    const r = { BURSTINESS: dBurst(text), SPECIFICITY: dSpec(text), "SLOP DENSITY": dSlop(text, lex), FINGERPRINT: dPrint(text), VOICE: dVoice(text, lex) };
    const scores = DETECT_CHECKS.map(c => r[c][0]);
    const overall = mean(scores) * 0.6 + Math.min(...scores) * 0.4;
    const verdict = overall >= 70 && Math.min(...scores) >= 55 ? "PASS" : overall >= 50 ? "REVIEW" : "FLAGGED";
    const weakest = DETECT_CHECKS.reduce((a, c) => r[c][0] < r[a][0] ? c : a, DETECT_CHECKS[0]);
    return { checks: Object.fromEntries(DETECT_CHECKS.map(c => [c, { score: r[c][0], detail: r[c][1] }])), overall, verdict, weakest };
  }

  // ---------- swipe ----------
  let _formCache = null;
  function formulas(hooksData) {
    if (_formCache && _formCache.d === hooksData) return _formCache.list;
    const byId = Object.fromEntries(hooksData.hooks.map(h => [h.id, h]));
    const order = hooksData.classify_order || Object.keys(byId).map(Number).sort((a, b) => a - b);
    const list = order.filter(i => byId[i]).map(i => ({ id: byId[i].id, name: byId[i].name, re: pyre(byId[i].match, "i") }));
    _formCache = { d: hooksData, list };
    return list;
  }
  function classify(hook, hooksData) {
    for (const f of formulas(hooksData)) if (f.re.test(hook)) return [f.id, f.name];
    return [null, "unclassified"];
  }
  function parseRows(raw) {
    const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.trimStart().startsWith("#"));
    if (!lines.length) return [];
    const sep = lines[0].includes("\t") ? "\t" : ",";
    const head = lines[0].split(sep).map(c => c.trim().toLowerCase());
    let cols, body;
    if (head.includes("views") && head.includes("hook")) { cols = head; body = lines.slice(1); }
    else { cols = ["account", "followers", "views", "hook"]; body = lines; }
    const rows = [];
    for (const line of body) {
      let cells = line.split(sep);
      if (sep === "," && cells.length > cols.length) { const hi = cols.indexOf("hook"); if (hi === cols.length - 1) cells = [...cells.slice(0, hi), cells.slice(hi).join(",")]; }
      while (cells.length < cols.length) cells.push("");
      const r = Object.fromEntries(cols.map((c, i) => [c, (cells[i] || "").trim()]));
      r.views = parseNum(r.views) || 0;
      r.followers = parseNum(r.followers); r.median = parseNum(r.median);
      if (r.views && r.hook) rows.push(r);
    }
    return rows;
  }
  function parseNum(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "number") return v;
    const s = String(v).trim().toLowerCase().replace(/,/g, "");
    const m = /^([\d.]+)\s*(k|m|l|lakh|cr|crore)?/.exec(s);
    if (!m) { const d = s.replace(/[^\d]/g, ""); return d ? parseInt(d, 10) : null; }
    const mult = { k: 1e3, m: 1e6, l: 1e5, lakh: 1e5, cr: 1e7, crore: 1e7 }[m[2]] || 1;
    return Math.round(parseFloat(m[1]) * mult);
  }
  function swipe(rows, hooksData) {
    rows = rows.map(r => ({ ...r }));
    const usedMedian = rows.some(r => r.median);
    for (const r of rows) {
      const base = r.median || r.followers || 0;
      r.baseline = base;
      r.outlier = base ? Math.round(r.views / base * 100) / 100 : null;
      [r.formula_id, r.formula] = classify(r.hook, hooksData);
      r.words = hWords(r.hook).length;
      const hs = scoreHook(r.hook); r.hook_score = hs.overall; r.hook_verdict = hs.verdict;
    }
    const ranked = rows.sort((a, b) => (b.outlier || 0) - (a.outlier || 0));
    const third = Math.max(1, Math.floor(ranked.length / 3));
    const top = ranked.slice(0, third), bottom = ranked.slice(-third);
    const med = (items, k) => { const v = items.map(i => i[k]).filter(x => x !== null && x !== undefined); return v.length ? Math.round(median(v) * 10) / 10 : null; };
    const counts = {};
    for (const r of top) counts[r.formula] = (counts[r.formula] || 0) + 1;
    return {
      baseline: usedMedian ? "account median" : "follower count", n: ranked.length,
      accounts: new Set(ranked.map(r => r.account || "")).size, reels: ranked,
      topFormulas: Object.entries(counts).sort((a, b) => b[1] - a[1]),
      topHookScore: med(top, "hook_score"), bottomHookScore: med(bottom, "hook_score"),
      topWords: med(top, "words"), bottomWords: med(bottom, "words"),
      unclassified: ranked.filter(r => r.formula === "unclassified").length,
    };
  }

  const api = { pyre, scoreHook, rankHooks, beatSheet, lintCaption, humanize, detect, swipe, parseRows, parseNum, classify, HOOK_CHECKS, DETECT_CHECKS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.IGTools = api;
})(typeof window !== "undefined" ? window : globalThis);
