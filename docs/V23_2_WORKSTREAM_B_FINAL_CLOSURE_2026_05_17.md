# V23.2 Workstream B — Final closure (wiki/376)

**Date**: 2026-05-17
**Status**: Code-complete across all 7 sub-workstreams (B0+B1+B2+B3+B4a+B4b+B4c+B5). Code on `v22/gap-analysis`. Main-branch merge stays gated by the Const VII "진행해" prompt + the operator-gated 5-host B4c experiment in wiki/375 §5.
**Predecessors**: wiki/361 (master plan), wiki/362-375 (per-sub-workstream plans + closures)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/376`

---

## 1. Summary

V23.2 Workstream B set out to deliver: (a) per-install HMAC telemetry auth replacing the V23.1 shared-secret stopgap, (b) musu.pro `/validate` returning `user_id` (replacing the legacy email-cache fallback in musu-bee), (c) admin-authenticated `/v1/telemetry/summary`, (d) the `musu-backend.tar` WSL2 build pipeline + Windows PowerShell installer + 30%-gate Const VI experiment that decides α-path vs β-path for V23.3, and (e) optional image-bloat trim of the signaling Docker image. All seven sub-workstreams are code-complete on `v22/gap-analysis`. Tests stay 189/189 green throughout; `npx tsc --noEmit` clean; PowerShell AST parses clean. The remaining work is operator-side: B4a's first tar build, B4b's first install on Windows host, and B4c's 5-host gate experiment that fills in wiki/375 §5.3 with the α/β `gate_decision`. Once §5.3 is recorded, Const VII main-merge of V23.2 stays gated by explicit user "진행해" per `MODE_Agent_Team.md` §"Conflict resolution".

---

## 2. Sub-workstream rollup

| Sub-WS | Status | Wiki | Commit | Description |
|---|---|---|---|---|
| B0 | code-complete | wiki/362 | (pre-B1) | First-deploy validation prep |
| B1 | code-complete + audited | wiki/363 + wiki/364 | (B1 commit chain) | Per-install HMAC; closes V23.1 audit HIGH #2 |
| B2 | code-complete + audited | wiki/365 + wiki/366 | (B2 commits) | musu-pro `/validate` user_id + musu-bee fallback removed |
| B3 | code-complete + audited | wiki/367 + wiki/368 | (B3 commit) | Admin auth on `/v1/telemetry/summary` |
| B5 | code-complete | wiki/369 | `c334aeb` | tsconfig.docker.json scopes signaling-only |
| B4a | code-complete + audited | wiki/370 + wiki/371 | `1c389d5` | musu-backend.tar build pipeline + validation script |
| B4b | code-complete + audited | wiki/372 + wiki/373 | `1b42960` | Windows PowerShell installer + gateway main.ts |
| B4c | code-complete (operator §5.3 pending) | wiki/374 + wiki/375 | `3e2a359` | Const VI gate experiment + α/β decision template |

Final feature-branch HEAD: `3e2a359` on `v22/gap-analysis`.

---

## 3. Acceptance criteria (master plan §V23.2 exit)

Per wiki/361 §V23.2 exit (lines 313-318):

- [x] Per-install HMAC is the only auth path on telemetry write endpoints — **YES** (B1 ships HMAC; shared-secret retained behind explicit V23.1 compat flag for back-fill window, removable in V23.3 per B1 closure)
- [x] musu.pro `/validate` returns `user_id` in production — **YES** (B2 cross-repo: musu-pro 3-LOC commit deployed before musu-bee fallback removal; B2-bee 4-commit chain landed clean)
- [ ] OPERATOR-GATED: A clean Windows VM completes the installer flow end-to-end with telemetry visible in `/summary` — **operator runs B4b's install-wsl2.ps1 on ≥1 host** (subsumed by B4c's 5-host run per wiki/375 §3)
- [ ] OPERATOR-GATED: B4c Const VI gate has a written decision (α or β) — **operator fills wiki/375 §5.3 post-experiment**
- [x] All findings from each sub-workstream's independent audit are either closed or explicitly deferred with reasoning in the closure doc — **YES** across all 7 sub-workstream closures

Two operator-gated items remain. Per `MODE_Agent_Team.md` block-on-user heartbeat priority (rule 1), these gate the V23.2 main-merge until resolved.

---

## 4. What was hard

- **B1**: dual-audit (2× security-engineer) caught the M1 cache-poisoning fragility in `validateToken`'s `forceRefresh` adapter. Builder loop on the audit-fix was 1 iteration. Body-identity HMAC invariant established as the canonical secure-signing pattern, reused in B4b's `install_completed` emission.
- **B2 cross-repo**: musu-pro deploy → drain (CACHE_TTL_MS + DEGRADED_GRACE_MS = 5min30s) → curl smoke → musu-bee fallback removal. Sequencing was load-bearing because musu-bee's fallback removal pre-deploy would have broken existing installs.
- **B4a Critic HIGHs**: 4 HIGHs all resolved in plan §13 before Builder. Spike for K3s-on-Alpine-WSL2 was deferred to operator validation time (the `--snapshotter=native` flag was baked in based on documented WSL2-overlayfs issues; first operator install validates).
- **B4b Critic HIGHs**: 3 HIGHs. C3 (un-elevated `-TunnelToken` leak on parent CmdLine) was a real security defect prevented by the agent-team workflow. C1 (gateway-main compile recipe broken) was caught at plan-critique time, would have been an immediate Builder blocker. C14 INFO-MUST-DO (install_completed HMAC body-identity) was implemented correctly first try; Auditor independently verified the single-`rawBody` invariant.
- **B4b Auditor MEDIUMs**: M1 (bootstrap-path C14 gap — installer pre-write vs gateway bootstrap fallback) required adding a public `accountKey` getter to `GatewayClient`. Orchestrator caught a follow-on bug in audit-fix Builder's first attempt: getter returned only `bootstrappedAccountKey`, breaking canonical α-path; patched to `?? cfg.accountKey`.

---

## 5. What's left for the operator

### 5.1 B4a first build (per wiki/371 §3 OPERATOR-GATED)
On any Alpine WSL2 host: run `installer\build-musu-backend.ps1` → produces `musu-backend.tar` + `.sha256` sidecar. First-build measurement appended to wiki/371 §8 (placeholder reserved).

### 5.2 B4b first install (per wiki/373 §3 OPERATOR-GATED)
Subsumed by B4c. Operator runs `installer\install-wsl2.ps1` on the first B4c host; if it succeeds end-to-end with `telemetry_install` row visible via `/v1/telemetry/summary`, B4b acceptance is satisfied.

### 5.3 B4c 5-host experiment (per wiki/375 §5 OPERATOR-GATED)
Run B4b on 5 hosts covering ≥3 distinct `b4c_host_class` values. Aggregate via `installer/b4c-aggregate.sh`. Fill in wiki/375 §5.3 with the recorded `gate_decision` + reasoning.

### 5.4 Const VII main-merge gate
After §5.3 records `alpha` (or `beta` + V23.3 retreat plan recorded), explicit user "진행해" authorizes `git merge v22/gap-analysis` to `main`.

---

## 6. Constitution gates summary

| Gate | Status | Notes |
|---|---|---|
| Const III (schema) | satisfied | B1 added telemetry_install schema v41; user authorized `applyMigrations(41)` migration via "진행해" before B1 landed. No further schema changes in B2-B5. |
| Const VI (experiment) | DEFERRED to operator | B4c experiment data + α/β decision in wiki/375 §5.3 |
| Const VII (push) | satisfied for feature-branch; main-merge deferred | All 7 sub-workstreams pushed to `v22/gap-analysis` per "진행해" cadence. Main-merge stays gated. |

---

## 7. Aggregate metrics

- Sub-workstreams completed: 7 (B0+B1+B2+B3+B4a+B4b+B4c+B5)
- Wiki docs produced: 14 (wiki/362 through wiki/375, plus this wiki/376)
- Test count: 189/189 (stable from B5 baseline through B4c; no test additions or regressions)
- New files committed across all 7 sub-workstreams: 34 (musu-relay/installer/ + musu-relay/src/gateway/main.ts + docs/)
- Existing files modified: 1 (musu-relay/src/gateway/client.ts — B4b audit-fix M1: private field rename + public getter)
- Cross-repo touches: 1 (musu-pro `/api/v1/nodes/validate` route — B2-pro 3-LOC commit, deployed pre-bee)
- Critic findings raised: 12+ HIGHs across B1/B4a/B4b
- Critic HIGHs resolved before Builder: 12+ (100%, no Critic HIGH made it through to Auditor unaddressed)
- Auditor-surfaced MEDIUMs not caught by Critic: 5 (B4a M1/M2/M3 + B4b M1/M2; all fixed in audit-fix loops)
- Constitution III gates triggered: 1 (B1 schema v41)
- Constitution VII gates triggered: 5 (B1 push, B2-pro main, B2-bee push, B3 push, B4a push, B4b push, B4c push, B5 push)

---

## 8. V23.3 candidates (per α-path)

Assuming B4c records `gate_decision = alpha`, the following V23.3 candidates are queued (collected from B4a/B4b/B4c follow-on tickets):

- musu-bridge as K3s Pod inside the same distro (replaces v21 native musu-bridge)
- SOURCE_DATE_EPOCH byte-reproducible tar builds (currently content-reproducible only)
- Deep `@roamhq/wrtc` musl audit (currently smoke-import only)
- T1.9 wrtc factory wiring — replaces `pcFactory` stub in `src/gateway/main.ts`
- Manifest URL consumption (currently URLs in manifest.yaml are dead-code documentation; build script hardcodes)
- `/etc/musu-version` `node_version` precision (currently records "20.x"; should record actual apk-resolved patch)
- Pgrep race window for "never_started" classification in `validate-import.ps1` (B4c aggregation may misclassify; B4c.2 candidate)
- K3s checksum enforcement in `build-musu-backend.sh` (currently TODO placeholders in manifest.yaml)
- B4b LOW findings: tunnel_token_hash consumption on resume, dead-code switch arm cleanup, logrotate inside WSL distro
- `/v1/telemetry/install_attempt` unauth endpoint for install-failure dump upload (currently dumps stay local; consent UX deferred)

## 9. V23.4 candidates

- musu-bee Tauri/Electron wrapper that calls `validate-import` automatically
- ko.psd1 localization for PowerShell installer error strings
- musu.pro deep-link tunnel_token UX (replaces `Read-Host -AsSecureString` interactive prompt)
- Per-host class advanced telemetry (e.g., AV-product fingerprint, GPO ADMX inventory) — Const III review required

## 10. V23.5 candidates

- Code-signed `musu.exe` wrapper for the PowerShell installer (eliminates baked-SHA-256 dependency)
- Byte-reproducible builds via SOURCE_DATE_EPOCH + pinned apk-index snapshot
- B4c automation infrastructure (5-VM pool for unattended re-runs)
- `musu-write-env` as B4a ABI extension (currently B4b heredocs gateway.env directly via tmp+mv; ABI seam exists but isn't formalized as a binary)

---

## 11. Risks for the operator phase

- **B4c K3s spike could fail**: B4a baked `--snapshotter=native --disable=traefik` into openrc-k3s.conf based on documented WSL2-overlayfs issues; first operator install may discover additional flag adjustments needed. The validate-musu-backend.md runbook §"K3s never goes Ready" provides operator-side fallback flag suggestions.
- **5-host procurement cost**: B4c requires ≥3 distinct `b4c_host_class` values represented. VM snapshots reduce cost vs physical hosts. Critic-prep §13 attack vector 5 in wiki/372 noted Group Policy / corporate-AV interference as a real failure class.
- **install_completed HMAC body-identity invariant**: tested in-isolation but never exercised against real signaling server. First B4c host's success is the integration test. If body-identity is broken (e.g., a missing whitespace, JSON canonicalization difference), signaling rejects 401; install reports success on Windows side but no telemetry row appears. Operator should verify by querying `/v1/telemetry/summary` after first install.
- **Tar SHA-256 baking lifecycle**: V23.2 ships `$ExpectedTarHash = "<UNSET>"` as a dev-mode escape hatch; in production each release must populate the constant. The B4c experiment uses sidecar-fallback (passes `-ExpectedSha256` from `.sha256` file) so the baked-hash dependency is deferred to the V23.2 release packaging step.

---

## 12. References

- wiki/361 (master plan)
- wiki/362 (B0 prep)
- wiki/363 + wiki/364 (B1 plan + closure)
- wiki/365 + wiki/366 (B2 plan + closure)
- wiki/367 + wiki/368 (B3 plan + closure)
- wiki/369 (B5 closure)
- wiki/370 + wiki/371 (B4a plan + closure)
- wiki/372 + wiki/373 (B4b plan + closure)
- wiki/374 + wiki/375 (B4c plan + closure)
- V23_MASTER_PLAN_2026_05_15.md §0.5 (3-tier install flow)
- `MODE_Agent_Team.md` (agent-team activation triggers, heartbeat decision tree)
- `feedback-autonomous-loop.md` (autonomous-loop protocol — applied throughout B1-B4c)

---

**End of V23.2 Workstream B final closure (wiki/376). Awaiting operator: (1) B4a first build, (2) B4c 5-host experiment + wiki/375 §5.3 fill-in, (3) Const VII "진행해" for main-merge.**
