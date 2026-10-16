"use strict";
/* ===== Sign-in gate, first-run setup, and the Team & account page ===== */

const Auth = {
  user: null, booted: false, onReady: null,
  isAdmin() { return !!(this.user && this.user.role === "admin"); },
  async start(onReady) {
    this.onReady = onReady;
    let res = null;
    try { res = await fetch("/api/me", { credentials: "same-origin" }); } catch (e) { /* offline */ }
    if (res && res.ok) { this.user = (await res.json()).user; return this.enter(); }
    let setup = { needed: false, enabled: false };
    try { setup = await api("GET", "/setup"); } catch (e) { /* show login anyway */ }
    this.showGate(setup.needed ? "setup" : "login", setup);
  },
  enter() {
    const gate = $("#gate"); clear(gate); gate.className = "";
    $("#app").hidden = false;
    if (!this.booted) { this.booted = true; this.onReady(); }
    else Store.refresh();
  },
  expired() { if (this.booted && !$("#gate").firstChild) this.showGate("login", {}, true); },
  showGate(mode, setup, overlay) {
    const gate = clear($("#gate"));
    gate.className = "gate" + (overlay ? " overlay" : "");
    if (!overlay) $("#app").hidden = true;
    const status = h("p", { class: "run-status", "aria-live": "polite" });
    const email = input("lg-email", { type: "email", autocomplete: "username", required: true });
    const pw = input("lg-pw", { type: "password", autocomplete: mode === "setup" ? "new-password" : "current-password", required: true });
    const name = input("lg-name", { autocomplete: "name" });
    const token = input("lg-token", { autocomplete: "off" });
    const btn = h("button", { class: "btn primary", type: "submit" }, mode === "setup" ? "Create the admin login" : "Sign in");
    const form = h("form", { class: "panel gate-card", novalidate: true },
      h("div", { class: "wordmark" }, h("b", {}, "Digify Instagram Studio"), h("span", {}, "13 skills · you post")),
      mode === "setup"
        ? [h("h2", {}, "First-time setup"),
          setup.enabled
            ? h("p", { class: "small muted" }, "No one has a login yet. Create the first admin. The setup code is the SETUP_TOKEN value from the server's environment variables.")
            : h("p", { class: "small" }, "No one has a login yet. Set SETUP_TOKEN in the server's environment variables and restart the app, or run: npm run create-user -- you@digify.marketing \"Your Name\" admin"),
          field("Setup code", token), field("Your name", name)]
        : [h("h2", {}, overlay ? "You've been signed out" : "Sign in"), overlay ? h("p", { class: "small muted" }, "Sign in again to carry on. Your work on this page is still here.") : null],
      field("Email", email), field("Password", pw, mode === "setup" ? "At least 10 characters." : null),
      h("div", { class: "row" }, btn), status,
      mode === "login" ? h("p", { class: "small muted" }, "No login? Ask your Digify admin to add you.") : null);
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); status.classList.remove("err"); status.textContent = ""; btn.disabled = true;
      try {
        const body = mode === "setup"
          ? { token: token.value.trim(), name: name.value, email: email.value.trim(), password: pw.value }
          : { email: email.value.trim(), password: pw.value };
        const j = await api("POST", mode === "setup" ? "/setup" : "/login", body);
        this.user = j.user; this.enter();
      } catch (e) { status.textContent = e.message || errText(e); status.classList.add("err"); }
      finally { btn.disabled = false; }
    });
    gate.append(form);
    setTimeout(() => (mode === "setup" ? token : email).focus(), 0);
  },
  async signOut() {
    try { await api("POST", "/logout", {}); } catch (e) { /* signing out anyway */ }
    location.hash = ""; location.reload();
  },
};
window.Auth = Auth;

