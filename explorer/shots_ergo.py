"""Second pass: the oracle-pool contract transaction (data + screenshot) and the address token list."""
import json, pathlib, urllib.request, time
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent / "out_ergo"; OUT.mkdir(parents=True, exist_ok=True)
TX3 = "57c618bc88a22238a9f44b49866059eeaac8ec4b7848a2d86e94f89a1691e7dd"
ADDR = "9iH2hy967KpK5E2KeQ4dnuvu29jMy8akqK7LiN6qw8z3RjfpnPV"
for name, url in (("raw_tx3b.json", f"https://api.ergoplatform.com/api/v1/transactions/{TX3}"),):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "student/1.0"}), timeout=40) as r:
                (OUT / name).write_bytes(r.read()); break
        except Exception as e:
            print(e); time.sleep(5)
WEB = "https://explorer.ergoplatform.com/en"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 1100}, locale="en-US", timezone_id="Asia/Kolkata")
    for name, url, click in (("tx3b", f"{WEB}/transactions/{TX3}", None),
                             ("address_tokens", f"{WEB}/addresses/{ADDR}", "Show"),
                             ("tx3b_sigma", f"https://sigmaspace.io/en/transaction/{TX3}", None)):
        pg = ctx.new_page()
        try:
            pg.goto(url, wait_until="networkidle", timeout=90_000)
        except Exception as e:
            print(e)
        pg.wait_for_timeout(8000)
        if click:
            try:
                pg.get_by_role("button", name=click, exact=True).first.click(timeout=5000); pg.wait_for_timeout(3000)
            except Exception as e:
                print("click", e)
        pg.screenshot(path=str(OUT / f"{name}.png"))
        pg.screenshot(path=str(OUT / f"{name}_full.png"), full_page=True)
        pg.close()
    b.close()
print("done")
