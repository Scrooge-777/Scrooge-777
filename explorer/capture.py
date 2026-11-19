"""Capture real Bitcoin data from the public mempool.space explorer for the Blockchain Explorer Activity.

Writes explorer/out/data.json and screenshots explorer/out/*.png:
  one block (10 blocks below the tip, so it is well confirmed), three transactions from that block
  (a typical payment, the highest fee-rate payment, a batch payment) and one public address.
"""
import json, time, pathlib, datetime, urllib.request

API = "https://mempool.space/api"
WEB = "https://mempool.space"
ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"  # the genesis-block address, public and widely documented
OUT = pathlib.Path(__file__).parent / "out"
OUT.mkdir(parents=True, exist_ok=True)


def get(path, as_json=True):
    for attempt in range(5):
        try:
            req = urllib.request.Request(API + path, headers={"User-Agent": "student-explorer-activity/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode()
            return json.loads(body) if as_json else body.strip()
        except Exception as e:  # rate limits / transient errors
            print("retry", path, e)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(path)


def subsidy(h):
    return (50 * 100_000_000) >> (h // 210_000)


def supply_at(height):
    total, h = 0, 0
    while h <= height:
        era_end = min(((h // 210_000) + 1) * 210_000 - 1, height)
        total += subsidy(h) * (era_end - h + 1)
        h = era_end + 1
    return total


captured = datetime.datetime.now(datetime.timezone.utc)
tip = int(get("/blocks/tip/height", as_json=False))
height = tip - 10
bhash = get(f"/block-height/{height}", as_json=False)
block = get(f"/v1/block/{bhash}")          # includes "extras": pool, reward, fees
block_basic = get(f"/block/{bhash}")
status = get(f"/block/{bhash}/status")

# first 10 pages (250 transactions) of the block, coinbase first
txs = []
for start in range(0, 250, 25):
    if start >= block_basic["tx_count"]:
        break
    txs.extend(get(f"/block/{bhash}/txs/{start}"))
    time.sleep(0.4)
coinbase = txs[0]
candidates = [t for t in txs[1:] if t.get("fee") is not None and t.get("weight")]
for t in candidates:
    t["_vsize"] = t["weight"] / 4
    t["_rate"] = t["fee"] / t["_vsize"]
median = block["extras"].get("medianFee") or sorted(t["_rate"] for t in candidates)[len(candidates) // 2]

simple = [t for t in candidates if len(t["vin"]) == 1 and len(t["vout"]) == 2]
t1 = min(simple or candidates, key=lambda t: abs(t["_rate"] - median))
t2 = max((t for t in candidates if t["txid"] != t1["txid"] and len(t["vout"]) <= 4), key=lambda t: t["_rate"])
t3 = max((t for t in candidates if t["txid"] not in (t1["txid"], t2["txid"])), key=lambda t: len(t["vout"]))
chosen = {"tx1": t1, "tx2": t2, "tx3": t3}
for key, t in chosen.items():
    t["_status"] = get(f"/tx/{t['txid']}/status")
    t["_label"] = {"tx1": "typical payment (fee rate closest to the block median)",
                   "tx2": "highest fee-rate payment among the first 250 transactions",
                   "tx3": "batch payment (most outputs among the first 250 transactions)"}[key]

addr = get(f"/address/{ADDRESS}")
addr_txs = get(f"/address/{ADDRESS}/txs")
recent = []
for t in addr_txs[:10]:
    recv = sum(o["value"] for o in t["vout"] if o.get("scriptpubkey_address") == ADDRESS)
    sent = sum(i["prevout"]["value"] for i in t["vin"] if i.get("prevout") and i["prevout"].get("scriptpubkey_address") == ADDRESS)
    recent.append({"txid": t["txid"], "received_sats": recv, "sent_sats": sent,
                   "confirmed": t["status"]["confirmed"], "block_height": t["status"].get("block_height"),
                   "block_time": t["status"].get("block_time")})

data = {
    "captured_utc": captured.isoformat(timespec="seconds"),
    "tip_height": tip,
    "supply_sats_at_tip": supply_at(tip),
    "block_subsidy_sats": subsidy(tip),
    "next_halving_height": ((tip // 210_000) + 1) * 210_000,
    "block": block, "block_status": status,
    "coinbase": {"txid": coinbase["txid"], "outputs_sats": sum(o["value"] for o in coinbase["vout"]),
                 "scriptsig_ascii": bytes.fromhex(coinbase["vin"][0].get("scriptsig", "")).decode("ascii", "replace")},
    "transactions": {k: {kk: vv for kk, vv in t.items()} for k, t in chosen.items()},
    "address": addr, "address_recent": recent,
    "fees_recommended": get("/v1/fees/recommended"),
    "hashrate": {k: v for k, v in get("/v1/mining/hashrate/1m").items() if k in ("currentHashrate", "currentDifficulty")},
    "difficulty_adjustment": get("/v1/difficulty-adjustment"),
    "prices": get("/v1/prices"),
}
(OUT / "data.json").write_text(json.dumps(data, indent=1))
print("block", height, bhash, "txs", block_basic["tx_count"], "->", [t["txid"][:12] for t in chosen.values()])

# ---------------------------------------------------------------- screenshots
from playwright.sync_api import sync_playwright

pages = [("block", f"{WEB}/block/{bhash}"),
         ("tx1", f"{WEB}/tx/{t1['txid']}"), ("tx2", f"{WEB}/tx/{t2['txid']}"), ("tx3", f"{WEB}/tx/{t3['txid']}"),
         ("address", f"{WEB}/address/{ADDRESS}"),
         ("block_blockstream", f"https://blockstream.info/block/{bhash}")]
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 1100}, device_scale_factor=1, locale="en-US",
                              timezone_id="Asia/Kolkata", color_scheme="dark")
    for name, url in pages:
        page = ctx.new_page()
        try:
            page.goto(url, wait_until="networkidle", timeout=90_000)
        except Exception as e:
            print("goto", name, e)
        page.wait_for_timeout(6000)
        for label in ("Accept", "OK", "Dismiss", "Got it"):
            try:
                page.get_by_role("button", name=label).first.click(timeout=800)
            except Exception:
                pass
        page.screenshot(path=str(OUT / f"{name}.png"))
        page.screenshot(path=str(OUT / f"{name}_full.png"), full_page=True)
        page.close()
    browser.close()
(OUT / "links.json").write_text(json.dumps(dict(pages), indent=1))
print("done")
