# 1.15.0-rc.1 Fresh mDNS Runtime Evidence Audit

Date: 2026-06-02 07:16 KST

Status: local primary evidence refreshed; public desktop release remains No-Go.

## Scope

This audit records the evidence refresh after commit
`39a9adf9833acb4324c46c646001c8c1ab622bfa`, which hardened mDNS browsing so a
disconnected browse receiver exits immediately instead of continuing the bounded
discovery window.

The refresh covered:

- Fresh release MSIX build for `local-sideload-manual`.
- Fresh install of package `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke through the dashboard and CLI route path.
- Desktop-open runtime idle CPU measurement.
- Four-state runtime CPU matrix: `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`.
- Current release go/no-go summary.

## Product Spec Updates

- mDNS LAN discovery remains default-off through `MUSU_ENABLE_MDNS=1`.
- Explicit mDNS browsing now treats `flume::RecvTimeoutError::Disconnected` as a
  terminal receiver state; `Timeout` still keeps the bounded discovery window
  alive.
- The packaged desktop release evidence path remains MSIX first, with
  `musu-desktop.exe` as the app executable, `musu.exe` as the CLI alias, and
  `musu-startup.exe` as the startup task.
- The release support address is `musu@musu.pro`; `support@musu.pro` is not the
  release mailbox.
- `musu.pro` is the P2P control plane for registry/rendezvous/path selection and
  relay lease coordination, not the default data path. Hosted auth is wired, but
  relay lease storage still needs KV/Upstash credentials.
- Raw machine-wide Node.js process count is diagnostic only. Release
  accountability is MUSU-owned helpers, repo-related orphan helpers, CPU hot
  samples, resource budgets, and two-machine evidence.

## Evidence

| Gate | Evidence | Result |
|---|---|---|
| Single-machine smoke | `docs\evidence\single-machine\1.15.0-rc.1\20260602-070642-HUGH_SECOND.evidence.json` | Pass |
| Runtime idle CPU | `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-070807-HUGH_SECOND.desktop-open.evidence.json` | Pass on `HUGH_SECOND`, release count `1/2` |
| Runtime CPU matrix | `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-070927-HUGH_SECOND.runtime-cpu-scenario-matrix.json` | Pass on `HUGH_SECOND`, release count `1/2` |
| Go/no-go | `write-release-go-no-go.ps1 -Json` at 2026-06-02 07:16 KST | No-Go |

Single-machine smoke:

- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260602_070616`
- Dashboard task: `9968e62c-5f42-43ce-86ac-7b9a57a0d120`
- Bridge URL: `http://127.0.0.1:12438`
- CLI route checked: `true`

Desktop-open CPU:

- `git_dirty=false`
- sample duration `60.053s`
- process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`, other `0`
- max one-core CPU: MUSU `0`, Node `0.05`, WebView2 `0.26`
- working set `534.5MB`
- hot process count `0`

Runtime CPU matrix:

- `git_dirty=false`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_070927`
- `runtime-started`: hot `0`, max one-core CPU MUSU `0.03`, Node `0.03`,
  WebView2 `0.39`
- `dashboard-open`: hot `0`, max one-core CPU MUSU `0.03`, Node `0`,
  WebView2 `0.13`
- `desktop-open`: hot `0`, max one-core CPU MUSU `0`, Node `0.03`,
  WebView2 `0.08`
- `post-route`: hot `0`, max one-core CPU MUSU `0`, Node `0.03`,
  WebView2 `0.21`

## Qualitative Evaluation

The current local Windows beta path is strong enough for continued operator and
second-PC validation. The fresh primary evidence does not show the reported idle
busy-loop on `HUGH_SECOND`: MUSU CPU stayed near zero, owned WebView2 stayed
well below the 5% one-core threshold, and no hot process was reported across the
single desktop-open sample or the four-state matrix.

This does not close the busy-loop issue globally. The release gate deliberately
requires two machines, and the returned `HUGH-MAIN` package from
`20260531-165240-HUGH-MAIN.second-pc-return.zip` did not contain release-grade
runtime CPU evidence or a passing multi-device route proof.

Current qualitative completion remains:

- Single-machine Windows local beta: about 88-90%.
- Store/operator gate infrastructure: about 96%.
- Public desktop release: about 66%, blocked by external and two-machine gates.
- Full polished desktop GUI: about 50%; the packaged shell is functional but
  still not the final rich desktop dashboard.

## Code Audit

No new runtime source changes were made during this evidence refresh. The code
under audit is the mDNS receive-loop hardening already committed at
`39a9adf9833acb4324c46c646001c8c1ab622bfa`.

Findings:

- The mDNS receiver now classifies timeout and disconnected states separately.
  This is the right narrow fix for the observed Windows/Tailscale
  `sending on a closed channel` failure class.
- The change is scoped to explicit mDNS discovery paths. Because mDNS remains
  opt-in, the default Store-candidate runtime posture still avoids multicast
  discovery and uses cloud/manual peer registration.
- The direct regression test for mDNS receive-error classification passed.
- Prior validation also passed `cargo check --manifest-path .\musu-rs\Cargo.toml
  --bin musu -j 1`, `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`,
  and `git diff --check`.
- The broader non-`--lib` filtered Cargo run hit the unrelated
  `r6_auto_update` integration harness, which requires elevation on this
  Windows host. Treat that as a host constraint, not an mDNS regression.

## Current Blockers

`write-release-go-no-go.ps1 -Json` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `public_metadata_ok=true`
- `runtime_idle_cpu_valid=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid=1/2 [HUGH_SECOND]`
- `multi_device_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `p2p_control_plane_verified=false`

Blocking areas:

- `multi-device`: real second-PC route evidence is still not release-grade.
- `runtime-idle-cpu`: needs a second valid machine sample.
- `runtime-cpu-scenario-matrix`: needs a second valid machine matrix.
- `support-mailbox`: `musu@musu.pro` delivery/forwarding evidence is missing.
- `store-release`: Partner Center reservation/submission/certification evidence
  is missing.
- `p2p-control-plane`: production relay lease KV storage is not configured.
- `git`: present only until the new evidence/docs are committed from a clean
  worktree.

## Next Steps

1. Run the current operator action pack on the second Windows PC without
   `-SkipRuntimeIdleCpu` or `-SkipRuntimeCpuScenarioMatrix`, return the zip, and
   import it with `import-second-pc-return.ps1`.
2. Capture release-grade multi-device route evidence with peer identity,
   transport, timing, and payload-transit fields passing the verifier.
3. Provision Vercel KV/Upstash for `musu.pro`, run
   `configure-musu-pro-p2p-env.ps1`, deploy production, and rerun live
   P2P-control-plane evidence.
4. Record `musu@musu.pro` support mailbox evidence with a current-version token.
5. Record Partner Center product-name, Store submission, and certification
   evidence through the Store release recorder.
6. After these docs/evidence are committed, rerun go/no-go from clean HEAD and
   regenerate the final operator gate packet.
