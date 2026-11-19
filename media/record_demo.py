"""Record the narrated walkthrough of the running network (runs in CI after start-network.sh)."""
import json, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / "out"
SCENES = json.loads((HERE / "demo_narration.json").read_text())
DUR = {s["id"]: float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(OUT / "audio" / "demo" / f"{s['id']}.mp3")])) for s in SCENES}
CAP = {s["id"]: s["caption"] for s in SCENES}
UNI, STU, EMP = "http://localhost:8081", "http://localhost:8082", "http://localhost:8083"
DOC = str(ROOT / "demo" / "sample-certificate.txt")
EDITED = str(ROOT / "demo" / "sample-certificate-edited.txt")
CERT = "VU-2026-CSE-0142"

OVERLAY = """(caption) => {
  let c = document.getElementById('__cap');
  if (!c) {
    c = document.createElement('div'); c.id = '__cap';
    c.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:99999;background:rgba(20,33,30,.88);color:#fff;' +
      'font:600 17px "Segoe UI",system-ui,sans-serif;padding:9px 16px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25)';
    document.body.appendChild(c);
    const k = document.createElement('div'); k.id = '__cur';
    k.style.cssText = 'position:fixed;left:640px;top:360px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgba(255,196,0,.55);border:2px solid #b8860b;z-index:100000;pointer-events:none;transition:left .55s ease,top .55s ease';
    document.body.appendChild(k);
  }
  c.textContent = caption;
}"""

