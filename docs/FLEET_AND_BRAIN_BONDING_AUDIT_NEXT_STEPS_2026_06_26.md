# Fleet rc.21 + Brain Bonding Audit and Next Steps (2026-06-26)

Scope: current `feat/v33-residual-finalize` work after the fleet stale-registry audit hotfix and the first
`musu-brain` motherboard+chip bonding pass.

## Findings

| Severity | Finding | Evidence | Next |
|---|---|---|---|
| NO-GO | PR #34 cannot merge until design approval evidence is real. | Current PR checks are green except `design-gate`; local evaluator reports the only missing requirement as ``Design: Approved``. Issue #35 has an evidence-refresh comment (`https://github.com/yellowhama/musu-bee/issues/35#issuecomment-4813006122`) but no explicit approval comment yet. | Get explicit CEO/design approval on issue #35, then update the PR body with `Design: Approved` and the approval comment URL. |
| INFO | Public install channel is now rc.21. | Production deploy `dpl_3S5URjmeZomLD7c6zcffrNHrcSY2` is aliased to `https://musu.pro`; `verify-musu-pro-install-channel.ps1 -Json` passes with `ok=true`, `failure_count=0`; live `/api/health`, `/api/public-config`, `/install.ps1`, `/repair-fleet.ps1`, and `desktop-latest` canary all publish the rc.21 install/repair channel. | Keep this verifier in the release gate; do not treat HTTP 200 alone as install readiness. |
| INFO | The stale loopback registry row is no longer present in current second-machine registry evidence. | Strict `verify-fleet-audit-contract.ps1 -Json` passes with `ok=true`, `warn_count=0`, `remote_cloud_warning_count=0`, `online_nodes=1`, `direct_healthy_nodes=1`. | Still prove the physical main PC separately after installing/restarting rc.21 there. |
| MED | Brain version coherence is a pin+VCS gate, not a native product-semver gate. | `musu-brain.pin.json` pins `product_version=1.15.0-rc.21` and Go `vcs.revision=f7678af71d281a10df64c79e4eda6bc77ef8a719` from clean `F:\musu_2nd_brain` HEAD (`feat/brain-self-improvement`); current Go chip does not expose a `musu-brain --version` product contract. | Add native version surface in the brain chip or release metadata, then enforce it in MSIX build. |
| MED | Brain ingest token file is bootstrapped, but ACL verification is not yet a release gate. | Tauri writes `~/.musu/brain/runtime/musu-ingest.token` and does not log the token. Existing owner-only ACL hardening covers other sensitive files, not this new one yet. | Add owner-only ACL set+verify for the token file and include it in the fleet/desktop verifier. |
| INFO | The sidecar build gate now catches dirty or moving brain checkouts. | During validation, an intermediate dirty brain checkout produced `vcs.modified=true` and `--brain-only` correctly refused it. After brain advanced to clean commit `f7678af7`, the pin was updated. | Keep this gate: fail fast on HEAD mismatch, dirty repo, or dirty Go build info. |
| LOW | Brain sidecar health probe is loopback status-based. | Tauri skips spawning if `http://127.0.0.1:8080/health` is already healthy. A non-brain local service on the same port would be rare but possible. | Tighten probe to validate the expected health body or a lightweight version endpoint. |

## Qualitative Evaluation

The fleet side is meaningfully stronger: stale loopback rows are rejected at write time, filtered at list time, ignored by the resolver/cache path, and deletable through an owner-scoped route plus CLI/script fallback. The product can now distinguish "this machine is usable" from "the cloud still remembers an old bad row".

The remaining fleet blocker is no longer the public install channel or the current cloud row: those now pass strict verification from the second machine. The honest remaining proof is physical: install/restart rc.21 on `hugh-main`, run the repo-free `& ([scriptblock]::Create((irm https://musu.pro/repair-fleet.ps1))) -ExpectedNodeName hugh-main -Json` repair/check command, verify its non-loopback advertised/cloud URL, and then prove the two-machine direct route. PR #34 also remains process-blocked by design approval, not by code/test/deploy failure.

The brain integration is now a real product bonding pass rather than a thesis only. The Go chip remains unchanged, data lives under `~/.musu/brain`, the sidecar is bundled/spawned by Tauri, and task completion can flow to `POST /v1/sources` without shared SQLite writes or leaking the raw `:8080` surface. The honest gap is release-grade proof: packaged first-run, token ACL, and actual ingest evidence still need to be captured.

