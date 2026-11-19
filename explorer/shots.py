"""Re-take block screenshots with the 'Details' panels expanded (same block as data.json)."""
import pathlib
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent / "out"; OUT.mkdir(parents=True, exist_ok=True)
H = "0000000000000000000098b971c1288565ae8856ab8bfc952d978d19701a3a9e"
pages = [("block_details", f"https://mempool.space/block/{H}"), ("blockstream_details", f"https://blockstream.info/block/{H}")]
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 1100}, locale="en-US", timezone_id="Asia/Kolkata", color_scheme="dark")
    for name, url in pages:
        pg = ctx.new_page()
        try:
            pg.goto(url, wait_until="networkidle", timeout=90_000)
        except Exception as e:
            print(e)
        pg.wait_for_timeout(6000)
        try:
            btn = pg.get_by_text("Details", exact=True).first
            btn.scroll_into_view_if_needed(); btn.click(timeout=5000); pg.wait_for_timeout(2500)
        except Exception as e:
            print("click", name, e)
        pg.screenshot(path=str(OUT / f"{name}_full.png"), full_page=True)
        pg.close()
    b.close()
print("done")
