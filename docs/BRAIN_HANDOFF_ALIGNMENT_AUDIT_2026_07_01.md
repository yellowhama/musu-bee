# Brain Handoff Alignment Audit (2026-07-01)

## Verdict

The latest brain-side handoff is present in the brain repo and is already
carried into `musu-bee` as a local reference copy.

This is aligned with the MUSU desktop product contract:

- Canonical brain handoff:
  `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`
- Local `musu-bee` copy:
  `docs/HANDOFF-musu-integration.md`
- Product overlay contract:
  `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`
- Current packaged proof report:
  `docs/CURRENT_PACKAGED_BRAIN_MSIX_AUDIT_2026_07_01.md`

The local copy intentionally adds only a `MUSU-BEE local copy note` at the top.
That note prevents the main integration mistake: following standalone brain
defaults under `~/.musubrain` inside the MUSU desktop product. For MUSU, the
product root remains `~/.musu/brain`.

## Evidence

Brain repo:

- Path: `F:\musu_2nd_brain`
- Branch: `main`
- State: clean and pushed
- HEAD: `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14`
- Latest commit: `chore: ignore sqlite sidecar files`

MUSU pin:

- Pin file: `musu-bee/src-tauri/musu-brain.pin.json`
- `vcs_revision`: `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14`
- `product_version`: `1.15.0-rc.22`

Verification run on 2026-07-01:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\build-msix.ps1 -NoBump -PreflightOnly`
  passed:
  - version coherence across Cargo, Tauri, public release metadata, and
    `musu-brain.pin.json`
  - brain repo HEAD matches pin
  - brain repo is not dirty
- `cargo test --manifest-path musu-bee\src-tauri\Cargo.toml knowledge_root_contract_uses_musu_profile_brain --lib`
  passed: `1 passed`, `45 filtered out`.

## Indexing

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3560 files` and `3908 symbols`.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources for this report, the wiki entry, and the roadmap snippet.
- `/v1/process` processed 3 new sources with `recovered=0`.
- `/v1/query` for
  `wiki/1197 brain handoff alignment eb0c0ec knowledge_root_contract_uses_musu_profile_brain`
  returned 5 results with top title
  `wiki/1197 brain handoff alignment audit report`.

## System Design Audit

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| INFO | Brain handoff is discoverable from both repos. | Canonical brain file exists, and `docs/HANDOFF-musu-integration.md` exists in `musu-bee`. | Future agents can find the integration rules without leaving the active repo. | Keep the local copy as reference, not a divergent spec. |
| INFO | The only handoff copy delta is the local product overlay note. | `git diff --no-index` showed only the inserted `MUSU-BEE local copy note`. | No hidden content drift was found. | If the brain handoff changes materially, refresh the local copy and preserve the overlay note. |
| HIGH | Product data-root contract remains `~/.musu/brain`, not standalone `~/.musubrain`. | `knowledge_root_contract_uses_musu_profile_brain` passed; root contract doc records the same. | Prevents split stores and uninstall/update data-loss risk. | Keep `MUSUBRAIN_ROOT` and `MUSU_KNOWLEDGE_ROOT` injected from the single MUSU resolver. |
| HIGH | Brain pin gate is working. | `build-msix.ps1 -PreflightOnly` passed against brain HEAD `eb0c0ec`. | Release builds fail before a long package build if the external chip drifts or is dirty. | Keep this as a hard build gate. |
| HIGH | Full product completion remains NO-GO. | Latest go/no-go after Store-reviewed bundle refresh still had 10 blockers. | Handoff alignment does not prove public release, second-PC freshness, relay transport, Store release, or design approval. | Continue with the blocker list in the full product roadmap. |

## Product Contract Notes

- `musu-brain.exe` stays a Go chip. Do not rewrite it into Rust for this
  integration.
- MUSU owns data root, lifecycle, UX, package staging, and release evidence.
- Brain owns its own store; MUSU communicates by sidecar CLI/HTTP/proxy, not by
  shared SQLite writes.
- The brain HTTP surface stays loopback-only; user-facing access should go
  through MUSU surfaces.
- MCP registration must follow the handoff's print-don't-write policy unless a
  future UX adds an explicit user-consent gate.

## Next Steps

1. Use the current Store-reviewed bundle and current second-PC kit for the next
   physical `hugh-main` run.
2. Repair external `musu.pro` DNS/TLS before claiming public metadata readiness.
3. Keep Store release separate from local Store-reviewed artifact readiness:
   Partner Center certification and Store-signed install evidence are still
   required.
4. Do not mark relay/P2P as release-grade while route evidence still reports
   `peer_identity_verified=false` or `encryption=none_http_bearer`.
5. Continue cockpit recall/capture and MCP UX work under the root contract and
   print-don't-write policy.
