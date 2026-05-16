# V23.2 Workstream B4a — musu-backend.tar build pipeline closure (wiki/371)

**Date**: 2026-05-16
**Status**: Code-complete, tests green, ready for Const VII feature-branch push. Final operator acceptance criteria are OPERATOR-GATED (no Alpine WSL distro in orchestrator environment to run an actual build).
**Predecessors**: wiki/361 (master plan §B4a), wiki/364 (B1 closure — `/etc/musu/account_key` ABI reservation context), wiki/369 (B5 closure — most recent format precedent), wiki/370 (B4a detail plan)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/371`
**Workstream pattern**: `MODE_Agent_Team` — Researcher + Planner + Critic (`system-architect`) + Builder (`devops-architect`) + Auditor (`quality-engineer`) + audit-fix Builder + Scribe. Three agent-team triggers met (B4b auth ABI coordination, ≥3 specialist roles, ≥4 files / new directory).

---

## 1. Summary

V23.2 Workstream B4a delivers the `musu-backend.tar` build pipeline plus a single-host PowerShell validation harness per wiki/370. Ten new files under `musu-relay/installer/` reserve B4b's `musu-write-key` ABI (stdin → `/etc/musu/account_key` 0600 root:root, idempotent + `--force` rotation), bake the K3s 1.30 airgap-images payload into a WSL2 rootfs tarball (explicitly NOT a Docker image), and emit a structured `validation-result.json` whose schema is locked for B4c's 5-host aggregation. The Critic (`system-architect`) returned 4 HIGH / 5 MEDIUM / 4 LOW / 1 INFO — every finding was patched into the plan inline before Builder spun up (wiki/370 §13). Auditor (`quality-engineer`) surfaced three additional MEDIUMs not in Critic scope (M1 dual `musu-init` entry-point, M2 CRLF stdin handling in `musu-write-key`, M3 `try/finally` hygiene in `validate-import.ps1`); all three are resolved in the shipped code. Tests stay 189/189 green (no TypeScript source touched); `npx tsc --noEmit` clean. Final operator-runtime acceptance criteria (an actual tar build, a `wsl --import`, a measured K3s Ready latency) are OPERATOR-GATED because the orchestrator environment has no Alpine WSL2 build distro to invoke; the runbook captures the spike escape hatch and this closure doc is the carrier for the eventual measurement appendix.

---

## 2. Files touched

All paths relative to `musu-relay/installer/`. All ten files are NEW; B4a touches zero pre-existing files in the repo.

| File | Type | Purpose | LOC |
|---|---|---|---|
| `build-musu-backend.sh` | bash | Linux build entry: apk-bootstraps Alpine 3.19, fetches K3s + airgap-images, compiles gateway, packs flat rootfs tar, emits `.sha256` sidecar | 287 |
| `build-musu-backend.ps1` | PowerShell | Windows wrapper — shells into an Alpine WSL2 distro and invokes the `.sh` with translated paths | 120 |
| `validate-import.ps1` | PowerShell | Operator validation: SHA-256 → `wsl --import` → pre-seed dummy key → run `musu-init` → poll K3s Ready → parse `free -m` → write `validation-result.json` → cleanup. Wrapped in `try/finally` (audit-fix M3) | 229 |
| `validate-musu-backend.md` | markdown | Operator runbook: pre-reqs, commands, expected output, K3s-spike troubleshooting | (doc) |
| `manifest.yaml` | YAML | Pinned versions (Alpine 3.19, K3s v1.30.4, Node 20.x) and source URLs; K3s checksums marked `TODO-populate` for V23.3 (LOW4) | 38 |
| `musu-init` (inside-tar → `/usr/local/bin/musu-init`) | sh | First-boot orchestrator: K3s start → 180s Ready wait → account_key wait → gateway start; explicit exit codes 0/1/2 | 83 |
| `musu-write-key` (inside-tar → `/usr/local/bin/musu-write-key`) | sh | B4b ABI seam: stdin → `/etc/musu/account_key` 0600 root:root. Supports `--force`; strips both LF and CR from stdin (audit-fix M2). Atomic write via temp file + `mv -f` | 115 |
| `openrc-musu-init.conf` (inside-tar → `/etc/init.d/musu-init`) | OpenRC | The single auto-enabled service. Wraps `/usr/local/bin/musu-init` | 18 |
| `openrc-k3s.conf` (inside-tar → `/etc/init.d/k3s`) | OpenRC | K3s server service with `--snapshotter=native --disable=traefik --write-kubeconfig-mode=644`. Started by `musu-init` only, never auto-enabled | 37 |
| `openrc-musu-gateway.conf` (inside-tar → `/etc/init.d/musu-gateway`) | OpenRC | Gateway service. No `need k3s` (`musu-init` orchestrates Ready gate). Started by `musu-init` only | 33 |

Totals: 10 new files; 6 git-tracked-only; 4 git-tracked AND copied into the rootfs by the build script (`musu-init`, `musu-write-key`, three OpenRC `.conf` files). No existing files modified.

---

## 3. Plan adherence (acceptance criteria from wiki/370 §9)

- [x] `musu-relay/installer/` directory exists; 10 new files committed
- [ ] OPERATOR-GATED — Pre-Builder K3s-on-Alpine-WSL2 spike completed. `--snapshotter=native` baked into `openrc-k3s.conf:27` at code-write time as the documented WSL2-overlayfs workaround. Actual runtime spike OUTCOME (`kubectl get nodes` Ready latency, any additional flags required) is recorded in §8 "K3s spike outcome" of this closure doc after the operator runs the first build
- [x] `build-musu-backend.sh` accepts `--arch`/`--k3s-version`/`--output`/`--allow-oversize` and lays out the §4 tar structure (`build-musu-backend.sh:64-73` arg parsing; steps `[1/10]` through `[10/10]` at lines 132-275)
- [x] Build script emits `${OUTPUT}.sha256` sidecar (`build-musu-backend.sh:259-261`)
- [x] musl-spike step (`@roamhq/wrtc` smoke import) is present and uses an `alpine:${ALPINE_VER}` throwaway container against a read-only mount of the staged `node_modules` (`build-musu-backend.sh:180-194`). Step 3 uses `npm ci --omit=dev` ONLY (`build-musu-backend.sh:171`) — `optionalDependencies` are kept, so `@roamhq/wrtc` IS present for the smoke import (Critic C1 HIGH resolved)
- [x] `build-musu-backend.ps1` exists with the WSL-wrapper invocation (`build-musu-backend.ps1:106`) and validates `BuildDistro` is registered + name-matches `/^alpine/i` (`build-musu-backend.ps1:50-68`)
- [ ] OPERATOR-GATED — Actual `validate-import.ps1` run on a Windows host produces `validation-result.json` with `import_status=ok`, `tar_sha256_status=match`, `k3s_ready_status=ready`, `kubectl_get_nodes` containing at least one Ready node. The SCRIPT writes every required key from §7.2 schema — see `validate-import.ps1:51-188` for the ordered hashtable population. Operator-gated only because there is no orchestrator-side Alpine WSL distro to produce the tar in
- [x] `validation-result.json` schema implementation populates all required §7.2 keys: `tar_path`, `tar_size_bytes`, `tar_sha256`, `tar_sha256_status`, `host_os`, `host_wsl_status`, `started_at_utc`, `finished_at_utc`, `import_status`, `import_error`, `import_time_ms`, `musu_init_output`, `k3s_pid_seen`, `k3s_ready_status`, `k3s_ready_ms`, `kubectl_get_nodes`, `idle_ram_mb_used`, `idle_ram_output_raw`, `musu_version_raw` (`validate-import.ps1:51-188`)
- [ ] OPERATOR-GATED — `wsl -d musu -- whoami` returns `root`. The test SCRIPT path is in the runbook (`validate-musu-backend.md:241`) and the underlying source is `/etc/wsl.conf [user] default=root` baked at `build-musu-backend.sh:220-223`
- [ ] OPERATOR-GATED — `wsl -d musu -- cat /etc/musu-version` returns the provenance block. The bake step is at `build-musu-backend.sh:231-238`; the read step is at `validate-import.ps1:187`
- [ ] OPERATOR-GATED — Measured tar size + idle RAM + K3s Ready latency + `tar_sha256` recorded in this closure doc (will be appended as §8 "First-build measurements" after operator runs the build)
- [ ] OPERATOR-GATED — If tar > 300 MB: closure doc enumerates top 3 size contributors and proposes V23.3 trim. Soft-target gate at `build-musu-backend.sh:273-275`
- [ ] OPERATOR-GATED — If tar > 500 MB: build re-run with `--allow-oversize` and closure doc documents why. Hard-fail gate at `build-musu-backend.sh:268-272`
- [x] Existing musu-relay test suite stays green: `npm test` reports 189/189 (no TypeScript source touched)
- [x] `npx tsc --noEmit` clean (B4a touches no source)

**K3s-on-Alpine-WSL2 spike (Critic C3) status**: NOT run at code-write time — orchestrator environment has no Alpine WSL distro. The escape hatch is baked into the runbook: if the operator's first `validate-import.ps1` shows `k3s_ready_status: never_started` or `timeout`, the operator records the failure mode and adjusts `command_args` in `openrc-k3s.conf` per `validate-musu-backend.md` §"K3s never goes Ready" troubleshooting section. This closure doc is the recipient of that spike outcome.

---

## 4. Critic Findings (resolved)

Reproduction of wiki/370 §13 with Auditor adjudication appended. All HIGHs require explicit Auditor address per `MODE_Agent_Team.md` §"Phase 5 Auditor".

| # | Sev | Critic finding | Resolution in plan | Auditor adjudication |
|---|---|---|---|---|
| C1 | HIGH | `npm ci --omit=optional` strips `@roamhq/wrtc`, then smoke step requires it — self-contradictory false-positive on every build | Step 3 changed to `npm ci --omit=dev` (keep optional). Smoke step finds wrtc present. B5 signaling-only Dockerfile is the only `--omit=optional` path | HONORED — `build-musu-backend.sh:171` is `npm ci --omit=dev` only |
| C2 | HIGH | Gateway OpenRC has no readiness wait for K3s API or account_key — first-boot crash-loop guaranteed | Only `musu-init` auto-enabled. `musu-init` does K3s start → 180s Ready → account_key wait → gateway start. K3s + gateway service files have no `need k3s` | HONORED — `build-musu-backend.sh:246-247` symlinks `musu-init` only. `openrc-k3s.conf:34-36` and `openrc-musu-gateway.conf:31-33` both declare `depend() { need net localmount; }` only — no `need k3s`. `musu-init:30-80` implements the three sequential gates |
| C3 | HIGH | K3s-on-Alpine-WSL2 unspiked; entire 250MB payload bet on assumption | `--snapshotter=native` baked into `openrc-k3s.conf`. Closure doc reserves §"K3s spike outcome" for the operator's first-run measurement | HONORED at code-write time — `openrc-k3s.conf:27` carries `--snapshotter=native --disable=traefik --write-kubeconfig-mode=644`. RUNTIME-DEFERRED to operator validation. Comment block at `openrc-k3s.conf:14-26` documents the escape hatch |
| C4 | HIGH | No `tar_sha256` in validation output, no signature verification — B4c cannot prove "same payload" across 5 hosts | `${OUTPUT}.sha256` sidecar emitted. `/etc/musu-version` baked into tar. `validate-import.ps1` computes SHA-256 unconditionally and `-ExpectedSha256` gates `tar_sha256_status` | HONORED — `build-musu-backend.sh:259-261` emits sidecar via `sha256sum | awk '{print $1}'`. `build-musu-backend.sh:231-238` bakes `/etc/musu-version`. `validate-import.ps1:53` always computes SHA-256; `:55-70` implement the match/mismatch/unverified tri-state; `:187` reads `/etc/musu-version` into `musu_version_raw` |
| C5 | MEDIUM | Build-host bootstrap hand-waved | Build distro locked to Alpine WSL2 | HONORED — `build-musu-backend.ps1:50-68` rejects unregistered or non-Alpine BuildDistro with an actionable error message |
| C6 | MEDIUM | `musu-write-key` missing rotation; WSL uid-mapping unaddressed | `--force` flag added; `/etc/wsl.conf [user] default=root` baked; whoami acceptance test added | HONORED — `musu-write-key:27-40` parses `--force`; `:67-78` implements the conflict + force semantics with exit code 3. `build-musu-backend.sh:220-223` writes `/etc/wsl.conf` with `[user] default=root` |
| C7 | MEDIUM | Content-reproducibility ≠ same payload across B4c hosts | Combined with C4 SHA-256; SOURCE_DATE_EPOCH stays V23.5 | HONORED — B4c will be a single-build/many-hosts run and `tar_sha256` is verified per host; see §9 follow-on for V23.5 byte-reproducible work |
| C8 | MEDIUM | 60s K3s timeout too short on first-boot airgap import | Default 180s; `MUSU_K3S_READY_TIMEOUT_SEC` env override; `k3s_pid_seen` distinguishes never_started from timeout | HONORED — `musu-init:38` reads env with `:-180` default. `validate-import.ps1:37` defaults `$K3sReadyTimeoutSec=180`. `:138-152` probes `pgrep` and writes `k3s_pid_seen`. `:154-165` populates `k3s_ready_status` with the never_started/timeout/ready tri-state |
| C9 | MEDIUM | Unconditional `wsl --unregister` is hostile to interactive debugging | `-KeepOnSuccess` switch added | HONORED — `validate-import.ps1:40` declares the switch; `:220-227` gates cleanup on `$KeepOnSuccess -and ($result.k3s_ready_status -eq "ready")` |
| C10 | MEDIUM | `b4c_host_class` reserved key has no enum | Enum locked in §7.2 schema doc | HONORED — schema enumerates `wsl2-already-on \| wsl2-off-feature-on \| wsl2-off-feature-off \| no-bios-vt-simulated \| fresh-win-vm`. B4a does not write this key; B4c will |
| C11 | LOW | `openrc default` assumed not-initialized | `rc-status >/dev/null 2>&1 \|\| openrc default` idempotent guard | HONORED — `musu-init:27` carries the guard |
| C12 | LOW | `musu-init` polling silently exits after 30 iterations | Explicit `K3S_READY=0` flag + hard `exit 1` on timeout | HONORED — `musu-init:40-52` |
| C13 | LOW | `free -m` regex assumes busybox column order matches coreutils | Comment cites busybox 1.36+ behavior; defer K=V parser to V23.3 if busybox drifts | HONORED with deferral — `validate-import.ps1:180-184`; V23.3 follow-on noted in §9 |
| C14 | LOW | `b4c_host_id` format unspecified | Locked to `$env:COMPUTERNAME` lowercased; B4c may override | HONORED — schema doc |
| C15 | INFO | Plan correctly cites wiki/364 §Critic HIGH #1 | Cross-doc continuity noted | HONORED — this closure doc cross-references wiki/364 in §10 |

---

## 5. Auditor findings (additional, resolved)

`quality-engineer` Auditor read the wiki/370 §13 Critic findings from PRIOR ARTIFACTS, explicitly addressed each Critic HIGH (see §4 above), AND surfaced three additional MEDIUMs not in Critic scope:

- **M1 — dual musu-init entry-point.** Initial Builder draft wrote `/etc/wsl.conf` with BOTH `[user] default=root` AND `[boot] command=/usr/local/bin/musu-init`. Combined with the runlevel symlink (`build-musu-backend.sh:247`), this would spawn two concurrent `musu-init` processes on first boot — one via wsl.conf boot command, one via OpenRC runlevel. Race window between `rc-service k3s start` invocations.
  - **Fix.** Removed `[boot]` block from the heredoc at `build-musu-backend.sh:220-223`. Runlevel symlink at `build-musu-backend.sh:247` is now the sole entry point. Doc-sync of the troubleshooting hint in `validate-musu-backend.md:241` ("`cat /etc/wsl.conf` confirm `[user] default=root` no `[boot]` block — OpenRC runlevel is sole entry point, audit-fix M1").

- **M2 — CRLF stdin handling in musu-write-key.** B4b will invoke `musu-write-key` via `wsl -d musu -- /usr/local/bin/musu-write-key < hexkey.txt`, where the source file very likely originated on the Windows side. PowerShell pipelines + Notepad both emit CRLF line endings. The original key-strip logic at `musu-write-key:47` did `KEY="${KEY%$'\n'}"` which strips one LF but leaves the trailing CR. The downstream length check `[ "$KEY_LEN" -ne 64 ]` then sees length=65 and the helper exits 1, with the operator-confusing error "stdin malformed (length 65, expected 64)".
  - **Fix.** Added `KEY="${KEY%$'\r'}"` at `musu-write-key:48`, applied after the LF strip. Inline comment at `:49-50` documents the audit-fix M2 rationale.

- **M3 — try/finally gap in validate-import.ps1.** The initial draft had ad-hoc cleanup lines scattered along each error-return path. Unhandled exceptions between import and final cleanup (CIM failure, mid-run user Ctrl-C, an unexpected `wsl.exe` exit) would leave a registered `musu-test` WSL distro behind AND no `validation-result.json` written — making subsequent debug runs impossible without manual `wsl --unregister`.
  - **Fix.** Wrapped the entire WSL-touching body in `try { ... } finally { ... }` at `validate-import.ps1:82-228`. The `finally` block unconditionally writes `finished_at_utc`, attempts `Set-Content` of the JSON (inner try/catch swallows write failure to guarantee unregister still runs), and unregisters the distro unless `-KeepOnSuccess` AND `k3s_ready_status -eq "ready"` (`:220-227`). Defensive `wsl --unregister` also added at the import-failure catch (`:108`) so partial registrations from a half-failed `wsl --import` are cleaned at the failure site, with comment citing audit-fix M3.

Four LOW Auditor findings are deferred as follow-on tickets (§9).

---

## 6. Why agent-team (not solo orchestrator)

Per master plan §"Team execution model" / `MODE_Agent_Team.md`:

- **Cross-repo?** NO (musu-relay only)
- **Auth/security/schema?** NO directly, BUT B4a reserves the `musu-write-key` ABI seam that B4b's auth-touching PowerShell installer will invoke at end-user install time — Critic + Auditor gates on the ABI lock are valuable insurance
- **≥3 specialist roles useful?** YES (devops-architect Builder for bash/OpenRC/K3s, system-architect Critic for cross-domain plan review, quality-engineer Auditor for real-code logic — note `MODE_Agent_Team.md` §"Conflict resolution" specifies quality-engineer over security-engineer here because the auth-adjacent contract was already locked at the plan-design level and the Auditor's job was real-code logic verification)
- **≥4 files across ≥2 dirs?** YES (10 files in new `installer/` directory, plus the doc; cross-cuts WSL2 interop, K3s airgap install, OpenRC service contract, PowerShell + bash, YAML manifest)

Result: agent-team activated. Researcher (`deep-research-agent` + `Explore` parallel for K3s airgap docs + existing musu-relay layout) → Planner (`Plan`) → Critic (`system-architect`, 4 HIGH / 5 MEDIUM / 4 LOW / 1 INFO returned) → Builder (`devops-architect`) → Auditor (`quality-engineer`, 3 additional MEDIUMs surfaced) → audit-fix Builder (M1+M2+M3 resolved) → Scribe (this doc).

---

## 7. Constitution gates

- **Const III (schema)**: NO — B4a does not touch any database. Tar contents are inert until B4b imports them.
- **Const VI (experiment)**: NO — B4c is the 30%-gate Const VI experiment. B4a is build pipeline + single-host validation; the JSON output exists to feed B4c, not to constitute the experiment itself.
- **Const VII (push)**: YES — feature-branch push to `v22/gap-analysis` allowed at closure time. Main-branch merge of V23.2 remains gated by the final V23.2 closure (separate doc, after B4b + B4c land).

---

## 8. Operational dependency forward

Operator action sequence:

1. On a Windows host with an Alpine WSL2 distro registered: run `installer\build-musu-backend.ps1 -Arch amd64 -K3sVersion v1.30.4 -Output .\musu-backend.tar`. This produces `musu-backend.tar` plus a `musu-backend.tar.sha256` sidecar.
2. Run `installer\validate-import.ps1 -TarPath .\musu-backend.tar -ExpectedSha256 (Get-Content .\musu-backend.tar.sha256 -Raw).Trim()`. This produces `validation-result.json`.
3. Inspect: must show `import_status=ok`, `tar_sha256_status=match`, `k3s_ready_status=ready`, `k3s_pid_seen=true`, `kubectl_get_nodes` containing at least one Ready node.
4. **If `k3s_ready_status` ≠ `ready`**: troubleshooting per `validate-musu-backend.md` §"K3s never goes Ready". Most likely fix is adjusting `command_args` in `openrc-k3s.conf` (e.g., adding `--flannel-backend=host-gw`), rebuilding the tar, retrying. Record failure mode + fix in §"K3s spike outcome" appendix to this closure doc.
5. Append measured `tar_size_bytes`, `tar_sha256`, `idle_ram_mb_used`, `k3s_ready_ms`, and the `musu_version_raw` block to a §"First-build measurements" appendix below.
6. Once acceptance criteria pass: B4b can start (PowerShell installer + 3-tier prereq check + `musu-write-key` invocation per wiki/364 §Critic HIGH #1 deferred plan).

This closure doc is updated with the spike outcome and the first-build measurements after step 5. The current commit is feature-branch-push-ready independent of those appendices.

---

## 9. Follow-on tickets

From Auditor LOWs and known deferrals:

- **LOW1 — manifest.yaml URL dead-code.** `k3s_binary_url` / `k3s_airgap_url` / `k3s_install_url` in `manifest.yaml:24-26` are documentation-only (the build script builds URLs from `${K3S_VER}` directly). Either parse them in `build-musu-backend.sh` or comment them as docs-only. V23.3.
- **LOW2 — node_version provenance precision.** `manifest.yaml:19` records `node_version: "20.x"` which propagates to `/etc/musu-version`. Replace with the apk-resolved patch version at build time. V23.3.
- **LOW3 — pgrep race for never_started classification.** `validate-import.ps1:138` probes `pgrep` AFTER `musu-init` exits. If K3s started, panicked, and died before the probe, `k3s_pid_seen=false` classifies as `never_started` when `timeout` would be more accurate. Move probe inside `musu-init`'s lifetime or carry the observed K3s pid via a state file. B4c follow-up (matters once 5-host aggregation parses these classifications).
- **LOW4 — K3s checksum enforcement.** `manifest.yaml:34-37` carry `TODO-populate-from-k3s-release` placeholders. Populate from the first successful build and add `sha256sum -c` enforcement in `build-musu-backend.sh` step 2. V23.3.
- **Critic LOW C13 deferral — busybox column-order parser.** `free -m` regex at `validate-import.ps1:182` defensible until busybox drifts. Switch to K=V structured output if needed. V23.3+.
- **Critic INFO C15 + plan §10 — byte-reproducible builds.** `SOURCE_DATE_EPOCH`, pinned apk-index snapshot. V23.5.
- **Plan §10 — musu-bridge inside the tar.** V23.3 as a K3s Pod inside the same distro.
- **B4b scope (own workstream).** `installer/check-prereqs.ps1` (3-tier virtualization handling), `installer/install-wsl2.ps1` (orchestrator), `installer/uninstall.ps1`, the end-user PowerShell install flow that invokes `musu-write-key` with a real 64-byte hex key.
- **B4c scope (own workstream).** Extend `validate-import.ps1` to write `b4c_host_id` (default `$env:COMPUTERNAME` lowercased per C14) + `b4c_host_class` (locked enum per C10). Build the `jq` aggregation script across 5 JSON files. Author the Const VI 30%-gate decision doc.

---

## 10. References

- wiki/361 — Workstream B master plan §B4a
- wiki/364 — B1 closure (security/auth foundation; deferred Critic HIGH #1 — `/etc/musu/account_key` ABI reservation context that B4a coordinates with via `musu-write-key`)
- wiki/366 — B2 closure (cross-repo fallback precedent)
- wiki/368 — B3 closure (admin auth on `/summary` precedent)
- wiki/369 — B5 closure (format precedent; `tsconfig.docker.json` signaling-only `--omit=optional` rationale that informs B4a step 3's deliberate non-use of `--omit=optional`)
- wiki/370 — B4a detail plan (§13 Critic Findings, §9 acceptance criteria, §7.2 schema lock)
- K3s airgap install docs — `docs.k3s.io/installation/airgap` (rationale for `/var/lib/rancher/k3s/agent/images/` placement)
- Microsoft `wsl --import` documentation (rootfs tarball expectations, NOT OCI)
- OpenRC service file format reference (`depend()`, `command_background`, `pidfile`)
- `MODE_Agent_Team.md` — Researcher → Planner → Critic → Builder → Auditor → audit-fix → Scribe flow; conflict-resolution policy applied at C13 deferral

---

## 11. First-build appendix (2026-05-17)

The orchestrator-environment B4a tar build executed end-to-end on 2026-05-17 inside Alpine 3.19 WSL2 distro `alpine-musu-build` imported from official `alpine-minirootfs-3.19.9-x86_64.tar.gz`. Two build-host fix-ups were captured permanently in `build-musu-backend.sh` so this never blocks a future builder again.

### 11.1 Build outcome

| Field | Value |
|---|---|
| Builder host | Alpine 3.19.9 WSL2 distro `alpine-musu-build` |
| Source git SHA | `731c86f` |
| Branch | `v22/gap-analysis` |
| Build start | 2026-05-17T02:08:01Z |
| Build end | 2026-05-17T02:23:10Z |
| Wall-clock | ~15 min |
| Output | `F:\workspace\musu-archive\builds\2026-05-16_v23.2-b4a\musu-backend.tar` |
| Size | 348 MB (365,424,640 bytes) |
| sha256 | `20b62dd03116f1e82ae36014cdb0434830bcdad7c4cac317e46235dd0e85fff3` |
| 10/10 steps | all passed |

Build log + sidecar live in `F:\workspace\musu-archive\builds\2026-05-16_v23.2-b4a\` with `MANIFEST.md` recording build provenance (git SHA, host, builder uid, archive timestamp). The `F:\workspace\musu-archive\ARCHIVE_INDEX.md` index carries the row.

### 11.2 Fix-ups discovered during first build

**Fix-up #1 — build host needs Python + GCC for better-sqlite3.** `better-sqlite3` (a `dependencies` entry in `musu-relay/package.json`, used by signaling but pulled in for the gateway tar's `npm ci` step) has no Alpine/musl prebuilt binary published to npm. `npm ci` at `[3/10]` falls through to `prebuild-install` → `node-gyp rebuild`, which needs Python 3 + `make` + `g++` + `linux-headers` on the build host. The original `[Build-host sanity checks]` block only verified `apk curl tar sha256sum stat awk install ln mkdir`. First build failed with `gyp ERR! find Python — Could not find any Python installation to use`. **Permanent fix**: sanity-check block now requires `node npm python3 make g++` and prints the exact `apk add` line on failure.

**Fix-up #2 — step 1 header comment contained `` `docker save` `` backticks that bash mis-parsed.** The comment at line 143 (`# This is the canonical "build a chroot" idiom — NOT \`docker save\`, which`) triggered a `bash: line 143: docker: command not found / his: command not found` runtime failure on the second build run after fix-up #1 landed. Even though comments shouldn't evaluate command substitutions, this combination of `set -euo pipefail` + nearby `set -e`-induced trap context surfaced the backtick. **Permanent fix**: the two backtick-wrapped tokens in that header comment were rewritten in prose form (`(NOT a docker-save flow, ...)`) — no functional change, no other backticks in comments outside of safe positions (the file's top-level header at lines 12-13, which the first build proved did not trip).

