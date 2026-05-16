# V23.2 Workstream B4b — Windows PowerShell installer closure (wiki/373)

**Date**: 2026-05-16
**Status**: Code-complete, tests 189/189 green, `npx tsc --noEmit` clean, ready for Const VII feature-branch push. Final operator acceptance criteria are OPERATOR-GATED (no Windows host with B4a tar in orchestrator environment to drive a real install).
**Predecessors**: wiki/361 (master plan §B4b), wiki/364 (B1 closure — Critic HIGH #1 "Windows ACL for account_key" deferred to here; this is the doc that closes it), wiki/370 (B4a detail plan — `musu-write-key` ABI, OpenRC layout), wiki/371 (B4a closure — format precedent), wiki/372 (B4b detail plan — §14 Critic Findings)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/373`
**Workstream pattern**: `MODE_Agent_Team` — Researcher (`deep-research-agent` + `Explore` parallel) + Planner (`Plan`) + Critic (`system-architect`) + Builder (`devops-architect`) + Auditor (`quality-engineer`) + audit-fix Builder + Scribe. Three agent-team triggers met (auth-adjacent HMAC + key persistence ABI, ≥3 specialist roles, ≥4 files / 2 directories).

---

## 1. Summary

V23.2 Workstream B4b delivers the Windows-side PowerShell installer pipeline per wiki/372. Seven new files (1 TypeScript at `musu-relay/src/gateway/main.ts` + 4 PowerShell at `musu-relay/installer/` + 1 OpenRC service file `openrc-musu-gateway-b4b.conf` + 1 markdown runbook `install-musu-backend.md`), plus one minimal modification to `src/gateway/client.ts` (private field `accountKey` renamed to `bootstrappedAccountKey` and a new public `get accountKey()` getter — required for audit-fix M1). Closes wiki/364 Critic HIGH #1 (Windows ACL for `account_key`): the per-account HMAC key now lives INSIDE the WSL filesystem at `/etc/musu/account_key` 0600 root:root, never at `%LOCALAPPDATA%\musu` where `fs.chmod` would be a Windows-ACL no-op. Critic (`system-architect`) returned 3 HIGH / 7 MEDIUM / 3 LOW / 1 INFO — all resolved inline in plan §14 before Builder spun up. Auditor (`quality-engineer`) surfaced 2 additional MEDIUMs not in Critic scope (M1 bootstrap-path C14 gap, M2 stale install_elapsed_ms) — both resolved in audit-fix. Tests stay 189/189 green; `npx tsc --noEmit` clean. Operator-runtime acceptance criteria (an actual install on a real Windows host across each of 6 host tiers) are OPERATOR-GATED because the orchestrator environment is not a Windows host with B4a's tar pre-built; this closure doc is the carrier for the eventual measurement appendix.

---

## 2. Files touched

All `installer/` paths relative to `musu-relay/installer/`. All `src/` paths relative to `musu-relay/`.

| File | Change | LOC |
|---|---|---|
| `src/gateway/main.ts` | NEW (gateway entry-point for the WSL backend distro) | ~264 |
| `src/gateway/client.ts` | MODIFIED (rename private field + new public getter; 5 line-edits total) | +4 / -3 |
| `installer/Musu-Common.psm1` | NEW (shared PowerShell utilities — elevation probe, logging, HMAC helpers) | ~310 |
| `installer/check-prereqs.ps1` | NEW (6-probe host classification, returns telemetry-shaped JSON) | ~245 |
| `installer/install-wsl2.ps1` | NEW (12-step orchestrator: elevation hop, prereq, tar verify, `wsl --import`, key write, env write, gateway boot) | ~525 |
| `installer/uninstall.ps1` | NEW (5-step idempotent removal; `-Reset` clears install_id) | ~140 |
| `installer/openrc-musu-gateway-b4b.conf` | NEW (full-file OpenRC service replacement; supersedes B4a's `openrc-musu-gateway.conf` inside the imported distro) | ~40 |
| `installer/install-musu-backend.md` | NEW (operator runbook: install + uninstall + recovery for all 6 host tiers) | ~230 |

Totals: 8 files — 7 NEW + 1 minimally modified pre-existing. ~1750 LOC across PowerShell + TypeScript + OpenRC + markdown.

The `src/gateway/client.ts` modification is the only deviation from plan-OQ9's "PowerShell + ONE new TS file" boundary. The deviation is intentional and minimal: audit-fix M1 (§5) requires a public accessor for the bootstrapped account key, and adding a 5-line accessor to client.ts is strictly less invasive than the rejected alternative (re-architecting `bootstrapAccountKey` to write back through a callback). No semantic behavior change in client.ts; the existing `bootstrapAccountKey()` path continues to populate the same field, only its name changes (`accountKey` → `bootstrappedAccountKey`).

---

## 3. Plan adherence (acceptance criteria from wiki/372 §11)

- [x] 7 new files committed under `musu-relay/installer/` + 1 new file at `musu-relay/src/gateway/main.ts`
- [x] `src/gateway/client.ts` minimally modified (audit-fix M1; documented in §5 below)
- [x] PowerShell scripts pass `[System.Management.Automation.Language.Parser]::ParseFile` (zero AST errors on `Musu-Common.psm1`, `check-prereqs.ps1`, `install-wsl2.ps1`, `uninstall.ps1`; Auditor independently verified)
- [x] `src/gateway/main.ts` compiles via `npx tsc --noEmit` clean
- [x] `npm run build` produces `dist/gateway/main.js` (~10,559 bytes; B4a's `cp -r dist/gateway` step in `build-musu-backend.sh:175` picks it up automatically on next tar build)
- [x] `installer/install-musu-backend.md` documents install + uninstall + recovery for all 6 host_class tiers (`wsl2-already-on`, `wsl2-off-feature-on`, `wsl2-off-feature-off`, `wsl2-off-feature-unknown`, `no-bios-vt-simulated`, `fresh-win-vm`)
- [x] `check-prereqs.ps1` returns identical JSON shape regardless of tier (only field values differ)
- [x] `install-wsl2.ps1` supports `[CmdletBinding(SupportsShouldProcess)]` for `-WhatIf`
- [x] `npm test` reports 189/189 (B4a baseline preserved; existing test suite untouched)
- [x] `npx tsc --noEmit` clean
- [ ] OPERATOR-GATED — actual install on a Windows host with B4a's tar succeeds for at least 1 tier (lowest-friction: `wsl2-already-on`)
- [ ] OPERATOR-GATED — `uninstall.ps1` is fully idempotent (re-run after partial-state install completes cleanly)
- [ ] OPERATOR-GATED — reboot resume path on `wsl2-off-feature-off` tier executed on ≥1 host; Scheduled Task self-deletes after resume
- [ ] OPERATOR-GATED — `wsl -d musu -- cat /etc/musu/gateway.env` returns the 8 expected keys with 0600 mode
- [ ] OPERATOR-GATED — successful install produces a row in `telemetry_install` with `musu_install_id` matching `%LOCALAPPDATA%\musu\install_id` and `step_failed=NULL` (the C14 acceptance criterion)
- [ ] OPERATOR-GATED — `-ForceReinstall` flag works on existing 'musu' distro collision
- [ ] OPERATOR-GATED — `uninstall.ps1 -Reset` clears `%LOCALAPPDATA%\musu\install_id` file

OPERATOR-GATED items are deliberately deferred to the first operator run on a Windows host with B4a's tar built. This closure doc will be amended with measurements + tier coverage notes after first install.

---

## 4. Critic Findings (resolved) — adjudication

Reproduction of wiki/372 §14 with Auditor adjudication appended. All HIGHs require explicit Auditor address per `MODE_Agent_Team.md` §"Phase 5 Auditor".

| # | Sev | Critic finding | Resolution in plan | Auditor adjudication |
|---|---|---|---|---|
| C1 | **HIGH** | gateway-main.ts compile recipe broken: `tsc --outDir installer installer/gateway-main.ts` cannot resolve `./client` import; `--rootDir` shenanigans required | Relocated to `musu-relay/src/gateway/main.ts`. Existing `tsconfig.json` `include: ["src"]` picks it up; `npm run build` produces `dist/gateway/main.js` automatically | VERIFIED PASS — `src/gateway/main.ts:1-264` exists and compiles clean. `openrc-musu-gateway-b4b.conf:24` references `/usr/local/lib/musu-gateway/dist/gateway/main.js` (the location B4a's `cp -r dist/gateway` will place it). `install-wsl2.ps1:502-515` does NOT copy any shim — the file is already inside the tar |
| C2 | **HIGH** | α-path orphan recovery missing. Steps 6-9 can fail independently, leaving registered distro + missing account_key + musu-init blocked forever. Operator stuck | Added try/catch wrapper around steps 7-9 with `wsl --unregister musu` cleanup on throw. Step 6 itself outside wrapper. Pre-check probe for existing 'musu' distro + `-ForceReinstall` flag (default off) | VERIFIED PASS — `install-wsl2.ps1:471-484` implements the pre-check probe via `wsl -l --quiet` + `-ForceReinstall` flag refusal. `:498-616` wraps steps 7-9 in try/catch. `:606-616` cleanup branch invokes `wsl --unregister musu` on throw |
| C3 | **HIGH** | `-TunnelToken` exposed on un-elevated parent command-line for the brief window before elevation hop fires. Other processes can read via `Get-Process \| Select CommandLine` | Refuse un-elevated `-TunnelToken` outright. Throw at step 1 if `!isElevated -and $TunnelToken`. Elevated child step 5 prompts via `Read-Host -AsSecureString`. `Invoke-MusuElevationHop` temp-file pattern removed | VERIFIED PASS — `install-wsl2.ps1:105-114` throws on `!isElevated -and $TunnelToken`. `:116-137` elevation hop drops the token from the child command-line. `Invoke-MusuElevationHop` is NOT present in `Musu-Common.psm1` (grep verified). `:402-403` uses `Read-Host -AsSecureString` in the fallback path |
| C4 | MEDIUM | install_id reuse at `%LOCALAPPDATA%\musu\install_id` contradicts "ephemeral never tied to identity" but plan reuses across re-installs | Position locked: per-Windows-user-on-host. `-Reset` flag added to uninstall.ps1 | VERIFIED PASS — `uninstall.ps1:25-32` parses `-Reset`; `:88-93` removes the install_id file under that flag |
| C5 | MEDIUM | `sed -i` patching of `/etc/init.d/musu-gateway` is fragile (silent no-op on already-patched, silent broken-output on future tar updates) | Replaced with full-file atomic replacement via shipped `openrc-musu-gateway-b4b.conf`. Tmp+mv pattern | VERIFIED PASS — `install-wsl2.ps1:502-515` writes `openrc-musu-gateway-b4b.conf` content to `.tmp`, chmods, then `mv -f`. No `sed` call anywhere in `install-wsl2.ps1` (grep verified) |
| C6 | MEDIUM | `gateway.env` heredoc write is non-atomic; partial write leaves tunnel_token in half-populated file | Step 8 writes `gateway.env.tmp` first, chmod 0600, chown root:root, then `mv` | VERIFIED PASS — `install-wsl2.ps1:539-559` uses tmp+chmod+chown+mv pattern |
| C7 | MEDIUM | `user_consent_to_upload` defaults false but next successful install silently flips to true → GDPR-adjacent silent upload. `/v1/telemetry/install_failed` endpoint doesn't exist anyway | Removed `Send-MusuPendingFailureDump` silent auto-upload from step 12. Local persistence stays; explicit-consent upload deferred to V23.3 | VERIFIED PASS — `Send-MusuPendingFailureDump` is NOT present in `install-wsl2.ps1` or `Musu-Common.psm1` (grep verified). Failure dumps stay on disk only |
| C8 | MEDIUM | Baked SHA-256 has no CI-enforced sync between installer and tar release | Release CI gate added to §11; step 4 error includes installer version | VERIFIED PASS — `install-wsl2.ps1:328-336` mismatch error prints `$InstallerVersion` + expected + actual hash. CI gate is a release-process item (no code) |
| C9 | MEDIUM | Reboot resume task may prompt for tunnel_token to hidden console | Scheduled Task uses visible console; 3-retry max then unregisters self | VERIFIED PASS — `install-wsl2.ps1:268-285` Action has no `-WindowStyle Hidden`. `:289-296` max-retry counter stored in state file |
| C10 | MEDIUM | GPO probe coverage incomplete (only 2 registry keys; misses AppLocker/WDAC) | Accepted as known limitation. Corporate-host fallback documented in runbook | VERIFIED PASS — `install-musu-backend.md:185-198` documents corporate-GPO troubleshooting |
| C11 | LOW | §4.3 row 4 (`wsl2-off-feature-unknown`) had no fallback when re-elevated re-probe also returns unknown | Fallback: assume disabled, treat as `wsl2-off-feature-off`, tag telemetry `feature_state_assumed_off=true` | VERIFIED PASS — `check-prereqs.ps1:178-192` implements the fallback branch with the telemetry tag |
| C12 | LOW | Defender exclusion probe is descriptive-only; installer never acts on missing exclusion | Step 5.5 conditionally calls `Add-MpPreference -ExclusionPath`; uninstall reverses | VERIFIED PASS — `install-wsl2.ps1:418-433` step 5.5 conditional `Add-MpPreference`. `uninstall.ps1:104-112` reverses via `Remove-MpPreference` |
| C13 | LOW | B4b doesn't gate Builder on B4a's first-build success (operator-gated items) | Accepted as parallel-velocity choice. End-to-end test is the integration gate | DOC-ONLY — no code action required; closure doc §8 carries the operator dependency |
| C14 | INFO MUST-DO | gateway-main.ts pcFactory stub OK (T1.9 deferred), BUT synthetic install_completed event is sketched-not-implemented; OQ2 hybrid path broken without it | Builder MUST implement install_completed POST in `src/gateway/main.ts`. Reuses HMAC path from `client.ts:489-549` `recordOutcome` pattern. §11 acceptance: row in `telemetry_install` with matching `musu_install_id` + `step_failed=NULL` | VERIFIED PASS — `main.ts:59-126` implements `emitInstallCompleted()` with HMAC-SHA256 signing, single `rawBody` body-identity for `digestHex+postBody` (no double JSON.stringify), payload shape matches `signaling/telemetry.ts:411-414` server-side handler |

**Adjudication summary**: All 3 Critic HIGHs VERIFIED PASS with file:line evidence. All 7 MEDIUMs VERIFIED PASS. All 3 LOWs resolved or accepted-as-doc. INFO C14 turned into a MUST-DO and VERIFIED PASS.

---

## 5. Auditor findings (additional, resolved in audit-fix)

`quality-engineer` Auditor read wiki/372 §14 Critic findings from PRIOR ARTIFACTS, explicitly addressed each Critic HIGH (see §4 above), AND surfaced two additional MEDIUMs not in Critic scope:

### M1 — Bootstrap-path C14 gap

**Problem**: `main.ts:emitInstallCompleted` receives the locally-read `accountKey` (read from `/etc/musu/account_key` at startup). If that file is missing at startup — a legitimate state when the gateway's existing `bootstrapAccountKey()` fallback fires (β-path in OQ1; happens whenever the installer's α-path didn't pre-write) — the local var is `undefined`. Even after `await client.connect()` returns and the client has internally stored a fresh key via `bootstrapAccountKey()`, there was no public accessor on `GatewayClient` to read it. The HMAC-signing branch in `emitInstallCompleted` would see `accountKey === undefined` and silently skip the install_completed emission — breaking the OQ2 hybrid path entirely on the β-path.

**Fix applied**:
1. `src/gateway/client.ts`: private field renamed `accountKey` → `bootstrappedAccountKey` (3 internal references + 1 docstring updated; no semantic change). Added public getter `get accountKey(): string | undefined { return this.bootstrappedAccountKey ?? this.cfg.accountKey; }`. The `??` fallback to `this.cfg.accountKey` is load-bearing: the installer's α-path pre-writes the key via `cfg.accountKey` BEFORE `connect()`, never triggering `bootstrapAccountKey()`, so the bootstrapped field stays undefined on the α-path. The getter must surface either source.
2. `src/gateway/main.ts`: after `await client.connect()`, prefer `client.accountKey` over the local variable; only skip emission if BOTH are undefined.

Note an orchestrator-side catch during independent verification: the original audit-fix Builder iteration set the getter to return only `this.bootstrappedAccountKey` (no fallback). Because the installer's α-path is the more common case in production and never invokes bootstrap, that draft re-created M1 in inverted form (β-path fine, α-path broken). Orchestrator caught this in independent verification and patched the getter to `?? this.cfg.accountKey`.

### M2 — Stale install_elapsed_ms

**Problem**: `install-wsl2.ps1` step 8 (gateway.env write) captured `elapsed-ms` from the script start at mid-install (step 8 of 12). Steps 9-12 (gateway boot, OpenRC enable, musu-init kickoff, cleanup — total ~0-180s of remaining work depending on host) were not counted in the value propagated to `MUSU_INSTALL_ELAPSED_MS` in `gateway.env`. The install_completed telemetry event would then carry an undercount of true install duration by exactly the cost of the steps after env-write, biasing B4c's 5-host aggregation downward.

**Fix applied**:
1. `install-wsl2.ps1:544`: replaced `MUSU_INSTALL_ELAPSED_MS=$elapsedMs` with `MUSU_INSTALL_STARTED_AT_UTC=$($script:StartTime.ToUniversalTime().ToString("o"))` — an ISO 8601 timestamp of step 1's `$script:StartTime`.
2. `src/gateway/main.ts`: parse `MUSU_INSTALL_STARTED_AT_UTC` via `new Date(env.MUSU_INSTALL_STARTED_AT_UTC).getTime()`, then compute `Date.now() - parsedStartedAtMs` at install_completed emission time (post-`connect()`). Fallback: a JS-side `processStartMs` const at top of `main()` if env var is missing or unparseable (resilience for partial-state re-runs).

Result: `install_elapsed_ms` now reflects true end-to-end install duration (Windows installer start through gateway connect + telemetry emit), instead of the partial Windows-side-only measurement.

### Auditor LOW findings — accepted / deferred

Five LOW findings recorded for closure transparency; none require code action at B4b close:

- Stale env-var contract change (`MUSU_INSTALL_ELAPSED_MS` removed from `gateway.env`): no out-of-tree consumers (grep verified across repo + V23 master plan). New `MUSU_INSTALL_STARTED_AT_UTC` is documented in §7 of `install-musu-backend.md`.
- Dead-code switch arm `wsl2-off-feature-unknown` in `install-wsl2.ps1`: deliberate defensive fallback per C11 fix (the canonical flow re-classifies to `wsl2-off-feature-off` before this point). Marked with comment; not removed in case future GPO-probe changes reintroduce the path.
- `tunnel_token_hash` stored in install-state.json but never consumed by resume path: minor; resume currently re-prompts unconditionally. Deferred to V23.3 (resume UX polish).
- `os_version` fallback chain in `main.ts` produces non-canonical strings when env var is missing: documented; no behavior change needed since the env var is always written on the success path.
- OpenRC log rotation not configured inside the WSL distro: V23.3 follow-up (add `logrotate` baked into the tar).

---

## 6. Why agent-team (not solo orchestrator)

Per master plan §"Team execution model" / `MODE_Agent_Team.md`:

- **Auth/security/schema touching?** YES — B4b persists per-account HMAC keys (`account_key`) and signs telemetry with HMAC. It does not CREATE keys (server-side `/issue_install_key` does that; B4b just persists + signs), so it is auth-adjacent rather than auth-foundational. Sufficient to trigger Critic-before-Build but not severe enough to require dual-Auditor (single `quality-engineer` per plan §13 conflict-resolution policy).
- **Cross-repo?** NO (musu-relay only).
- **≥3 specialist roles useful?** YES — `deep-research-agent` for Windows installer landscape + WSL2 reboot orchestration patterns + Defender exclusion semantics, `system-architect` Critic for cross-domain plan review, `devops-architect` Builder for PowerShell + OpenRC + WSL2 interop, `quality-engineer` Auditor for real-code logic verification.
- **≥4 files across ≥2 dirs?** YES — 8 files spanning `musu-relay/src/gateway/` and `musu-relay/installer/`; cross-cuts PowerShell + TypeScript + OpenRC + markdown.

Result: agent-team activated. Researcher (`deep-research-agent` + `Explore` parallel) → Planner (`Plan`) → Critic (`system-architect`, 3 HIGH / 7 MEDIUM / 3 LOW / 1 INFO returned) → Builder (`devops-architect`) → Auditor (`quality-engineer`, 2 additional MEDIUMs surfaced + 5 LOWs) → audit-fix Builder (M1 + M2 resolved; orchestrator independently re-verified M1) → Scribe (this doc).

---

## 7. Constitution gates

- **Const III (schema)**: NO — B4b reads/writes the existing `telemetry_install` table whose schema was set by B1. No new columns, no DDL.
- **Const VI (experiment)**: NO — B4c is the 30%-gate Const VI experiment. B4b is the installer that produces the data B4c will aggregate.
- **Const VII (push)**: YES — feature-branch push to `v22/gap-analysis` allowed at closure time. Main-branch merge of V23.2 remains gated by the final V23.2 closure (separate doc, after B4c lands).

---

## 8. Operational dependency forward

Operator action sequence on a Windows host with B4a's tar built:

1. **(Pre-req if not yet done)** Build B4a's tar on Alpine WSL: run `installer\build-musu-backend.ps1` per wiki/371 §8. Produces `musu-backend.tar` + `.sha256` sidecar. B4a's `cp -r dist/gateway` step now picks up the new `dist/gateway/main.js` automatically (no maintainer action required beyond `npm run build` before tarball creation).
2. On the Windows host: `installer\install-wsl2.ps1 -TunnelToken <hex>` (must be elevated, OR omit `-TunnelToken` and let the elevated child prompt via `Read-Host -AsSecureString`).
3. Installer detects host_class via `check-prereqs.ps1`, branches per `install-musu-backend.md` §4.3.
4. For `wsl2-off-feature-off` tier: enables WSL feature → registers Scheduled Task `musu-install-resume` → reboots → resumes automatically on logon.
5. Post-import: pre-seed `account_key` via `/issue_install_key` (α-path) → start `musu-init` → gateway boots → emits `install_completed` from inside the WSL distro.
6. Verify: `wsl -d musu -- whoami` returns `root`; `wsl -d musu -- cat /etc/musu/gateway.env` shows MUSU_USER_ID / MUSU_TUNNEL_TOKEN / MUSU_INSTALL_ID / MUSU_SIGNALING_URL / MUSU_TELEMETRY_BASE / MUSU_INSTALL_STARTED_AT_UTC / MUSU_ACCOUNT_KEY_PATH / MUSU_ENV_FILE (the 8 expected keys, mode 0600); `SELECT * FROM telemetry_install WHERE musu_install_id = '<id>'` returns 1 row with `step_failed=NULL`.
7. Uninstall: `installer\uninstall.ps1` (preserves install_id for re-install telemetry-lineage); `installer\uninstall.ps1 -Reset` for fully clean state.

Tier coverage for the OPERATOR-GATED §3 items: a single `wsl2-already-on` run unblocks happy-path coverage; the `wsl2-off-feature-off` reboot resume is the highest-value second tier (exercises Scheduled Task self-deletion). Remaining 4 tiers (`wsl2-off-feature-on`, `wsl2-off-feature-unknown`, `no-bios-vt-simulated`, `fresh-win-vm`) can be deferred to B4c's 5-host run, which by design covers ≥1 host per host_class.

---

## 9. Follow-on tickets

From Auditor LOWs, deferred items, and known V23.3+ scope:

- **LOW — OpenRC log rotation inside the WSL distro.** Add `logrotate` package + `/etc/logrotate.d/musu-gateway` baked into B4a's tar. V23.3.
- **LOW — `tunnel_token_hash` resume verification.** `install-state.json` stores the hash but resume never reads it (operator is re-prompted unconditionally). Wire the hash check so re-supply with the SAME token is validated, but a DIFFERENT token requires explicit operator confirmation. V23.3.
- **LOW — Dead switch arm `wsl2-off-feature-unknown` cleanup.** Re-evaluate after first 5 hosts' GPO-probe data; either fix the C11 re-probe so the arm becomes truly unreachable or document the persistent unknown case. V23.3.
- **LOW — `os_version` env-var-missing fallback chain.** Replace the JS `process.platform` + Node-built fallback with a baked `/etc/os-release` read at install time. V23.3.
- **MEDIUM (deferred from C7) — explicit-consent upload UX for `install-failure.json`.** Either (a) add `/v1/telemetry/install_failed` server endpoint + opt-in TOS surface, or (b) leave dumps as support-only artifacts. V23.3 decision.
- **B4c scope (own workstream).** Const VI 30%-gate experiment + 5-host aggregation `jq` script across `validation-result.json` + per-host `telemetry_install` rows + alpha/beta decision doc. Next workstream.
- **V23.2 final closure doc + Const VII main-merge gate.** Single doc after B4c lands; the main-branch merge of all V23.2 work (B1 through B4c) is gated by that closure.
- **V23.3 — musu-bridge inside the tar as K3s Pod.** Per master plan §10.
- **V23.3 — SOURCE_DATE_EPOCH byte-reproducible tar builds.** Carries forward from B4a Critic INFO C15.
- **V23.3 — deep `@roamhq/wrtc` musl audit + T1.9 wrtc factory wiring.** `main.ts:139-149` carries a `pcFactory` stub that throws on use; T1.9 replaces the stub with the actual `@roamhq/wrtc` factory call after the musl-compat audit.
- **V23.4 — musu-bee Tauri UI deep-link for `tunnel_token` acquisition.** `musu://install?token=…` URL handler replaces `Read-Host -AsSecureString`.
- **V23.4 — `ko.psd1` localization.** PowerShell-side message catalog for non-English error strings.
- **V23.5 — code-signed installer EXE wrapper.** Removes the PowerShell-execution-policy gate; allows a single `.exe` download path.

---

## 10. References

- wiki/361 — Workstream B master plan §B4b
- wiki/364 — B1 closure §"Critic Findings (resolved)" Finding #1 (Windows ACL for `account_key`) — CLOSED by B4b via `/etc/musu/account_key` inside the WSL filesystem
- wiki/366 — B2 closure (introduced `/api/v1/nodes/validate` returning `user_id`; B4b installer consumes this at step 3)
- wiki/370 — B4a detail plan (`musu-write-key` ABI, `/etc/musu/account_key` 0600 root:root contract)
- wiki/371 — B4a closure (format precedent; the `dist/gateway/main.js` automatic-bake mechanism)
- wiki/372 — B4b detail plan (§14 Critic Findings table; §11 acceptance criteria; §2.1 locked OQ1-OQ10 design decisions)
- `V23_MASTER_PLAN_2026_05_15.md` §0.5 lines 385-493 — 3-tier install flow canonical spec
- `MODE_Agent_Team.md` — Researcher → Planner → Critic → Builder → Auditor → audit-fix → Scribe flow; §"Conflict resolution" policy applied to single-Auditor (`quality-engineer`) choice over dual-audit
- Builder commit references: file paths above; `npm run build` produces `dist/gateway/main.js` from `src/gateway/main.ts`

---

**End of B4b closure (wiki/373). Awaiting Const VII feature-branch push.**
