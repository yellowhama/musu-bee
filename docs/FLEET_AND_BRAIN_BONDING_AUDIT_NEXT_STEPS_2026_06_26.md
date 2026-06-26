# Fleet rc.21 + Brain Bonding Audit and Next Steps (2026-06-26)

Scope: current `feat/v33-residual-finalize` work after the fleet stale-registry audit hotfix and the first
`musu-brain` motherboard+chip bonding pass.

## Findings

| Severity | Finding | Evidence | Next |
|---|---|---|---|
| NO-GO | Public install channel is still not rc.21. | `musu.pro/install.ps1` is live, but hosted `desktop-latest` still advertises `1.15.0.20`; local rc.21 package/appinstaller are `1.15.0.21`. | Upload `desktop-latest` assets with `publish-desktop-latest-assets.ps1 -ConfirmUpload`, then run canary and `Install-MUSU.ps1 -ValidateReleaseOnly`. |
| NO-GO | `hugh-main` is still an external stale registry row until that PC republishes or the deployed cleanup path removes it. | Strict fleet verifier fails on `hugh-main public_url=http://127.0.0.1:13397`; `-AllowRemoteRegistryWarnings` passes with exactly that warning. | On main PC, install/restart rc.21 and run `repair-fleet-node-public-url.ps1`; after production deploy, delete stale row if needed. |
| MED | Brain version coherence is a pin+VCS gate, not a native product-semver gate. | `musu-brain.pin.json` pins `product_version=1.15.0-rc.21` and Go `vcs.revision=79ee4f2218cbb64ca07a96daf435a7c1efc2290f` from clean `F:\musu_2nd_brain` HEAD (`feat/brain-self-improvement`); current Go chip does not expose a `musu-brain --version` product contract. | Add native version surface in the brain chip or release metadata, then enforce it in MSIX build. |
| MED | Brain ingest token file is bootstrapped, but ACL verification is not yet a release gate. | Tauri writes `~/.musu/brain/runtime/musu-ingest.token` and does not log the token. Existing owner-only ACL hardening covers other sensitive files, not this new one yet. | Add owner-only ACL set+verify for the token file and include it in the fleet/desktop verifier. |
| MED | Current local `F:\musu_2nd_brain` checkout became dirty after the pin was set. | `build-tauri-sidecars.mjs --brain-only` now correctly refuses to bundle while `docs/specs/current-product-spec.md`, `internal/search/*`, and new lifecycle/search files are uncommitted. A dirty local build produced `vcs.modified=true`, so it is not release-grade. | Commit/clean the brain repo or reset to the pinned clean commit before any MSIX/release build. |
| LOW | Brain sidecar health probe is loopback status-based. | Tauri skips spawning if `http://127.0.0.1:8080/health` is already healthy. A non-brain local service on the same port would be rare but possible. | Tighten probe to validate the expected health body or a lightweight version endpoint. |

## Qualitative Evaluation

The fleet side is meaningfully stronger: stale loopback rows are rejected at write time, filtered at list time, ignored by the resolver/cache path, and deletable through an owner-scoped route plus CLI/script fallback. The product can now distinguish "this machine is usable" from "the cloud still remembers an old bad row".

The remaining fleet blockers are external-state blockers, not source-code blockers: the public release channel has not been clobber-uploaded to rc.21, and the main PC has not yet republished a non-loopback URL. Until those two happen, the one-line install path for the other computer is not ready.

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
- Full sidecar build created both runtime and brain binaries, but the brain repo changed during/after the long Rust release build; subsequent `--brain-only` correctly failed dirty and the generated binary reports `vcs.modified=true`. Treat this as non-release evidence only.
- Tauri targeted tests:
  `parses_knowledge_auth_token_without_logging_context`,
  `tauri_bundle_config_includes_runtime_sidecar`.
- `git diff --check`.
- MUSU index sync: `indexed 3309 files (3804 symbols) in 336921 ms`.
- MUSU recall/search proof: query `fleet rc21 brain sidecar knowledge ingest` returned this audit doc.

Not completed locally:

- `writer::runner::tests::knowledge_task_source_uses_scoped_markdown_payload`.
  The local Windows/MSVC `rustc` process stopped making CPU/working-set progress twice and was killed after stall confirmation.
  The code path was still reviewed and `rustfmt` passed; rerun on a clean Rust toolchain/CI lane.

## Next Steps

1. Finish the current targeted Rust/Tauri tests and patch any compile/test failures.
2. Run `npm run test:public-release`, `npm run typecheck`, and `git diff --check` after final docs/code edits.
3. Clean or commit the `F:\musu_2nd_brain` dirty work, then rerun `node scripts/build-tauri-sidecars.mjs --brain-only` and verify `go version -m` reports `vcs.modified=false`.
4. Sync the changed repo into MUSU brain index and verify recall for `fleet rc21 brain sidecar knowledge ingest`.
5. Commit and push `feat/v33-residual-finalize`.
6. After explicit deploy/release approval, upload rc.21 `desktop-latest` assets and run the release canary.
7. On the main PC, install/restart rc.21, run `repair-fleet-node-public-url.ps1`, and then rerun strict fleet audit.
8. Add a token ACL verifier and packaged first-run brain ingest proof before calling the brain bonding release-grade.