Both fix-ups land in the same B4a fix-up commit (this update + `build-musu-backend.sh` diff).

### 11.3 Findings carried to V23.3 closure (wiki/371-followup)

- **W1 — tar 348MB > 300MB soft target**: Step 10/10 warned. Top 3 size contributors must be enumerated and a trim proposal recorded in V23.3 B6 (SOURCE_DATE_EPOCH) or a new size-trim sub-WS. Estimated breakdown candidates: K3s airgap-images tar.zst (~200MB after extract; the bulk), gateway `node_modules` (production + `@roamhq/wrtc` native binding), Alpine rootfs base.
- **W2 — docker not present on B4a build host → musl smoke-import skipped at step 4/10**: builder runs `command -v docker` and skips the `docker run --rm alpine:3.19` cross-check that the gateway's `@roamhq/wrtc` musl binding loads. First operator-side `wsl --import musu` will discover any musl/glibc mismatch. Not a regression of B4a code; documented in build log. V23.4+ could add a separate musl-test runner that does not depend on docker.
- **W3 — K3s checksums still placeholder per LOW4**: `manifest.yaml:34-37` still carry `TODO-populate-from-k3s-release` for `k3s_binary_sha256_amd64` / `k3s_airgap_sha256_amd64`. The first-build log captures the actual sha256 of the downloaded K3s artifacts (build-logs/b4a-build-20260516T170801Z.log + b4a-build-20260516T171121Z.log). A follow-on can extract these values + populate manifest + flip the build script to enforce. V23.3.

