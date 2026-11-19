# Test results

**29 passed, 0 failed, 29 total**

| Suite | Test | Result | Seconds |
|---|---|---|---|
| CertificateContractTests | issuance must be signed by the university | PASS | 2.70 |
| CertificateContractTests | university cannot issue to itself | PASS | 0.20 |
| CertificateContractTests | revocation needs a reason | PASS | 0.32 |
| CertificateContractTests | issuance must not consume a certificate | PASS | 0.17 |
| CertificateContractTests | document hash must be a SHA-256 hex digest | PASS | 0.12 |
| CertificateContractTests | revocation cannot change grades | PASS | 0.14 |
| CertificateContractTests | valid revocation verifies | PASS | 0.17 |
| CertificateContractTests | cannot issue an already revoked certificate | PASS | 0.13 |
| CertificateContractTests | certificate id must match the linear external id | PASS | 0.11 |
| CertificateContractTests | valid issuance verifies | PASS | 0.10 |
| CertificateContractTests | revocation must be signed by the issuing university | PASS | 0.12 |
| CertificateContractTests | cannot revoke an already revoked certificate | PASS | 0.13 |
| CertificateContractTests | cgpa must be within 0 and 10 | PASS | 0.14 |
| CertificateContractTests | only one certificate per issuance | PASS | 0.10 |
| CertificateFlowTests | employer cannot re-share a certificate it does not own | PASS | 42.29 |
| CertificateFlowTests | tampered document is detected | PASS | 5.50 |
| CertificateFlowTests | genuine document verifies as valid with details | PASS | 5.10 |
| CertificateFlowTests | student node cannot vouch for its own certificate | PASS | 4.39 |
| CertificateFlowTests | issued transaction is signed by the university | PASS | 4.43 |
| CertificateFlowTests | issued certificate is recorded by university and student only | PASS | 4.08 |
| CertificateFlowTests | student cannot revoke | PASS | 4.00 |
| CertificateFlowTests | university can revoke and student sees it | PASS | 4.40 |
| CertificateFlowTests | status check without document reveals no personal details | PASS | 3.82 |
| CertificateFlowTests | certificate numbers must be unique | PASS | 3.72 |
| CertificateFlowTests | asking the wrong university returns not found | PASS | 3.88 |
| CertificateFlowTests | revoked certificate is reported as revoked immediately | PASS | 4.24 |
| CertificateFlowTests | cannot revoke twice | PASS | 4.23 |
| CertificateFlowTests | unknown certificate is not found | PASS | 3.80 |
| CertificateFlowTests | shared certificate lands in the employer's vault after back-chain checks | PASS | 3.93 |
