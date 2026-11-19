# End-to-end test of the running network

**20 passed, 0 failed, 20 total**

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Vidya University portal is connected to its node | PASS | O=Vidya University, L=Bengaluru, C=IN |
| 2 | StudentWallet portal is connected to its node | PASS | O=StudentWallet, L=Bengaluru, C=IN |
| 3 | TechCorp Employer portal is connected to its node | PASS | O=TechCorp Employer, L=Hyderabad, C=IN |
| 4 | Employer portal serves the web UI | PASS |  |
| 5 | University issues the certificate | PASS | 3.6s, tx 2CBE2A09778F |
| 6 | Duplicate certificate number is rejected | PASS | Certificate VU-2026-CSE-0142 has already been issued. Certificate numbers must be unique. |
| 7 | Contract rejects CGPA above 10 | PASS | Contract verification failed: Failed requirement: CGPA must be between 0.0 and 10.0, contract: com.certverify.contracts. |
| 8 | Student's vault holds the certificate | PASS |  |
| 9 | Employer cannot see it before it is shared | PASS |  |
| 10 | Student shares it with the employer | PASS | Certificate VU-2026-CSE-0142 shared with TechCorp Employer. |
| 11 | Employer's vault now holds a verified copy | PASS |  |
| 12 | Genuine document verifies as VALID with details | PASS | VALID |
| 13 | Edited document is detected (HASH_MISMATCH, no details) | PASS | HASH_MISMATCH |
| 14 | Status-only check is VALID without personal details | PASS | VALID |
| 15 | A non-issuing node cannot vouch for it (NOT_FOUND) | PASS | NOT_FOUND |
| 16 | Student cannot revoke | PASS | Only the issuing university (O=Vidya University, L=Bengaluru, C=IN) can revoke certificate VU-2026-CSE-0142. |
| 17 | University revokes the certificate (notarised) | PASS | tx 3A920561CF75 |
| 18 | Re-verification immediately shows REVOKED with reason | PASS | REVOKED |
| 19 | Revoking twice is rejected | PASS | Certificate VU-2026-CSE-0142 is already revoked. |
| 20 | Audit history shows ISSUED then REVOKED | PASS | ISSUED -> REVOKED |