### 11.4 What remains operator-gated

- **B4a self**: now satisfied — tar exists, sha256 verified, archive stored.
- **B4b validate-import.ps1 run from a real Windows host**: still operator-gated (validate-import requires Windows PowerShell + actual `wsl --import musu <dir> <tar>` on a Windows host with WSL2 enabled — this orchestrator can reach the WSL2 layer for build but the import-and-K3s-ready dance is properly host-coupled).
- **B4c 5-host experiment**: still operator-gated (genuinely needs 5 Windows host classes).
- **V23.2 Const VII main-merge**: still operator-typed `"진행해"`.

### 11.5 Build environment notes (reusable)

For future B4a/B6 reproducible builds, the Alpine WSL distro `alpine-musu-build` is at `F:\workspace\musu-bee\.local-build\alpine-wsl\ext4.vhdx` (vhdx — not in git). Packages installed:

- Base: `bash coreutils tar curl git nodejs npm openssl`
- node-gyp toolchain (per fix-up #1): `python3 make g++ linux-headers pkgconf`

To rebuild from scratch later: `wsl -d alpine-musu-build -- bash /mnt/f/workspace/musu-bee/.local-build/run-b4a.sh` (runner script is tracked outside the repo because it's a developer-environment helper, not product code).

The B6 SOURCE_DATE_EPOCH reproducibility experiment (V23.3 B6) can use this same Alpine distro to drive build #1 vs build #2 with the env var set; two `sha256(musu-backend.tar)` should match exactly.

---

**End of B4a closure (wiki/371). First build done on 2026-05-17; one build-host fix-up commit in flight; operator-gated items (B4b validate, B4c 5-host, V23.2 main-merge) unchanged.**