## Product Spec Updates

- Fleet `relay` remains a display/freshness state only. It is not a delegated-work routing path until relay transport is implemented and proven.
- Fleet registry `public_url` must be remote-usable. Loopback, localhost, wildcard, and port-0 are invalid fleet truth.
- `musu nodes --delete <nodeName>` deletes only the caller's owner-scoped cloud registry row and treats absent JSON 404 as an idempotent "already absent" result.
- Brain is a hidden product chip, not a user-managed dependency. The installed product owns lifecycle, data root, token bootstrap, and UX.
- Brain data root is `~/.musu/brain`, never MSIX LocalState.
- MUSU writes copies into brain for recall/search. `musu.db` and brain markdown store are not physically merged into one source of truth.

## Verification Snapshot

Passed:

- Rust fleet/discovery/install targeted tests: `peer::discovery::tests`, `bridge::tests`, `install::cli_commands::tests`.
- Cloud cleanup idempotent JSON 404 test: `cloud::tests::delete_registry_node_by_name_treats_json_404_as_absent`.
- Web public-release/type checks: `npm run test:public-release`, `npm run typecheck`.
- Fleet verifier with external-state warning allowance: `verify-fleet-audit-contract.ps1 -AllowRemoteRegistryWarnings -Json`.
- `build-tauri-sidecars.mjs` syntax check.
- Full sidecar build created both runtime and brain binaries. The script now also supports `--brain-only` and re-checks the brain repo immediately before Go build so a moving checkout cannot slip through after a long Rust build.
- Final brain-only rebuild passed after pinning clean `F:\musu_2nd_brain` HEAD `f7678af71d281a10df64c79e4eda6bc77ef8a719`; `go version -m` reports `vcs.modified=false`.
- Tauri targeted tests:
  `parses_knowledge_auth_token_without_logging_context`,
  `tauri_bundle_config_includes_runtime_sidecar`.
- Production install channel verifier after deploy `dpl_3S5URjmeZomLD7c6zcffrNHrcSY2`: `verify-musu-pro-install-channel.ps1 -Json` passed with `ok=true`, `failure_count=0`; the verifier now also covers `/repair-fleet.ps1`. Direct live probe of `https://musu.pro/repair-fleet.ps1` returned HTTP 200, length 7195, with `musu.fleet_node_public_url_repair.v1` and `ExpectedNodeName` present.
- Strict fleet audit verifier: `verify-fleet-audit-contract.ps1 -Json` passed with `ok=true`, `warn_count=0`, `remote_cloud_warning_count=0`.
- PR #34 status checks: code/test/deploy checks passed; `design-gate` remains the only failing check.
- `git diff --check`.
- MUSU index sync after this refresh: `indexed 3304 files (3827 symbols)`.
- MUSU recall/search proof: query `fleet rc21 brain sidecar knowledge ingest` returned this audit doc.

Not completed locally:

- `writer::runner::tests::knowledge_task_source_uses_scoped_markdown_payload`.
  The local Windows/MSVC `rustc` process stopped making CPU/working-set progress twice and was killed after stall confirmation.
  The code path was still reviewed and `rustfmt` passed; rerun on a clean Rust toolchain/CI lane.

## Next Steps

1. Get explicit design approval on issue #35, then update PR #34 from `Design: Pending` to `Design: Approved` with the approval comment URL and rerun `design-gate`.
2. On the main PC, install/restart rc.21 from `irm https://musu.pro/install.ps1 | iex`, run `& ([scriptblock]::Create((irm https://musu.pro/repair-fleet.ps1))) -ExpectedNodeName hugh-main -Json`, and capture physical two-machine direct-route proof.
3. After main is reachable, run the W-4 relay-display flip test: direct blocked -> relay-display only -> heartbeat expiry -> offline, with `online_nodes` staying direct-only.
4. Add a token ACL verifier and packaged first-run brain ingest proof before calling the brain bonding release-grade.
5. Add a native brain version surface or release metadata so the brain chip can graduate from pin+VCS coherence to product-semver coherence.
6. Rerun `node scripts/build-tauri-sidecars.mjs --brain-only` and verify `go version -m` reports `vcs.modified=false` whenever the brain chip advances.
7. Sync the changed repo into MUSU brain index and verify recall for `fleet rc21 brain sidecar knowledge ingest`.
