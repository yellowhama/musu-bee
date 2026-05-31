# Runtime Route Evidence and mDNS Audit

**Wiki ID**: wiki/528
**Date**: 2026-06-01
**Status**: Current implementation addendum after operator mDNS/Tailscale logs and bridge forwarding evidence wiring.

## Executive Verdict

The current codebase is stronger than the previous CLI-only route evidence
state, but it is still **No-Go for public desktop release**.

What changed materially:

- CLI route evidence and bridge runtime route evidence now share one contract in
  `musu-rs/src/bridge/route_evidence.rs`.
- Remote forwarding from `/api/tasks/delegate`,
  `/api/companies/{id}/run`, and workflow remote steps now writes local
  `musu.route_evidence.v1` files under `~/.musu/route-evidence/`.
- Forwarding attempts now record handshake timing, total attempt timing, retry
  failure class, and success/failure result from the actual runtime attempt.
- mDNS now disables IPv6 and Tailscale interfaces by default unless explicitly
  opted in.

What is still not release-grade:

- Current route transport remains legacy HTTP bearer.
- Route evidence honestly records `peer_identity_verified=false`,
  `encryption=none_http_bearer`, and
  `payload_transited_musu_infra=false`.
- No runtime path submits hardened route evidence to `musu.pro` yet.
- Rendezvous session creation, QUIC/TLS peer identity proof, and relay transport
  remain pending.

## Product Spec Updates

1. `musu.pro` remains the control plane, not the default payload path.
   Runtime evidence is now written locally first; cloud submission is the next
   integration step.
2. `musu.route_evidence.v1` is now a shared CLI/runtime contract. The writer is
   no longer duplicated inside the CLI module.
3. Runtime forwarding evidence path:
   `~/.musu/route-evidence/<task_id>.route-evidence.json`.
4. mDNS defaults are now:
   - `MUSU_ENABLE_MDNS=0`: no bridge advertiser/discovery loop by default
   - `MUSU_MDNS_ENABLE_IPV6=0`: no IPv6 mDNS by default
   - `MUSU_MDNS_ENABLE_TAILSCALE=0`: no mDNS on Tailscale adapters by default

The operator-supplied log pattern:

```text
Failed to send to [ff02::fb%9]:5353 via Interface { name: "Tailscale", ... } (os error 10065)
Failed to send SearchStarted(_musu._tcp.local.)(repeating:true): sending on a closed channel
```

means a build or command path still opened mDNS over the Tailscale IPv6
adapter. In the current source, default bridge startup should not do that.
If this reappears, first check whether the running binary predates this change,
or whether `MUSU_ENABLE_MDNS=1`, `MUSU_MDNS_ENABLE_IPV6=1`, or
`MUSU_MDNS_ENABLE_TAILSCALE=1` is set.

## Code Audit Findings

| Area | Severity | Finding | Status |
|---|---:|---|---|
| Runtime route evidence | High | Bridge remote forwarding previously did not write `musu.route_evidence.v1`; only CLI attempts did. | Fixed locally. `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote steps now write evidence. |
| Evidence contract duplication | Medium | CLI-owned evidence structs risked drifting from runtime evidence. | Fixed. Evidence structs/builders/writers are now shared in `bridge::route_evidence`. |
| Retry observability | Medium | Forwarding retries returned only a string error, losing timing and failure class. | Fixed. `ForwardAttemptReport` / `ForwardAttemptError` carry timing and failure class. |
| mDNS/Tailscale adapter noise | High | Tailscale IPv6 mDNS can repeatedly emit `os error 10065` and `closed channel` logs. | Further hardened. IPv6 and Tailscale mDNS interfaces are default-disabled; explicit opt-in env vars are required. |
| Release-grade route proof | Critical | Local evidence still cannot prove peer identity, QUIC/TLS encryption, or payload transit truth. | Still blocked. This is the next P0. |

## Validation

Passed:

- `cargo check --manifest-path .\musu-rs\Cargo.toml -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib cli_commands -- --nocapture`
- targeted `rustfmt --check` on changed Rust files
- `git diff --check`

Not completed:

- Filtered `route_evidence` unit-test execution was attempted but stopped after
  MSVC test-binary compilation became excessively long on this machine. The
  code path is still covered by `cargo check`; rerun this filter on a less
  memory-constrained build host before treating the new tests as green.

## Next Steps

1. Add `musu.pro` local/server stub endpoints for rendezvous and route-evidence
   submission.
2. Wire bridge route attempts to create a rendezvous session before trying
   direct candidates.
3. Replace HTTP bearer remote execution with peer identity verification and
   QUIC/TLS proof before allowing evidence to pass the release verifier.
4. Submit route evidence to `musu.pro` after local write succeeds.
5. Rerun real second-PC multi-device proof and two-machine desktop-open CPU
   evidence from a clean committed HEAD.
