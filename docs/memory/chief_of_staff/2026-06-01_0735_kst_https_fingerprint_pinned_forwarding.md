# CoS Memory Note — HTTPS Fingerprint-Pinned Forwarding

Date: 2026-06-01 07:35 KST

Durable decision: advertised peer identity material is now separated from actual HTTPS transport proof. MUSU may record `peer_identity_verified=true` only after an HTTPS bridge forwarding attempt succeeds through a rustls client pinned to the advertised `sha256:<hex>` server certificate fingerprint.

Implementation facts:

- Candidate endpoints and registry node metadata now preserve endpoint `scheme` (`http` or `https`).
- TLS-enabled local bridge advertisements use `https://` when no public URL override is configured.
- HTTPS forwarding with advertised fingerprint material uses a custom rustls certificate verifier that compares the target leaf certificate SHA-256 hash to the advertised fingerprint.
- Successful pinned forwarding writes route evidence with `peer_identity_method=tls_cert_fingerprint_pin`, `peer_public_key=sha256:<hex>`, and `encryption=https_tls_fingerprint_pin`.
- Legacy HTTP bearer forwarding and advertised-only fingerprint material remain unverified and continue to record `encryption=none_http_bearer`.
- `musu.pro` route-evidence validation still marks HTTPS fingerprint-pinned bridge evidence non-release-grade with `transport_not_release_grade_quic_tls`; final release-grade evidence requires `encryption=quic_tls_1_3`.

Release implication: this closes the “advertised material only” gap for HTTPS bridge forwarding, but it does not close the public multi-device gate. The next P0 is still real second-PC route evidence over release-grade QUIC/TLS or an explicitly modeled relay path, plus two-machine desktop CPU evidence.
