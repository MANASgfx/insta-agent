# Usage: npm run test:browser   (or: npm run build && python3 tests/browser/run.py)
# Starts the real server on a throwaway SQLite database, signs in through the login screen, and clicks through all 13 skills.
# mock.js stands in for Claude only (/api/ask); brands, history, docs and auth hit the real server.
# Needs: pip install playwright && python3 -m playwright install chromium
import asyncio, json, os, pathlib, socket, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright

B = pathlib.Path(__file__).parent
ROOT = B.parent.parent
EMAIL, PASSWORD = "browser-test@digify.marketing", "browser-test-password"

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())

def start_server():
    port = free_port(); tmp = tempfile.mkdtemp()
    env = {**os.environ, "NODE_ENV": "test", "PORT": str(port), "DB_DRIVER": "sqlite", "SQLITE_FILE": os.path.join(tmp, "t.sqlite"),
           "SETUP_TOKEN": "browser-setup", "SESSION_SECRET": "b" * 40, "ANTHROPIC_API_KEY": "sk-ant-not-used", "ASK_PER_MINUTE": "1000"}
    proc = subprocess.Popen(["node", "server/index.js"], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try: urllib.request.urlopen(base + "/api/health"); break
        except Exception: time.sleep(0.1)
    post(base + "/api/setup", {"token": "browser-setup", "name": "Browser Test", "email": EMAIL, "password": PASSWORD})
    return proc, base

async def main(base, width=1280, dark=False, tag=""):
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": width, "height": 900}, color_scheme="dark" if dark else "light", accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" and "fonts.g" not in m.text and "ERR_" not in m.text else None)
        await pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        await pg.add_init_script(path=str(B / "mock.js"))
        async def go(view): await pg.goto(base + "/#" + view); await pg.wait_for_timeout(250)
        async def click(txt): await pg.get_by_role("button", name=txt).first.click(); await pg.wait_for_timeout(250)

        # sign in through the gate
        await pg.goto(base + "/"); await pg.wait_for_selector("#lg-email")
        await pg.screenshot(path=str(B / f"login{tag}.png"), full_page=True)
        await pg.fill("#lg-email", EMAIL); await pg.fill("#lg-pw", "wrong-password"); await click("Sign in")
        bad = await pg.text_content(".gate .run-status")
        await pg.fill("#lg-pw", PASSWORD); await click("Sign in"); await pg.wait_for_selector("#brand-select")
        await pg.screenshot(path=str(B / f"home{tag}.png"), full_page=True)
        # brand
        await go("brand")
        await pg.fill("#bv-name", "Wootique"); await pg.fill("#bv-handle", "@wootique"); await pg.fill("#bv-fill", "x " * 100)
        await click("Fill the voice from these"); await click("Save brand voice"); await pg.wait_for_timeout(300)
        # reel
        await go("reel")
        await pg.fill("#reel-idea", "Client changed wood after cut"); await click("Write 3 hooks"); await click("Write the script on the chosen hook")
        await pg.screenshot(path=str(B / f"reel{tag}.png"), full_page=True)
        await click("Save to history"); await click("Write the caption →")
        await click("Write the caption"); await pg.screenshot(path=str(B / f"caption{tag}.png"), full_page=True)
        for view, fills, btn in [("carousel", {"#car-idea": "bed checks"}, "Write the carousel"), ("story", {"#st-today": "polishing"}, "Write today's stories"),
                                 ("repurpose", {"#rp-src": "y " * 200}, "Find the posts in it"), ("comment", {"#cm-post": "nice kitchen"}, "Write comments"),
                                 ("reply", {"#rp-comments": "@riya: teak?"}, "Sort and reply"), ("dm", {"#dm-who": "@riya"}, "Write the DM"),
                                 ("plan", {"#pl-happened": "recut a table"}, "Plan the week"), ("profile", {"#pf-bio": "furniture"}, "Score my profile")]:
            await go(view)
            for k, v in fills.items(): await pg.fill(k, v)
            if view == "profile": await pg.set_input_files("#pf-shots", str(B / "shot.png"))
            await click(btn); await pg.wait_for_timeout(200)
            await pg.screenshot(path=str(B / f"{view}{tag}.png"), full_page=True)
            if view == "plan": await click("Save as this week's plan")
            if view == "carousel":
                async with pg.expect_download() as dl: await click("Download slides (.zip of 1080×1350 PNGs)")
                d = await dl.value; zpath = B / f"carousel{tag}.zip"; await d.save_as(str(zpath))
                import zipfile; names = zipfile.ZipFile(zpath).namelist(); zpath.unlink()
        # viral
        await go("viral")
        await pg.fill("#vr-paste", open(B.parent / "parity/swipe.tsv").read()); await click("Add pasted rows"); await click("Rank by outlier multiple")
        await click("Save as this brand's swipe file"); await click("Turn it into hooks I can shoot")
        await pg.screenshot(path=str(B / f"viral{tag}.png"), full_page=True)
        # audit
        await go("audit")
        await pg.fill("#au-paste", "post\tviews\treach\tshares\tfollows\thold 3s\nA\t4000\t3800\t12\t4\t60\nB\t1200\t1100\t1\t0\t30\nC\t26000\t24000\t90\t40\t71\nD\t3000\t2900\t5\t1\t45")
        await click("Add pasted rows"); await click("Compute the numbers"); await click("Read what the data says")
        await pg.screenshot(path=str(B / f"audit{tag}.png"), full_page=True)
        # human + checks + history + team
        await go("human")
        await click("Load a bad example"); await click("Clean it and score it"); await click("Rewrite the flagged shapes with Claude")
        await pg.screenshot(path=str(B / f"human{tag}.png"), full_page=True)
        await go("checks"); await pg.wait_for_timeout(200); await pg.screenshot(path=str(B / f"checks{tag}.png"), full_page=True)
        await go("history"); await pg.wait_for_timeout(300); await pg.screenshot(path=str(B / f"history{tag}.png"), full_page=True)
        hist = await pg.locator(".hist details").count()
        await go("account"); await pg.wait_for_timeout(600); await pg.screenshot(path=str(B / f"account{tag}.png"), full_page=True)
        team = await pg.locator("text=browser-test@digify.marketing").count()
        statuses = await pg.eval_on_selector_all(".run-status.err", "els => els.map(e => e.textContent)")
        hscroll = await pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        # signing out returns to the gate
        await click("Sign out"); await pg.wait_for_selector("#lg-email")
        print(f"[{tag}] errors:", errs or "none"); print(f"[{tag}] error statuses:", statuses or "none"); print(f"[{tag}] horizontal scroll:", hscroll)
        print(f"[{tag}] bad login message:", bad.strip())
        print(f"[{tag}] prompts sent:", await pg.evaluate("window.__prompts.length"), " images sent:", await pg.evaluate("window.__images"))
        print(f"[{tag}] carousel zip:", names)
        print(f"[{tag}] history rows (server):", hist, " team page lists admin:", bool(team))
        ok = not errs and not statuses and not hscroll and hist >= 1 and team and any(n.endswith(".png") for n in names) and "caption.txt" in names
        await br.close()
        return ok

if __name__ == "__main__":
    if not (ROOT / "public/index.html").exists(): sys.exit("Build first: npm run build")
    if not (B / "shot.png").exists():
        import base64
        (B / "shot.png").write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
    proc, base = start_server()
    try:
        results = [asyncio.run(main(base, tag="-desk")), asyncio.run(main(base, width=390, dark=True, tag="-phone"))]
    finally:
        proc.terminate()
    print("BROWSER TEST", "PASSED" if all(results) else "FAILED")
    sys.exit(0 if all(results) else 1)