// ---------------- Team & account ----------------
function viewAccount(root) {
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } });
  root.append(body);

  function passwordPanel() {
    const cur = input("ac-cur", { type: "password", autocomplete: "current-password" });
    const next = input("ac-next", { type: "password", autocomplete: "new-password" });
    const st = h("span", { class: "run-status", "aria-live": "polite" });
    const btn = h("button", { class: "btn", type: "button" }, "Change my password");
    btn.onclick = async () => {
      st.classList.remove("err"); btn.disabled = true;
      try { await api("POST", "/me/password", { current: cur.value, next: next.value }); cur.value = next.value = ""; st.textContent = "Changed. Other devices are signed out."; }
      catch (e) { st.textContent = e.message; st.classList.add("err"); } finally { btn.disabled = false; }
    };
    return h("div", { class: "panel" }, h("h2", {}, "Your login"),
      h("p", { class: "small muted" }, `${Auth.user.name} · ${Auth.user.email} · ${Auth.user.role}`),
      h("div", { class: "cols" }, field("Current password", cur), field("New password", next, "At least 10 characters.")),
      h("div", { class: "row" }, btn, st));
  }

  async function teamPanel() {
    const panel = h("div", { class: "panel" }, h("h2", {}, "Team"), h("p", { class: "small muted" }, "Loading…"));
    const { users } = await api("GET", "/admin/users");
    const rows = users.map(u => {
      const role = select("tm-role-" + u.id, [["member", "Member"], ["admin", "Admin"]], u.role);
      const st = h("span", { class: "small muted" });
      role.onchange = async () => { try { await api("PATCH", "/admin/users/" + u.id, { role: role.value }); st.textContent = "Saved"; } catch (e) { st.textContent = e.message; role.value = u.role; } };
      const reset = h("button", { class: "btn sm ghost", type: "button" }, "Set password");
      reset.onclick = async () => {
        const pw = prompt(`New password for ${u.name} (at least 10 characters). Share it with them privately.`);
        if (!pw) return;
        try { await api("PATCH", "/admin/users/" + u.id, { password: pw }); st.textContent = "Password set"; } catch (e) { st.textContent = e.message; }
      };
      let armed = false;
      const del = h("button", { class: "btn sm ghost", type: "button", hidden: u.id === Auth.user.id }, "Remove");
      del.onclick = async () => {
        if (!armed) { armed = true; del.textContent = "Click again to remove"; return; }
        try { await api("DELETE", "/admin/users/" + u.id); paint(); } catch (e) { st.textContent = e.message; }
      };
      return h("tr", {}, h("td", {}, h("b", {}, u.name), h("div", { class: "small muted" }, u.email)), h("td", {}, role), h("td", {}, h("div", { class: "row" }, reset, del, st)));
    });
    const nEmail = input("tm-email", { type: "email", placeholder: "name@digify.marketing" });
    const nName = input("tm-name");
    const nPw = input("tm-pw", { type: "text", autocomplete: "off", placeholder: "At least 10 characters" });
    const nRole = select("tm-new-role", [["member", "Member"], ["admin", "Admin"]], "member");
    const st = h("span", { class: "run-status", "aria-live": "polite" });
    const add = h("button", { class: "btn primary", type: "button" }, "Add login");
    add.onclick = async () => {
      st.classList.remove("err"); add.disabled = true;
      try { await api("POST", "/admin/users", { email: nEmail.value.trim(), name: nName.value, password: nPw.value, role: nRole.value }); paint(); }
      catch (e) { st.textContent = e.message; st.classList.add("err"); } finally { add.disabled = false; }
    };
    clear(panel).append(h("h2", {}, "Team"),
      h("p", { class: "small muted" }, "Everyone here sees every brand. Members can do everything except delete brands and manage logins."),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Person"), h("th", {}, "Role"), h("th", {}, ""))), h("tbody", {}, rows))),
      h("h3", {}, "Add someone"),
      h("div", { class: "cols" }, field("Email", nEmail), field("Name", nName), field("Starting password", nPw, "Share it privately. They can change it on this page."), field("Role", nRole)),
      h("div", { class: "row" }, add, st));
    return panel;
  }

  async function usagePanel() {
    const days = select("us-days", [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]], "30");
    const out = h("div");
    const load = async () => {
      clear(out).append(h("p", { class: "small muted" }, "Loading…"));
      try {
        const u = await api("GET", "/admin/usage?days=" + days.value);
        const usd = n => "$" + n.toFixed(2);
        const table = (title, list) => h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, title), h("th", {}, "Requests"), h("th", {}, "Failed"), h("th", {}, "Tokens in / out"), h("th", {}, "Est. cost"))),
          h("tbody", {}, list.length ? list.map(x => h("tr", {}, h("td", {}, x.label), h("td", { class: "num" }, fmtInt(x.calls)), h("td", { class: "num" }, fmtInt(x.failed)),
            h("td", { class: "num" }, `${fmtInt(x.inputTokens)} / ${fmtInt(x.outputTokens)}`), h("td", { class: "num" }, usd(x.costUsd))))
            : h("tr", {}, h("td", { colspan: "5", class: "muted" }, "No requests yet.")))));
        clear(out).append(
          h("div", { class: "scoretotal" }, h("span", { class: "bignum" }, usd(u.total.costUsd)), h("span", { class: "small muted" }, `${fmtInt(u.total.calls)} requests in the last ${u.days} days. Estimate from token counts; the Anthropic console has the real bill.`)),
          table("Brand", u.byBrand), table("Person", u.byUser));
      } catch (e) { clear(out).append(h("p", { class: "run-status err" }, e.message)); }
    };
    days.onchange = load; load();
    return h("div", { class: "panel" }, h("div", { class: "grouphead" }, h("h2", {}, "Claude usage"), days), out);
  }

  async function paint() {
    clear(body).append(passwordPanel());
    if (!Auth.isAdmin()) return;
    try { body.append(await teamPanel(), await usagePanel()); }
    catch (e) { body.append(h("p", { class: "run-status err" }, e.message)); }
  }
  return { onShow: paint };
}
