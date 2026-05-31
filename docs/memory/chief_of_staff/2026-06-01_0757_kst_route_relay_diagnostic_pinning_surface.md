# CoS Memory Note — Route/Relay Diagnostic Pinning Surface

Date: 2026-06-01 07:57 KST

Durable decision: diagnostics must expose the HTTPS fingerprint-pinning step without making it look like public release readiness. The operator needs to see what is wired, what is merely available, and what still blocks release.

Implementation facts:

- `musu relay status --json` now reports `https_fingerprint_pinning_wired=true`.
- `musu relay status --json` and `musu route --explain --json` both report `release_grade_transport_required=quic_tls_1_3`.
- `musu route --explain --json` candidate diagnostics can include `transport_scheme`, `peer_identity_method`, `peer_public_key_present`, and `https_fingerprint_pin_available`.
- Advertised-only fingerprints remain unverified in diagnostics. A route can show `https_fingerprint_pin_available=true` while still having `peer_identity_verified=false` and `encryption=none_http_bearer`.
- `route_evidence_ready` remains false until actual runtime evidence records release-grade QUIC/TLS proof.

Next operator step: verify the HTTPS fingerprint-pinning path on a real second-PC route, then replace bridge HTTP/TLS proof with release-grade QUIC/TLS route evidence before touching relay fallback.
