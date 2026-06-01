# 2026-06-01 12:28 KST - Multi-Device Verifier QUIC/TLS Gate

## Durable Update

`scripts\windows\verify-multidevice-evidence.ps1` now requires release-grade route evidence to include:

- `peer_identity_verified=true`
- non-empty `peer_identity_method`
- non-empty `peer_public_key`
- `encryption=quic_tls_1_3`
- handshake timing, total timing, route kind, payload transit truth, and success result

This closes a verifier gap: before this update, `https_tls_fingerprint_pin` counted as "hardened" because it was not a legacy encryption string. The control-plane route-evidence API already treated that value as non-release-grade, so the Windows multi-device verifier now matches that contract.

## Validation

Synthetic verifier validation passed:

- Fixture with `encryption=quic_tls_1_3`, identity method, and peer key exited `0`.
- Otherwise identical fixture with `encryption=https_tls_fingerprint_pin` exited `1` and reported `route encryption release-grade`.

## Product Consequence

Public multi-device evidence must now prove QUIC/TLS route transport. HTTPS fingerprint-pinned bridge forwarding remains diagnostic evidence only.
