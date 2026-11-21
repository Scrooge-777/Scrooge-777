"""Capture real Ergo (ERG) data from the official Ergo explorer for the Blockchain Explorer Activity.

Picks, from recent blocks at least 5 deep, the block that contains all three kinds of transaction:
  an ordinary ERG payment, a native-token transfer, and a smart-contract (non-P2PK) transaction.
Writes explorer/out_ergo/data.json, raw API responses and screenshots.
"""
import json, time, pathlib, datetime, urllib.request, traceback

API = "https://api.ergoplatform.com/api/v1"
WEB = "https://explorer.ergoplatform.com/en"
FEE_TREE = "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
OUT = pathlib.Path(__file__).parent / "out_ergo"
OUT.mkdir(parents=True, exist_ok=True)


def get(url, tries=5):
    if url.startswith("/"):
        url = API + url
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "student-explorer-activity/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print("retry", url, e)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(url)


def is_fee(box):
    return (box.get("ergoTree") or "").startswith(FEE_TREE)


def is_p2pk(addr):
    return bool(addr) and addr.startswith("9") and len(addr) == 51


def kind(tx):
    ins, outs = tx.get("inputs", []), tx.get("outputs", [])
    if any(is_fee(b) for b in ins):
        return "fee-collection"
    if not ins:
        return "other"
    real_outs = [o for o in outs if not is_fee(o)]
    assets = any(o.get("assets") for o in real_outs) or any(i.get("assets") for i in ins)
    contract = any(not is_p2pk(b.get("address")) for b in ins + real_outs)
    if contract:
        return "contract"
    if assets:
        return "token"
    return "erg"


captured = datetime.datetime.now(datetime.timezone.utc)
info = get("/info")
state = get("/networkState")
tip = state["height"]
print("tip", tip, "info", info)
listing = get(f"/blocks?offset=5&limit=60&sortBy=height&sortDirection=desc")["items"]
(OUT / "raw_listing.json").write_text(json.dumps(listing, indent=1))

best = None
for item in listing:
    if item.get("transactionsCount", 0) < 4:
        continue
    blk = get(f"/blocks/{item['id']}")
    txs = blk["block"]["blockTransactions"]
    if isinstance(txs, dict):
        txs = txs.get("items", [])
    kinds = {}
    for i, t in enumerate(txs):
        if i == 0:
            continue  # emission (coinbase-like) transaction
        k = kind(t)
        kinds.setdefault(k, []).append(t)
    have = all(k in kinds for k in ("erg", "token", "contract"))
    print(item["height"], item["transactionsCount"], {k: len(v) for k, v in kinds.items()})
    if have:
        best = (item, blk, kinds)
        break
    if best is None or (len([k for k in ("erg", "token", "contract") if k in kinds]) >
                        len([k for k in ("erg", "token", "contract") if k in best[2]])):
        best = (item, blk, kinds)
    time.sleep(0.3)

item, blk, kinds = best
(OUT / "raw_block.json").write_text(json.dumps(blk, indent=1))


def pick(k, key):
    lst = kinds.get(k) or []
    return sorted(lst, key=key)[0] if lst else None


t_erg = pick("erg", lambda t: (len(t["inputs"]) + len(t["outputs"])))
t_tok = pick("token", lambda t: (len(t["inputs"]) + len(t["outputs"])))
t_con = pick("contract", lambda t: -(len(t["inputs"]) + len(t["outputs"])))
chosen = {}
for key, t in (("tx1", t_erg), ("tx2", t_tok), ("tx3", t_con)):
    if t is None:
        continue
    full = get(f"/transactions/{t['id']}")
    full["_fee"] = sum(o["value"] for o in full["outputs"] if is_fee(o))
    full["_kind"] = kind(full)
    chosen[key] = full
    (OUT / f"raw_{key}.json").write_text(json.dumps(full, indent=1))

miner = item.get("miner") or {}


