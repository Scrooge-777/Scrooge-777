#!/usr/bin/env python3
"""End-to-end test of the running CertVerify network through the three portals' REST APIs.

Run after scripts/start-network.sh. Prints a Markdown report and exits non-zero on any failure.
"""
import hashlib, json, pathlib, sys, time, urllib.request, urllib.error

UNI, STU, EMP = "http://localhost:8081", "http://localhost:8082", "http://localhost:8083"
ROOT = pathlib.Path(__file__).resolve().parent.parent
GENUINE = hashlib.sha256((ROOT / "demo/sample-certificate.txt").read_bytes()).hexdigest()
EDITED = hashlib.sha256((ROOT / "demo/sample-certificate-edited.txt").read_bytes()).hexdigest()
CERT = "VU-2026-CSE-0142"
results = []


def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def main():
    for port, who in ((UNI, "Vidya University"), (STU, "StudentWallet"), (EMP, "TechCorp Employer")):
        s, me = call("GET", port + "/api/me")
        check(f"{who} portal is connected to its node", s == 200 and me.get("organisation") == who, me.get("name", me))

    s, page = call("GET", EMP + "/")
    check("Employer portal serves the web UI", s == 200 and "CertVerify" in str(page))

    issue = {"certificateId": CERT, "studentName": "Asha Rao", "rollNumber": "1VU22CS042", "program": "B.Tech",
             "specialization": "Computer Science and Engineering", "cgpa": 8.74, "yearOfPassing": 2026,
             "documentHash": GENUINE, "student": "StudentWallet"}
    t = time.time()
    s, r = call("POST", UNI + "/api/certificates", issue)
    check("University issues the certificate", s == 201, f"{time.time() - t:.1f}s, tx {str(r.get('transactionId'))[:12]}")

    s, r = call("POST", UNI + "/api/certificates", issue)
    check("Duplicate certificate number is rejected", s == 400, r.get("message", ""))

    s, r = call("POST", UNI + "/api/certificates", {**issue, "certificateId": "VU-BAD-1", "cgpa": 11.0})
    check("Contract rejects CGPA above 10", s == 400 and "CGPA" in r.get("message", ""), r.get("message", ""))

    s, certs = call("GET", STU + "/api/certificates")
    held = [c for c in certs if c["certificateId"] == CERT]
    check("Student's vault holds the certificate", s == 200 and held and held[0]["relationship"] == "HELD_BY_ME")

    s, certs = call("GET", EMP + "/api/certificates")
    check("Employer cannot see it before it is shared", s == 200 and not any(c["certificateId"] == CERT for c in certs))

    s, r = call("POST", STU + f"/api/certificates/{CERT}/share", {"verifier": "TechCorp Employer"})
    check("Student shares it with the employer", s == 200, r.get("message", ""))

    s, certs = call("GET", EMP + "/api/certificates")
    shared = [c for c in certs if c["certificateId"] == CERT]
    check("Employer's vault now holds a verified copy", shared and shared[0]["relationship"] == "SHARED_WITH_ME")

    s, v = call("POST", EMP + "/api/verify", {"certificateId": CERT, "university": "Vidya University", "documentHash": GENUINE})
    check("Genuine document verifies as VALID with details", s == 200 and v["outcome"] == "VALID" and v["studentName"] == "Asha Rao", v.get("outcome"))

    s, v = call("POST", EMP + "/api/verify", {"certificateId": CERT, "university": "Vidya University", "documentHash": EDITED})
    check("Edited document is detected (HASH_MISMATCH, no details)", v.get("outcome") == "HASH_MISMATCH" and v.get("studentName") is None, v.get("outcome"))

    s, v = call("POST", EMP + "/api/verify", {"certificateId": CERT, "university": "Vidya University"})
    check("Status-only check is VALID without personal details", v.get("outcome") == "VALID" and not v.get("detailsDisclosed"), v.get("outcome"))

    s, v = call("POST", EMP + "/api/verify", {"certificateId": CERT, "university": "StudentWallet", "documentHash": GENUINE})
    check("A non-issuing node cannot vouch for it (NOT_FOUND)", v.get("outcome") == "NOT_FOUND", v.get("outcome"))

    s, r = call("POST", STU + f"/api/certificates/{CERT}/revoke", {"reason": "student attempt"})
    check("Student cannot revoke", s == 400, r.get("message", ""))

    s, r = call("POST", UNI + f"/api/certificates/{CERT}/revoke", {"reason": "Degree withdrawn after inquiry"})
    check("University revokes the certificate (notarised)", s == 201, f"tx {str(r.get('transactionId'))[:12]}")

    s, v = call("POST", EMP + "/api/verify", {"certificateId": CERT, "university": "Vidya University", "documentHash": GENUINE})
    check("Re-verification immediately shows REVOKED with reason",
          v.get("outcome") == "REVOKED" and v.get("revocationReason") == "Degree withdrawn after inquiry", v.get("outcome"))

    s, r = call("POST", UNI + f"/api/certificates/{CERT}/revoke", {"reason": "again"})
    check("Revoking twice is rejected", s == 400, r.get("message", ""))

    s, hist = call("GET", UNI + f"/api/certificates/{CERT}/history")
    check("Audit history shows ISSUED then REVOKED", s == 200 and [h["status"] for h in hist] == ["ISSUED", "REVOKED"],
          " -> ".join(h["status"] for h in hist) if isinstance(hist, list) else hist)

    passed = sum(ok for _, ok, _ in results)
    report = [f"# End-to-end test of the running network", "",
              f"**{passed} passed, {len(results) - passed} failed, {len(results)} total**", "",
              "| # | Check | Result | Detail |", "|---|---|---|---|"]
    for i, (name, ok, detail) in enumerate(results, 1):
        report.append(f"| {i} | {name} | {'PASS' if ok else 'FAIL'} | {str(detail).replace('|', '/')[:120]} |")
    (ROOT / "e2e-report.md").write_text("\n".join(report) + "\n")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