timeline = []


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 720}, record_video_dir=str(OUT / "video"),
                                  record_video_size={"width": 1280, "height": 720})
        page = ctx.new_page()
        t0 = time.monotonic()
        state = {"cap": ""}

        def caption(text):
            state["cap"] = text
            page.evaluate(OVERLAY, text)

        def go(url):
            page.goto(url)
            page.wait_for_load_state("networkidle")
            page.evaluate(OVERLAY, state["cap"])

        def point(loc):
            loc.scroll_into_view_if_needed()
            b = loc.bounding_box()
            page.evaluate("([x,y]) => { const k = document.getElementById('__cur'); if (k) { k.style.left = x + 'px'; k.style.top = y + 'px'; } }",
                          [b["x"] + b["width"] / 2, b["y"] + b["height"] / 2])
            page.wait_for_timeout(650)

        def click(sel):
            loc = page.locator(sel).first
            point(loc)
            loc.click()
            page.wait_for_timeout(300)

        def type_in(sel, text, delay=40):
            loc = page.locator(sel).first
            point(loc)
            loc.click()
            loc.fill("")
            loc.type(text, delay=delay)

        def choose(sel, label):
            loc = page.locator(sel).first
            point(loc)
            loc.select_option(label=label)
            page.wait_for_timeout(300)

        def upload(sel, path):
            loc = page.locator(sel).first
            point(loc)
            loc.set_input_files(path if path else [])
            page.wait_for_timeout(900)

        def toast():
            page.locator("#toast").wait_for(state="visible", timeout=90000)

        def scene(sid, fn):
            start = time.monotonic() - t0
            timeline.append({"id": sid, "start": round(start, 3), "audio": DUR[sid]})
            caption(CAP[sid])
            fn()
            left = DUR[sid] + 0.9 - (time.monotonic() - t0 - start)
            if left > 0:
                page.wait_for_timeout(int(left * 1000))
            print(sid, "done at", round(time.monotonic() - t0, 1), flush=True)

        def d00():
            go((OUT / "title.html").as_uri())

        def d01():
            go((OUT / "tests.html").as_uri())
            page.wait_for_timeout(int(DUR["d01"] * 450))
            page.mouse.wheel(0, 500)
            page.wait_for_timeout(1500)
            page.mouse.wheel(0, 600)

        def d02():
            go(UNI)
            page.wait_for_timeout(1500)
            click('.tab[data-tab="issue"]')
            type_in('#issueForm [name="certificateId"]', CERT)
            choose("#studentSelect", "StudentWallet")
            type_in('#issueForm [name="studentName"]', "Asha Rao")
            type_in('#issueForm [name="rollNumber"]', "1VU22CS042")
            type_in('#issueForm [name="program"]', "B.Tech")
            type_in('#issueForm [name="specialization"]', "Computer Science and Engineering", delay=25)
            type_in('#issueForm [name="cgpa"]', "8.74")
            type_in('#issueForm [name="yearOfPassing"]', "2026")
            upload("#issueFile", DOC)
            page.wait_for_timeout(2500)
            click('#issueForm button[type="submit"]')
            toast()

        def d03():
            page.wait_for_timeout(1200)
            click('.tab[data-tab="vault"]')
            page.locator(".cert").first.wait_for(timeout=30000)

        def d04():
            click('.tab[data-tab="issue"]')
            page.evaluate("document.querySelector('#issueForm [name=cgpa]').removeAttribute('max')")
            page.locator('#issueForm [name="certificateId"]').fill("VU-2026-CSE-0199")
            page.locator('#issueForm [name="studentName"]').fill("Test Student")
            page.locator('#issueForm [name="rollNumber"]').fill("1VU22CS099")
            page.locator('#issueForm [name="program"]').fill("B.Tech")
            page.locator('#issueForm [name="specialization"]').fill("Computer Science and Engineering")
            page.locator('#issueForm [name="yearOfPassing"]').fill("2026")
            type_in('#issueForm [name="cgpa"]', "11")
            upload("#issueFile", DOC)
            click('#issueForm button[type="submit"]')
            toast()

        def d05():
            go(STU)
            page.locator(".cert").first.wait_for(timeout=30000)
            page.wait_for_timeout(int(DUR["d05"] * 400))
            click('[data-action="share"]')
            toast()

        def d06():
            go(EMP)
            click('.tab[data-tab="vault"]')
            page.locator(".cert").first.wait_for(timeout=30000)

        def verify(path):
            click('.tab[data-tab="verify"]')
            type_in('#verifyForm [name="certificateId"]', CERT)
            choose("#universitySelect", "Vidya University")
            upload("#verifyFile", path)
            click('#verifyForm button[type="submit"]')
            page.locator("#verifyResult .result").wait_for(timeout=90000)
            page.wait_for_timeout(600)
            page.locator("#verifyResult").scroll_into_view_if_needed()

        def d07():
            verify(DOC)

        def d08():
            page.evaluate("window.scrollTo(0,0)")
            verify(EDITED)

        def d09():
            page.evaluate("window.scrollTo(0,0)")
            verify(None)

        def d10():
            go(UNI)
            page.locator(".cert").first.wait_for(timeout=30000)
            page.wait_for_timeout(1500)
            page.once("dialog", lambda d: d.accept("Degree withdrawn after academic misconduct inquiry"))
            click('[data-action="revoke"]')
            toast()
            page.wait_for_timeout(1500)
            page.locator(".cert.revoked").first.scroll_into_view_if_needed()

        def d11():
            go(EMP)
            verify(DOC)

        def d12():
            go(UNI)
            page.locator(".cert").first.wait_for(timeout=30000)
            click('[data-action="history"]')

        def d13():
            go((OUT / "e2e.html").as_uri())
            page.wait_for_timeout(int(DUR["d13"] * 500))
            page.mouse.wheel(0, 400)

        for sid, fn in [("d00", d00), ("d01", d01), ("d02", d02), ("d03", d03), ("d04", d04), ("d05", d05), ("d06", d06),
                        ("d07", d07), ("d08", d08), ("d09", d09), ("d10", d10), ("d11", d11), ("d12", d12), ("d13", d13)]:
            scene(sid, fn)
        page.wait_for_timeout(1500)
        total = time.monotonic() - t0
        video_path = page.video.path()
        ctx.close()
        browser.close()
    (OUT / "timeline.json").write_text(json.dumps({"scenes": timeline, "total": total, "video": pathlib.Path(video_path).name}, indent=1))
    print("video", video_path, "total", round(total, 1))


if __name__ == "__main__":
    run()
