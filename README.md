# CertVerify — Corda-based Academic Certificate Verification System

A permissioned-blockchain system on **R3 Corda 4.12** where universities issue tamper-proof academic
certificates, students hold and share them, and employers verify them instantly — without phoning the
registrar's office and without putting student data on a public chain.

## Quick start

**See it working right now, no install:** open `demo/certverify-model.html` in any browser. It is a working
model of the whole network (four nodes, real SHA-256 and ECDSA signatures, contract, notary, vaults, all flows,
and an attack lab), re-implemented in JavaScript.

**Run the real Corda network (JDK 17 required):**

```bash
./run-demo.sh        # macOS / Linux
run-demo.bat         # Windows
```

The script builds the CorDapp, runs every test, creates and starts the four nodes, starts the three portals,
and issues + shares a sample certificate. Then open the Employer portal at http://localhost:8083, verify
`VU-2026-CSE-0142` against Vidya University, and upload `demo/sample-certificate.txt` (genuine) or
`demo/sample-certificate-edited.txt` (CGPA altered). Stop with Ctrl+C or `./stop-demo.sh`.

The first run downloads Corda and Gradle dependencies (several hundred MB) and takes a few minutes.

### Put it online

* **Working model as a public website:** `demo/certverify-model.html` is a single static page, live at
  https://certverify-lovat.vercel.app. Upload that one file to any static host to publish it elsewhere.
* **Real Corda network in the cloud (no local Java needed):** open this repository in **GitHub Codespaces**
  (Code -> Codespaces -> Create codespace, 4-core machine). The included `.devcontainer` installs Java 17.
  In the codespace terminal run `./run-demo.sh`, then in the **Ports** tab right-click port 8083
  (and 8081/8082 if needed) -> Port Visibility -> Public. The portal is then reachable at
  `https://<codespace-name>-8083.app.github.dev` while the codespace is running.

## How it works

| Node | Role | Can do |
|---|---|---|
| `Vidya University` | Issuer | Issue certificates, revoke them, answer verification requests |
| `StudentWallet` | Holder | Receive certificates, share them with verifiers |
| `TechCorp Employer` | Verifier | Verify a certificate with the issuer; inspect certificates shared with it |
| `Notary` | Consensus | Prevents double-spends (e.g. a certificate revoked and "un-revoked") |

* Only the **SHA-256 fingerprint** of the certificate PDF is stored on the ledger. The PDF is hashed in the
  browser and never uploaded.
* A certificate is a `LinearState` with lifecycle `ISSUED → REVOKED`. Every node runs
  `CertificateContract` on every transaction it receives, so forged or malformed certificates are rejected.
* **Verification** (`VerifyCertificateFlow`) asks the issuing university's node in real time:
  * hash matches & issued → **VALID** with full details
  * hash matches & revoked → **REVOKED** with the reason
  * hash differs → **HASH_MISMATCH** (document tampered), no personal data disclosed
  * no hash supplied → status only, no personal data disclosed
  * unknown ID / wrong issuer → **NOT_FOUND**
* **Sharing** (`ShareCertificateFlow`) sends the signed transaction and its back-chain to a verifier, who
  re-checks every signature and contract before storing it (`StatesToRecord.ALL_VISIBLE`).

## Project layout

```
contracts/   CertificateState, CertificateContract (+ contract tests)
workflows/   Issue / Revoke / Share / Verify flows and responders (+ MockNetwork flow tests)
clients/     Spring Boot REST API + web portal (one instance per node)
build.gradle deployNodes: Notary, University, StudentWallet, Employer
```

## Requirements

* **JDK 17** (Corda 4.12 requires Java 17)
* Internet access to `download.corda.net` and Maven Central for the first build
* Windows, macOS or Linux. ~4 GB free RAM for four nodes.

## Build and test

```bash
./gradlew clean build          # compiles and runs all contract + flow tests
./gradlew :contracts:test      # contract tests only
./gradlew :workflows:test      # flow tests only (MockNetwork)
```

## Run the network

```bash
./gradlew deployNodes
build/nodes/runnodes           # Windows: build\nodes\runnodes.bat
```

Wait until every node prints `Node for "..." started up and registered`. Then start one web portal per node,
each in its own terminal:

```bash
./gradlew runUniversityServer   # http://localhost:8081
./gradlew runStudentServer      # http://localhost:8082
./gradlew runEmployerServer     # http://localhost:8083
```

## Demo script

1. **University portal (8081) → Issue.** Fill the form, pick `StudentWallet`, choose any PDF, click *Issue on ledger*.
2. **Student portal (8082) → Certificates.** The certificate appears. Click *Share* → `TechCorp Employer`.
3. **Employer portal (8083) → Verify.** Enter the certificate number, pick `Vidya University`, upload the
   *same* PDF → **Genuine and valid**. Upload a different file → **Document does not match**.
4. **University portal → Revoke** the certificate. Verify again from the employer → **Revoked**, immediately.
5. Click *History* on any card to see the full ISSUED → REVOKED audit trail with transaction IDs.

## REST API (each portal)

| Method | Path | Body |
|---|---|---|
| GET | `/api/me` | – |
| GET | `/api/peers` | – |
| GET | `/api/certificates` | – |
| GET | `/api/certificates/{id}/history` | – |
| POST | `/api/certificates` | `{certificateId, studentName, rollNumber, program, specialization, cgpa, yearOfPassing, documentHash, student}` |
| POST | `/api/certificates/{id}/revoke` | `{reason}` |
| POST | `/api/certificates/{id}/share` | `{verifier}` |
| POST | `/api/verify` | `{certificateId, university, documentHash?}` |

Example:

```bash
curl -X POST localhost:8083/api/verify -H 'Content-Type: application/json' \
  -d '{"certificateId":"VU-2026-CSE-0142","university":"Vidya University","documentHash":"<sha256>"}'
```

## Using the node shell instead of the portal

```
flow start IssueCertificateFlow certificateId: "VU-1", studentName: "Asha Rao", rollNumber: "1VU22CS042", program: "B.Tech", specialization: "CSE", cgpa: 8.74, yearOfPassing: 2026, documentHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", student: "StudentWallet"
run vaultQuery contractStateType: com.certverify.states.CertificateState
```

## Known limitations

* A copy shared with a verifier is a snapshot; if the certificate is later revoked, the verifier's copy is
  not updated. Always use **Verify** (live check with the issuer) before relying on a certificate.
* Node names are used to infer roles in the portal UI only; real authorisation is enforced by the contract
  (only the issuer's key can sign issue/revoke) and by the flows.
* For production: replace H2 with PostgreSQL, put the portals behind authentication, and run the
  network under a Corda Network operator with a doorman.
