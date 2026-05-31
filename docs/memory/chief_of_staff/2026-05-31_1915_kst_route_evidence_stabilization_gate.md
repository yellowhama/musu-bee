# CoS Memory - Route Evidence and Stabilization Gate

Date: 2026-05-31 19:15 KST

Durable decision:

- The three operator-reported P0 blockers are tracked by wiki/525:
  evidence-first idle CPU profiling, `musu.pro` as P2P control plane, and
  desktop hardening/process ownership as release gates.
- Multi-device public release evidence now requires `musu.route_evidence.v1`.
  The verifier rejects route evidence without route kind, handshake timing,
  peer identity verification, hardened encryption, payload transit truth, and
  success result.
- Legacy manual HTTP bearer routing is still useful as debug evidence, but it
  must be recorded honestly as unverified and cannot satisfy the public
  multi-device release gate.
- Rust cloud DTOs now cover rendezvous requests/sessions, endpoint candidates,
  route kinds, route attempt results, and route evidence. They are intentionally
  staged before bridge path selection and relay transport are wired.

Validation:

- PowerShell release scripts parsed.
- `verify-multidevice-evidence.ps1` passed a strong synthetic route evidence
  sample and failed a legacy sample missing `route_evidence`.
- `cargo check --manifest-path musu-rs\Cargo.toml` passed.
- `cargo test --manifest-path musu-rs\Cargo.toml cloud::tests --lib` passed
  the route-kind and route-evidence serialization tests.
