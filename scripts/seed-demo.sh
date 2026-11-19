#!/usr/bin/env bash
# Issues the sample certificate VU-2026-CSE-0142 and shares it with the employer, so the demo has data.
set -euo pipefail
cd "$(dirname "$0")/.."
HASH=$(sha256sum demo/sample-certificate.txt | cut -d' ' -f1)
curl -sf -X POST localhost:8081/api/certificates -H 'Content-Type: application/json' -d "{
  \"certificateId\":\"VU-2026-CSE-0142\",\"studentName\":\"Asha Rao\",\"rollNumber\":\"1VU22CS042\",
  \"program\":\"B.Tech\",\"specialization\":\"Computer Science and Engineering\",\"cgpa\":8.74,
  \"yearOfPassing\":2026,\"documentHash\":\"$HASH\",\"student\":\"StudentWallet\"}"; echo
curl -sf -X POST localhost:8082/api/certificates/VU-2026-CSE-0142/share -H 'Content-Type: application/json' \
  -d '{"verifier":"TechCorp Employer"}'; echo