def try_address(addr):
    """Balance + recent history for one address; None if the explorer cannot serve it."""
    try:
        bal = get(f"/addresses/{addr}/balance/confirmed", tries=3)
        txs = get(f"/addresses/{addr}/transactions?offset=0&limit=5", tries=3)
    except Exception as e:
        print("address unavailable", addr[:20], e)
        return None
    recent = []
    for t in txs.get("items", []):
        recv = sum(o["value"] for o in t["outputs"] if o.get("address") == addr)
        sent = sum(i["value"] for i in t["inputs"] if i.get("address") == addr)
        recent.append({"id": t["id"], "height": t.get("inclusionHeight"), "timestamp": t.get("timestamp"),
                       "received": recv, "sent": sent, "n_in": len(t["inputs"]), "n_out": len(t["outputs"])})
    return {"address": addr, "balance": bal, "tx_total": txs.get("total"), "recent": recent}


# candidates: contract addresses holding tokens in the contract transaction, then the miner's reward
# address, then the receivers of the payment transactions
cands = []
if "tx3" in chosen:
    for o in chosen["tx3"]["outputs"]:
        if not is_fee(o) and not is_p2pk(o.get("address")) and o.get("assets"):
            cands.append(("contract", o["address"]))
if miner.get("address"):
    cands.append(("miner", miner["address"]))
for k in ("tx2", "tx1"):
    if k in chosen:
        for o in chosen[k]["outputs"]:
            if not is_fee(o):
                cands.append((k + "-receiver", o["address"]))
address = {}
seen = set()
for role, a_ in cands:
    if a_ in seen or len(a_) > 400:
        continue
    seen.add(a_)
    r_ = try_address(a_)
    if r_ and r_["tx_total"]:
        r_["role"] = role
        address = r_
        break
    time.sleep(2)
addr = address.get("address")
for extra in ("https://api.ergoplatform.com/api/v0/info", "https://api.ergoplatform.com/api/v0/stats"):
    try:
        info[extra.rsplit("/", 1)[1] + "_v0"] = get(extra, tries=3)
    except Exception as e:
        print("no", extra, e)

try:
    price = get("https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd,inr&include_market_cap=true")
except Exception:
    price = {}

data = {"captured_utc": captured.isoformat(timespec="seconds"), "tip_height": tip, "info": info, "network_state": state,
        "block_listing_item": item, "block_header": blk["block"]["header"], "block_references": blk.get("references"),
        "block_tx_count": len(blk["block"]["blockTransactions"]) if isinstance(blk["block"]["blockTransactions"], list) else None,
        "block_kinds": {k: [t["id"] for t in v] for k, v in kinds.items()},
        "emission_tx": blk["block"]["blockTransactions"][0] if isinstance(blk["block"]["blockTransactions"], list) else None,
        "transactions": chosen, "address": address, "price": price}
(OUT / "data.json").write_text(json.dumps(data, indent=1))
print("block", item["height"], item["id"], "miner", miner, "chosen", {k: v["id"][:12] for k, v in chosen.items()})

# ---------------------------------------------------------------- screenshots
from playwright.sync_api import sync_playwright

pages = [("block", f"{WEB}/blocks/{item['id']}")]
for k, t in chosen.items():
    pages.append((k, f"{WEB}/transactions/{t['id']}"))
if addr:
    pages.append(("address", f"{WEB}/addresses/{addr}"))
pages.append(("sigma_block", f"https://sigmaspace.io/en/block/{item['id']}"))
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 1100}, locale="en-US", timezone_id="Asia/Kolkata")
    for name, url in pages:
        page = ctx.new_page()
        try:
            page.goto(url, wait_until="networkidle", timeout=90_000)
        except Exception as e:
            print("goto", name, e)
        page.wait_for_timeout(8000)
        for label in ("Accept", "OK", "Got it", "Close", "I agree"):
            try:
                page.get_by_role("button", name=label).first.click(timeout=700)
            except Exception:
                pass
        try:
            page.screenshot(path=str(OUT / f"{name}.png"))
            page.screenshot(path=str(OUT / f"{name}_full.png"), full_page=True)
        except Exception:
            traceback.print_exc()
        page.close()
    browser.close()
(OUT / "links.json").write_text(json.dumps(dict(pages), indent=1))
print("done")
