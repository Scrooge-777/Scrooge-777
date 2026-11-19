"""Build the title page and the test-results page shown in the demo video, from real CI outputs."""
import glob, html, pathlib, re, xml.etree.ElementTree as ET

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

STYLE = """
<style>
:root{--ink:#14211e;--muted:#576964;--accent:#0b6e5f;--seal:#a07b22;--bg:#eef2f0;--line:#d3ddd9}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:36px 40px}
h1{font-family:Georgia,serif;font-size:40px;margin:0 0 6px}h2{font-family:Georgia,serif;font-size:24px;margin:28px 0 10px}
.muted{color:var(--muted)}.big{font-size:56px;font-weight:700;color:var(--accent)}
table{border-collapse:collapse;width:100%;background:#fff;font-size:14px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}th{background:#f5f8f7;font-size:12px;text-transform:uppercase;color:var(--muted)}
.pass{color:#1d7746;font-weight:700}.fail{color:#b42318;font-weight:700}
.stats{display:flex;gap:16px}.stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 22px}
</style>"""

title = f"""<!doctype html><meta charset="utf-8"><title>CertVerify</title>{STYLE}
<body style="background:#1f3a5f;color:#fff;display:flex;align-items:center;min-height:100vh">
<div class="wrap" style="text-align:left">
<div style="width:90px;height:90px;border-radius:50%;background:#f4ecd6;border:4px solid #a07b22;display:grid;place-items:center;font-size:48px;color:#0b6e5f;font-weight:800">&#10003;</div>
<h1 style="font-size:52px;margin-top:28px">Corda-based Academic Certificate Verification System</h1>
<p style="font-size:24px;opacity:.85">Live demonstration of the complete implementation</p>
<p style="font-size:20px;opacity:.75;margin-top:40px">R3 Corda 4.12 &middot; Kotlin &middot; Java 17 &middot; Spring Boot<br>
Nodes: Vidya University &middot; StudentWallet &middot; TechCorp Employer &middot; Notary</p>
</div></body>"""
(OUT / "title.html").write_text(title)

rows, total, failed = [], 0, 0
for f in sorted(glob.glob(str(ROOT / "*/build/test-results/test/*.xml"))):
    r = ET.parse(f).getroot()
    suite = r.get("name").split(".")[-1]
    for tc in r.iter("testcase"):
        total += 1
        bad = tc.find("failure") is not None or tc.find("error") is not None
        failed += bad
        rows.append(f"<tr><td>{suite}</td><td>{html.escape(tc.get('name'))}</td><td class={'fail' if bad else 'pass'}>{'FAIL' if bad else 'PASS'}</td></tr>")

tests = f"""<!doctype html><meta charset="utf-8"><title>Gradle test results</title>{STYLE}<body><div class="wrap">
<h1>Gradle test results</h1><p class="muted">./gradlew build &middot; Java 17 &middot; generated from the JUnit XML reports of this build</p>
<div class="stats"><div class="stat"><div class="big">{total - failed}</div>passed</div><div class="stat"><div class="big" style="color:{'#b42318' if failed else '#576964'}">{failed}</div>failed</div>
<div class="stat"><div class="big" style="color:#14211e">{total}</div>tests</div></div>
<h2>All tests</h2><table><tr><th>Suite</th><th>Test</th><th>Result</th></tr>{''.join(rows)}</table></div></body>"""
(OUT / "tests.html").write_text(tests)

e2e_md = (OUT / "e2e-report.md").read_text() if (OUT / "e2e-report.md").exists() else ""
e2e_rows = []
for line in e2e_md.splitlines():
    m = re.match(r"\| (\d+) \| (.+?) \| (PASS|FAIL) \|", line)
    if m:
        e2e_rows.append(f"<tr><td>{m.group(1)}</td><td>{html.escape(m.group(2))}</td><td class={m.group(3).lower()}>{m.group(3)}</td></tr>")
summary = re.search(r"\*\*(.+?)\*\*", e2e_md)
e2e = f"""<!doctype html><meta charset="utf-8"><title>End-to-end test</title>{STYLE}<body><div class="wrap">
<h1>End-to-end test of the running network</h1>
<p class="muted">scripts/e2e_test.py drives the four live nodes through the three portals' REST APIs on every build</p>
<p style="font-size:22px"><b>{html.escape(summary.group(1) if summary else '')}</b></p>
<table><tr><th>#</th><th>Check</th><th>Result</th></tr>{''.join(e2e_rows)}</table></div></body>"""
(OUT / "e2e.html").write_text(e2e)
print("pages written:", total, "tests,", len(e2e_rows), "e2e rows")
