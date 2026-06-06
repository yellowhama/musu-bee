# Next Steps After Route Evidence Peer Identity Gate

## Current State

Release-grade route evidence now requires release-grade top-level peer identity
proof:

- `peer_identity_method=quic_tls_cert_fingerprint`
- `peer_public_key` starts with `sha256:`

Stored route evidence queries also revalidate that identity proof before
returning `release_grade=true` records.

## Next Actions

1. Run the current second-PC release kit on another Windows machine.
2. Import second-PC return evidence and require successful route proof,
   desktop-open CPU, full runtime matrix, and process attribution.
3. Log in the packaged runtime to `https://musu.pro`.
4. Configure production KV/Upstash storage.
5. Implement actual release `quic_relay_tunnel` payload transport and record
   relay transport plus delivery proof.
6. Record support mailbox and Store evidence.

## Non-Goals

- Do not treat a non-release peer identity method as release proof.
- Do not count preview relay queue delivery as release tunnel delivery.
- Do not move execution from local MUSU Desktop into MUSU.PRO.
