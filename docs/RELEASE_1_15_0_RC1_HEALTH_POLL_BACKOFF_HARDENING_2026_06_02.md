# Release 1.15.0-rc.1 Health Poll Backoff Hardening

Date: 2026-06-02 10:12 KST  
Wiki id: wiki/544

## Scope

This pass addresses one remaining local busy-loop candidate: bounded bridge
health polling in the CLI/runtime lifecycle.

Changed code:

- `musu-rs/src/install/cli_commands.rs`
  - `musu up` bridge startup wait now uses capped backoff for `/health`
    polling: 250ms, 500ms, 1s, then 2s max.
  - Sleep duration is capped by the remaining operator timeout so the command
    does not wait beyond `--timeout-sec`.
- `musu-rs/src/install/auto_update.rs`
  - post-swap bridge `/health` polling now uses the same capped backoff.
  - The 30s rollback deadline remains intact.

Validation:

```powershell
cargo fmt --manifest-path .\musu-rs\Cargo.toml
cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 health_poll_delay
git diff --check
```

Result:

- Rust targeted tests passed: 2/2.
- `git diff --check` passed.
- No release evidence was claimed from this code change.

## Qualitative Assessment

This is a useful hardening improvement, but it does not close the operator's
CPU complaint by itself.

What improved:

- Failed bridge health probes are now lower duty after the first few attempts.
- Startup and auto-update health checks remain bounded and deadline-aware.
- The policy is covered by unit tests so fixed tight retry loops are less
  likely to return silently.

What remains open:

- The latest primary MSIX runtime CPU evidence predates this Rust source
  change. Fresh primary package evidence is required before current HEAD can be
  treated as CPU-evidence-current.
- The two-machine CPU gate is still incomplete until a second Windows PC returns
  runtime idle CPU and four-state runtime matrix evidence from a clean package.
- `musu.pro` P2P control-plane still requires KV-backed relay lease production
  evidence and owner-scope verification.
- Release-grade multi-device route evidence, `musu@musu.pro` mailbox evidence,
  and Microsoft Store/Partner Center evidence remain open.

## Code Audit Notes

The changed loops are not hot loops in the strict sense because they already
had a 500ms sleep and a deadline. The weak point was that repeated failure kept
the same cadence. The new bounded backoff reduces request density during
failure while preserving quick success detection in the normal path.

This pass did not modify:

- mDNS discovery behavior
- frontend polling contracts
- relay/route transport
- package generation scripts
- evidence verifier semantics

## Next Steps

1. Build/install a fresh MSIX from this commit.
2. Rerun primary smoke, desktop single-instance, process ownership,
   desktop-open CPU, and four-state CPU matrix evidence.
3. Send the current second-PC transfer kit and require return evidence with
   runtime idle CPU, runtime CPU matrix, process attribution, and release-check
   JSON.
4. Provision production KV/Upstash for `musu.pro` relay leases and rerun live
   P2P control-plane evidence without `-AllowUnverified`.
5. Record `musu@musu.pro` receive/forward proof.
6. Record Microsoft Store/Partner Center submission evidence.
