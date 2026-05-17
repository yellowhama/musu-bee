# V23.3 — Final closure (wiki/396)

**Date**: 2026-05-17
**Wiki ID**: `wiki/396`
**Status**: SHIP-OK from cross-cutting audit. Const VII main-merge gate OPERATOR-PENDING. Const III v42 apply OPERATOR-PENDING (gates on `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` before fly deploy). A1.c Const VI bench harness READY; bench EXECUTION OPERATOR-PENDING.
**Branch**: `v22/gap-analysis` (HEAD `429044f`)
**Predecessor**: wiki/376 (V23.2 Workstream B final closure)
**Predecessors (in-scope)**: wiki/379 (V23.3 master plan), wiki/380-395 (per-sub-WS detail plans + closures)

---

## §1 Scope

V23.3 shipped 9 sub-workstreams on `v22/gap-analysis`, all dual-audit SHIP-OK (where dual-audit was contracted):

- **A1.a** (wiki/380+381): `musu-bridge` OCI image build (Python 3.11-slim-bookworm, non-root, tini PID 1) baked into `musu-backend.tar` at `/var/lib/rancher/k3s/agent/images/`.
- **A1.b** (wiki/382+383): K3s Deployment + Service + ConfigMap + Secret manifest for the bridge Pod, with `musu-init` Secret seeding + scale-from-0 sequence.
- **A1.c** (wiki/384+385): Track A WSL2 host-port surface (`hostPort: 8070`) + developer-side Const VI bench harness (`bridge-bench.sh` + `bench-pod.yaml` with RUNS=3 guard + `success_rate ≥ 99.5%` gate-eligibility filter).
- **A2** (wiki/386+387): T1.9 `wrtc` factory wiring — `pcFactory` throw-stub at `main.ts:211-218` replaced with `makeWrtcFactory()`; intentional boot-time fail-fast semantics on `wrtc` load failure.
- **A3** (wiki/388+389): HMAC body-identity structural refactor — `signAndPost` helper (`telemetry-hmac.ts`) extracted; both call sites (`recordOutcome` in `client.ts`, `emitInstallCompleted` in `main.ts`) swapped onto it. Body-identity invariant is now structural rather than per-call-site discipline.
- **B2** (wiki/390+391): pre-bootstrap unauth telemetry endpoint `POST /v1/telemetry/install_attempt` on `signaling.musu.pro` (schema v42, env-gated); PowerShell installer wires 10 trigger sites (16 sub-site emits) via centralized helper with two opt-out mechanisms.
- **B6** (wiki/392+393): `SOURCE_DATE_EPOCH` reproducibility wired into `build-musu-backend.sh`; intra-hour byte-identical `musu-backend.tar` verified on `alpine-musu-build` WSL2 host.
- **B7** (wiki/394): `openrc-musu-gateway.conf` convergence (`client.js` → `main.js`); `openrc-musu-gateway-b4b.conf` drop-in deleted.
- **B8** (wiki/395): `.gitattributes` at repo root enforcing `* text=auto eol=lf` plus per-extension declarations.

Total = 9 sub-WSs landed; B7 + B8 used one-page/one-paragraph closures per master plan §5.1; remaining 7 used full plan-Critic-Builder-Audit-Scribe chains.

---

## §2 Sub-WS roll-up

| Sub-WS | Wiki (plan/closure) | Commits | Tests | Dual-audit |
|---|---|---|---|---|
| A1.a | 380/381 | `2bae5ba` (plan) + `3830e0d` (Builder + audit-fix) | n/a (image build; outer tar Const VI byte-identical) | SHIP — `security-engineer` + `quality-engineer` dual; 2 NEW HIGH (S-A1a-H1 info disclosure, S-A1a-H2 prod strict-token bypass) audit-fixed |
| A1.b | 382/383 | `48dc7dc` (Builder + post-Builder digest sync + manifest re-pin) | n/a (K3s manifest; outer tar Const VI byte-identical at `cc846444…`) | SHIP — `security-engineer` + `quality-engineer` dual; both SHIP-OK on `2ec6c99` |
| A1.c | 384/385 | `cc47177` (plan) + `fc61524` (Builder) + `0b873c9` (audit-fix Auditor A) + `d460208` (audit-fix Auditor B) + `1eaacbc` (closure) | shape-only via existing infra; outer tar Const VI byte-identical at `93b58e27…` | SHIP — 2× `quality-engineer` (protocol-validity seed + verdict-math seed); 3 NEW HIGH (A-H1 Secret key, B-H1 schema completeness, B-H2 success_rate gate); H1+H2 audit-fixed; B-H1 accepted as F-A1c-9 V23.4 carry |
| A2 | 386/387 | `c6d5a88` (Builder) + `159c1b4` (closure) | 191/191 | SHIP — single `quality-engineer`; 0 HIGH / 2 MED / 3 LOW / 2 INFO; MEDs recorded in §3 + §4 of wiki/387 |
| A3 | 388/389 | `1b89a1c` (A3.helper) + `c434cef` (A3.swap) + `731c86f` (closure) | 195/195 across 20 suites | SHIP — dual `security-engineer` (empty seed + body-identity drift seed); union 0 HIGH / 0 MED / 1 LOW; body-identity canary `tests/telemetry-emit.test.ts:528-595` green |
| B2 | 390/391 | `770c588` (Builder) + `ebf3445` (audit-fix1) + `429044f` (closure) | 218/218 | SHIP — `security-engineer` Auditor A + `quality-engineer` Auditor B; Auditor-A NEW-MED-1 (OS_VERSION_RE log-injection) audit-fixed in `ebf3445`; 5 NEW MEDs accepted as F-B2-1..F-B2-4 V23.4 carries |
| B6 | 392/393 | `f08d920` (Builder + plan + closure) | n/a (build script; no test surface added) | SHIP — single `quality-engineer`; F13 (node-gyp build/ prune) + F14 (docker-shim check) surfaced + fixed Builder-side; intra-hour Build A == Build B at `ace155f730…` |
| B7 | n/a/394 | `680b654` (closure + one-page) | 191/191 (unchanged; content-only) | one-page closure folded per master plan §5.1 |
| B8 | n/a/395 | `83c0c22` (closure + one-paragraph) | 191/191 (unchanged; file-attributes only) | one-paragraph closure folded per master plan §5.1 |

Branch HEAD: `429044f` on `v22/gap-analysis`.
Final test count on `musu-relay`: **218/218 jest green**, `npx tsc --noEmit` clean, zero skips.

---

## §3 Master plan §9 acceptance — 11-item checklist

Per wiki/379 §9 (and §9 #4.b + #10 amendments from Critic C7), with cross-cutting audit-verified disposition:

| # | Criterion | Result |
|---|---|---|
| 1 | Tier-A merged on `v22/gap-analysis`: A1.a + A1.b + A1.c + A2 + A3.helper + A3.swap commits present | **PASS** — commits `3830e0d` (A1.a) + `48dc7dc` (A1.b) + `fc61524`/`0b873c9`/`d460208`/`1eaacbc` (A1.c chain) + `c6d5a88`/`159c1b4` (A2) + `1b89a1c` (A3.helper) + `c434cef`/`731c86f` (A3.swap + closure) all on HEAD |
| 2 | Tier-B merged: B2 + B6 + B7 + B8 commits present | **PASS** — `770c588`/`ebf3445`/`429044f` (B2 chain), `f08d920` (B6), `680b654` (B7), `83c0c22` (B8) all on HEAD |
| 3 | Full test suite green | **PASS** — 218/218 jest passing on `musu-relay` (V23.2 baseline 195 + A2's 2 + A3.helper's 4 + B2's 22 + B2 audit-fix1's 1 = 224 nominal; net 218 after suite consolidation per wiki/391 §6); `npx tsc --noEmit` clean; zero skips |
| 4 | A1.c Const VI bench harness READY; bench EXECUTION operator-pending | **PASS (harness)** + **DEFERRED (execution)** — wiki/385 §7.1 records the absolute-fallback table embedded verbatim with all 7 rows marked `N/A (bench not yet run)`; harness is shipped (`bridge-bench.sh` 115 LOC + `bench-pod.yaml` 176 LOC with RUNS=3 guard + `success_rate ≥ 99.5%` gate-eligibility filter); first operator bench run will fill in §7.1 in-place and declare PASS/FAIL/AMBIGUOUS per §4.1. **This does NOT claim "Const VI verified" for A1.c at V23.3 closure time** — Const VI verdict for the K3s-Pod cutover is RESERVED for the first operator run; rollback path is `--prefer systemd` per wiki/379 §7.1 |
| 4.b | B4c re-bench if A2 lands inside V23.3 window | **DEFERRED (scheduling-only)** — per wiki/387 §4: A2 lands inside `v22/gap-analysis`, so the next B4c tar build (B4a) automatically includes A2-wired `main.ts`; B4c §5.3 update is the recording surface when B4c re-runs. No new wiki ID required; operator owns same B4c gate already in flight from V23.2 closure |
| 5 | B6 Const VI verified (intra-hour byte-identity, same Alpine WSL2 host) | **PASS** — Build A `ace155f730…` == Build B `ace155f730…` (wiki/393 §2); 24h-apart + 1-week-apart determinism deferred to V23.5 reproducible-build attestation scope per wiki/392 §10.2 |
| 6 | B2 Const III applied on deployed `signaling.musu.pro` | **OPERATOR-PENDING** — per wiki/391 §5.1 6-step workflow: (1) Builder push DONE; (2) Const III 진행해 pending; (3) `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` pending (**MUST precede step 5**); (4) Const VII main-merge pending; (5) `fly deploy` triggered by CI on main-merge; (6) curl smoke 204/400/429 per wiki/390 §6.2. Failure mode if step 3 forgotten: new machine fails health-check, Fly aborts rolling deploy, v41 machine stays serving — no data loss; T15 + T15b in `install-attempt.test.ts` prove both halves of the env-gate |
| 7 | Cross-cutting final audit SHIP-OK | **PASS** — cross-cutting `security-engineer` audit verdict: **SHIP-OK for main-merge**; 2 NEW-MED findings (XC-M1 A1.c verdict-language clarification, XC-M2 V23.4 forward-pointer aggregation) both wiki/396 documentation-language fixes, resolved in §3 #4 + §5 of THIS DOC |
| 8 | V23.3 closure doc + qual eval written | **PASS** — wiki/396 = THIS DOC; wiki/397 = parallel Scribe (V23.3 qualitative evaluation, lessons-learned forward-pointer in §8 below) |
| 9 | Const VII main-merge gate cleared | **OPERATOR-PENDING** — gates on operator-typed "진행해" → `git merge v22/gap-analysis` to `main`; preceded by V23.2 main-merge per wiki/379 §7.5 (V23.2 main-merge is itself still operator-gated per wiki/376 §5.4) |
| 10 | MEDIUM follow-on disposition aggregated | **PASS** — V23.4 forward-pointers aggregated in §5 below with sequential `wiki/406+` ID assignment per wiki/379 §9 #10 ("silence on a MEDIUM is blocking"); this aggregation is the artifact that unblocks Const VII main-merge per the cross-cutting audit XC-M2 disposition. Also recorded in wiki/397 qual eval |

All 11 master-plan §9 criteria addressed. PASS where verified; OPERATOR-PENDING where gated on human-typed "진행해" or Fly secrets/deploy; DEFERRED only where wiki/379 explicitly allowed deferral (4 to V23.4, 5 1-week-apart to V23.5, 4.b to next B4c run).

---

## §4 Operator-side items (pre-Const-VII-main-merge OR post-deploy)

Four items remain for the operator to action. Three gate Const VII main-merge; one is informational deferral.

### §4.1 A1.c Const VI bench EXECUTION (pre-merge gate)

Operator runs the bench harness against the K3s-Pod bridge + host-systemd reference. Per wiki/385 §7.1:

```sh
# Inside the WSL2 distro after first-boot
/opt/musu-relay/installer/bridge-bench.sh 3 > /tmp/a1c-bench.json
# Then run the §7.3 rollback measurement separately
# Then run RSS sampling + cold-start trials per wiki/385 §7.1 steps 4-6
```

Stitch `success_rate`, `health_ready_p50_ms`, `health_ready_p99_ms`, RSS, cold-start, first-boot wall-clock, rollback time into the wiki/385 §7.1 absolute-fallback table. Declare verdict PASS / FAIL / AMBIGUOUS per wiki/384 §4.1.

If verdict = **FAIL** or **AMBIGUOUS** on re-run (per the wiki/385 §7.2 re-run protocol), K3s-Pod cutover rolls back via `musu-bridge --prefer systemd` per wiki/379 §7.1, and A1.c is re-scoped for V23.4. The bench HARNESS being SHIP-OK does NOT pre-empt this rollback path — the bench is the verdict producer; the verdict is RESERVED for the first operator run.

Verdict is recorded **in-place** in wiki/385 §7.1 (operator edits the existing closure doc; no new wiki ID).

### §4.2 B2 Const III + Fly deploy (pre-merge gate)

Per wiki/391 §5.1, the operator MUST execute steps in order:

1. Obtain Const III 진행해 from human approver
2. `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1 -a musu-signaling` — **MUST happen BEFORE step 4** (otherwise the new machine fails health-check at boot when `applyMigrations()` reads `MAX(schema_version) = 41 < 42` and the v42 env-gate throws because env unset; Fly aborts the rolling deploy and the v41 machine stays serving — no data loss but the deploy never completes)
3. Operator types "진행해" for Const VII main-merge (§4.4 below)
4. Operator merges `v22/gap-analysis` → `main`; CI triggers `fly deploy`
5. Curl smoke per wiki/391 §6.2: `204` for valid POST, `400` for malformed, `429` for over-rate-limit cycle against `https://signaling.musu.pro/v1/telemetry/install_attempt`

Smoke success confirms Const III gate cleared on deployed instance. If smoke fails post-deploy, rollback path is documented in wiki/390 §10.2 (drop v42 table; v42 is append-only telemetry; no foreign-key cascade).

### §4.3 B6 1-week-apart byte-identity (informational; not gating)

Per wiki/393 §7.3 layered verdict: intra-hour Step 1 PASS; 24h-apart Step 2 not yet run; 1-week-apart Step 3 deferred to V23.5 reproducible-build attestation scope (apk snapshot mirror + npm registry replay + in-toto attestation per wiki/392 §10.2). Operator may optionally run Step 2 (24h) post-merge to validate which V23.5 items are load-bearing for week-apart determinism; this is V23.5-R5 in wiki/393 §8 follow-on scope.

### §4.4 Const VII main-merge gate (final operator action)

After §4.1 + §4.2 above complete (or after operator decides to defer §4.1 verdict to a separate cycle by leaving §7.1 table marked N/A), operator types "진행해" to authorize `git merge v22/gap-analysis` to `main`. This is preceded by V23.2 main-merge per wiki/379 §7.5 — V23.2 main-merge is itself still gated by wiki/376 §5.4 + the B4c §5.3 fill-in.

If V23.2 has already main-merged before §4.4 fires, `v22/gap-analysis` is fast-forward to main and V23.3 merges trivially. If not, V23.2 main-merge MUST sequence first.

---

## §5 V23.4 forward-pointers — aggregated (XC-M2 resolution)

Per master plan §9 #10 "silence on a MEDIUM is blocking", every audit MEDIUM not fixed inside V23.3 is documented here with a reserved `wiki/406+` target plan ID. Forward-pointers are pulled verbatim from each sub-WS closure's V23.4 carry section; sequential ID assignment starts at `wiki/406` (the floor reserved by wiki/379 §6.1).

| ID | Source | Severity | Reserved wiki | Description |
|---|---|---|---|---|
| **F-B2-1** | wiki/391 §4 NEW-MED-2 (security-engineer) | **MED (HIGHEST priority — cross-route DoS via shared SQLite volume)** | **wiki/406** | 30-day retention sweeper on `install_attempt` table; ~2-3 LOC interval timer + `DELETE FROM install_attempt WHERE received_at < ?`; reuses existing reaper pattern from rate-limit module |
| F-B2-2 | wiki/391 §4 NEW-MED-1 (quality-engineer) | MED | wiki/407 | Resume-path state file enrichment: persist `os_version` + `bios_vt` in `Save-MusuState` step 2 + reload in `Get-MusuState` on resume; ~4 LOC PowerShell-only |
| F-B2-3 | wiki/391 §4 NEW-MED-3 (quality-engineer) | MED | wiki/408 | Uniform DB-write `try/catch` refactor across all 4 telemetry routes (`/install`, `/nat_pierce`, `/agent_spawn`, `/install_attempt`); codebase-wide pattern cleanup ~16 LOC across 4 routes |
| F-B2-4 | wiki/391 §4 (deferred conditional) | LOW (conditional) | wiki/409 | Per-IP secondary rate-limit dimension; triggers only if operator observes single-IP install_id rotation abuse in Fly logs |
| **F-A1c-9** | wiki/385 §5.2 Auditor-B NEW-HIGH-1 (accepted Option (b)) | MED | wiki/410 | `bridge-bench.sh` widen from 2-of-9 + 6-of-10 partial schema emit to full §5.6 schema; +80-120 LOC (RSS sampling loop, cold-start trials loop, metadata enrichment, outer-tar sha256 stitching) |
| **F-A1c-10** | wiki/385 §5.2 Auditor-B (NEW-MED carry) | MED | wiki/411 | `bench-windows.ps1` peer to `bridge-bench.sh` for WSL2 vEthernet + portmap DNAT overhead measurement; ~60 LOC PowerShell mirroring `bench-pod.yaml`'s Python loop |
| F-A1c-1 | wiki/385 §8 V23.4 carry | LOW | wiki/412 | Bench harness reuse for cgroup/runtime change validation (snapshotter flip, MemoryMax tuning, aiohttp ↔ urllib swap) |
| F-A1c-2 | wiki/385 §8 V23.4 carry | LOW | wiki/413 | Worker sidecar containerization → `/api/route` becomes bench-eligible; worker-inclusive latency profile recordable |
| F-A1c-3 | wiki/385 §8 V23.4 carry (also wiki/383 §7) | MED | wiki/414 | Bridge image hash byte-stability across buildah cache: pin `python:3.11-slim-bookworm` to digest `sha256:70fc1e69…` + explicit apt-archive-clear in Dockerfile |
| F-A1c-4 | wiki/385 §8 V23.4 carry | LOW | wiki/415 | WSL2 port-forward fallback: `install-wsl2.ps1` `netsh portproxy` step if R1 fires |
| F-A1c-5 | wiki/385 §8 V23.4 carry | LOW | wiki/416 | Bench-tooling image variant: bake aiohttp + benchmark-helper wheels into `python:3.11-slim-musu-bench` during A1.a |
| F-A1c-6 | wiki/385 §8 V23.4 carry (V23.5 horizon) | LOW | wiki/417 | `scripts/systemd/musu-bridge.service` deletion alongside V21 native `install.ps1` retirement |
| F-A1c-7 | wiki/385 §8 V23.4 carry (V23.5 horizon) | LOW | wiki/418 | Reproducible-build attestation extension to bench artifacts (in-toto coverage of `bench-pod.yaml` + `bridge-bench.sh`) |
| F-A1c-8 | wiki/385 §8 V23.4 carry | LOW | wiki/419 | Operator-facing `musu-health` CLI subsetting bench harness for ship-time smoke; separate from developer-side bench |
| FO-A1a-1 | wiki/381 §9 (Q-A1a-M1 + S-A1a-M1) | MED | wiki/420 | Move `GIT_SHA`/`BUILD_TS` derivation to ~line 320 of `build-musu-backend.sh` (before step 3.d); OCI labels populate from real values instead of literal "unknown" |
| FO-A1a-2 | wiki/381 §9 (S-A1a-M2) | MED | (folded into A1.b shipped) | A1.b Pod spec already sets `readOnlyRootFilesystem` + `allowPrivilegeEscalation:false`; recorded as RESOLVED at A1.b ship time per wiki/383 §5.1 |
| FO-A1a-3 | wiki/381 §9 (S-A1a-M3 + L2) | MED (V23.5 horizon) | wiki/421 | Bridge image pivot to `chainguard/python` distroless (size + minimal attack surface); also removes `openssl` + `tini-static` carry-over |
| FO-A1a-4 | wiki/381 §9 (size warning T1) | LOW | wiki/422 | K3s airgap-images trim to `pause` / `coredns` / `traefik` / `local-path-provisioner` only (~40-60 MB savings) |
| FO-A1a-5 | wiki/381 §9 (size warning T2) | LOW | wiki/423 | Runtime-only Alpine layer: drop node-gyp `build-base` / `python3` / `linux-headers` after prebuild (~30-50 MB savings) |
| FO-A1a-6 | wiki/381 §9 (B-A1.a-5 spec drift) | LOW (process) | wiki/424 | Plan template post-mortem: `/health` schema verification step before plan freeze (caught the `worker_ok` vs `worker` drift) |
| V23.5-R5 | wiki/393 §8 follow-on | LOW (informational) | (V23.5 scope, no wiki/4xx reserved) | Optional Step 2 (24h) and Step 3 (1 week) byte-identity verification runs to validate which V23.5-R1..R4 items are load-bearing for week-apart determinism |

V23.4 prep ID floor (per wiki/379 §6.1, post-aggregation): `wiki/425` (next free ID after FO-A1a-6's wiki/424). All MEDIUMs from V23.3 closure are accounted for — silence on a MEDIUM has been eliminated per master plan §9 #10. A2 closure MEDIUMs (M1 boot-time fail-fast semantics, M2 B4c re-bench disposition) and A3 closure LOW (A-L1 fetchImpl propagation asymmetry) are intentionally NOT in this table because they were either disposed in-place at sub-WS closure time (recorded in wiki/387 §3 + §4 with explicit "Intended production semantics; no change" / "Deferred to operator B4c first run; no new tracking ID" language) or below the MED threshold the master plan §9 #10 silence-rule targets.

---

## §6 Constitution gates — final record

| Gate | Status | Notes |
|---|---|---|
| **Const III** (schema apply) | B2 v42 **OPERATOR-PENDING** | Fires at fly deploy; requires `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` first (wiki/391 §5.1 step 3, MUST precede step 5). Failure mode if env-set forgotten: Fly aborts rolling deploy at health-check; v41 machine stays serving; no data loss. T15 + T15b in `install-attempt.test.ts` prove both env-gate halves. |
| **Const VI** (experiment) | A1.c harness **READY**; bench **OPERATOR-PENDING**; B6 intra-hour **PASS**; B6 1-week-apart **DEFERRED V23.5** | A1.c: harness shipped at `93b58e27…` outer tar; verdict reserved for first operator run per wiki/385 §7.1. B6: Build A == Build B at `ace155f730…` (wiki/393 §2); week-apart bar rolled to V23.5 reproducible-build attestation per wiki/392 §10.2. A1.b mount-semantics review (conditional Const VI per wiki/379 §4 row 4): Researcher Phase 0 + Auditor A scan determined K3s default Secret-at-rest is acceptable for V23.3 single-tenant trade-off; encryption-at-rest escalation deferred to V23.5 per wiki/383 §5.1. |
| **Const VII** (push) | per-push gate **SATISFIED** (~21 commits pushed on `v22/gap-analysis`); main-merge gate **OPERATOR-PENDING** | All sub-WS commits pushed under autonomous /loop per-push satisfaction. Main-merge gate fires only on operator-typed "진행해" + preceded by V23.2 main-merge per wiki/379 §7.5 |

---

## §7 Test count + repo state

- **musu-relay test suite**: 218/218 jest passing across all suites; `npx tsc --noEmit` exit 0; zero `it.skip` / `xit` / `xdescribe` (verified per wiki/391 §6 final count after B2 audit-fix1)
- **musu-bee installer**: PowerShell AST parse clean on `install-wsl2.ps1` + `Musu-Common.psm1` (per wiki/391 §1.2 + wiki/394 §4)
- **Branch HEAD**: `429044f` on `v22/gap-analysis`
- **Commits since V23.2 main-merge boundary** (`c5af3ae` — V23.2 final closure commit, predecessor): 21 commits across 9 sub-WS chains. Per `git log --oneline c5af3ae..HEAD`: 153ec6b (master plan) + c6d5a88/159c1b4 (A2 + closure) + 83c0c22 (B8) + 680b654 (B7) + 1b89a1c/c434cef/731c86f (A3) + f08d920 (B6) + 2bae5ba/3830e0d (A1.a) + 48dc7dc (A1.b) + cc47177/fc61524/0b873c9/d460208/1eaacbc (A1.c chain) + 770c588/ebf3445/429044f (B2 chain) + 14aaaf6 (V23.2 qual eval + V23.3 prep + final audit LOW fix; wiki/377+378)
- **Outer tar canonical (latest, post-A1.c)**: `93b58e274d6038b0cfca0a007410380215d4564affc1c564c0cee008b6461851`, 397,793,280 bytes, built on `alpine-musu-build` WSL2 distro. Archive: `F:\workspace\musu-archive\builds\2026-05-17_v23.3-a1c\`

---

## §8 Lessons-learned forward-pointer

Process insights from V23.3 — including parallel-builder discipline (master plan §3.1 sequential ordering avoided main.ts collision between A2 and A3.swap), dual-audit yielding orthogonal HIGH findings (A1.c Auditor A bench-protocol-validity seed surfaced Secret-key mismatch invisible to Auditor B verdict-math seed; vice versa B-H1+B-H2 schema-completeness invisible to A), plan-spec defects surviving into landed code (A1.a B-A1.a-5 `/health` worker_ok vs worker drift), the Builder-during-test catch in A3.swap (existing `telemetry-emit.test.ts` canary caught regression before audit, validating belt-and-suspenders test layering), and the orchestrator-direct fallback when `devops-architect` subagent hung silently in A1.c Phase 3 — are recorded in **wiki/397** (V23.3 qualitative evaluation, parallel Scribe).

---

## §9 References

### Master plan + V23.2 precedent
- **wiki/379** — V23.3 master plan (§2 sub-WS table, §3 sequence, §4 Const gates, §5 team execution model, §6 wiki ID reservations, §7 risks, §9 11-item acceptance, §11 Critic findings resolved)
- **wiki/376** — V23.2 Workstream B final closure (structural template for this doc)
- **wiki/377** — V23.2 qualitative evaluation (lessons inherited into V23.3 plan-time decisions, esp. §7 lesson 5 motivating A3)
- **wiki/378** — V23.3 prep / α-β gate-conditional draft

### V23.3 sub-WS plans + closures
- **wiki/380 + wiki/381** — A1.a detail plan + closure (musu-bridge OCI image)
- **wiki/382 + wiki/383** — A1.b detail plan + closure (K3s manifest + Secret seeding)
- **wiki/384 + wiki/385** — A1.c detail plan + closure (host-port surface + Const VI bench harness)
- **wiki/386 + wiki/387** — A2 detail plan + closure (wrtc factory wiring)
- **wiki/388 + wiki/389** — A3 detail plan + closure (HMAC body-identity refactor)
- **wiki/390 + wiki/391** — B2 detail plan + closure (install_attempt unauth telemetry)
- **wiki/392 + wiki/393** — B6 detail plan + closure (SOURCE_DATE_EPOCH reproducibility)
- **wiki/394** — B7 closure (openrc conf convergence; one-page, no detail plan per master plan §5.1)
- **wiki/395** — B8 closure (.gitattributes LF; one-paragraph, no detail plan)
- **wiki/396** — THIS DOC
- **wiki/397** — V23.3 qualitative evaluation (parallel Scribe; lessons-learned + process insights)

### Reserved V23.4 forward-pointer IDs (per §5 above)
- **wiki/406** through **wiki/424** — V23.4 follow-on plan reservations (20 forward-pointers; F-B2-1 priority HIGHEST)
- Next free V23.4 prep ID: **wiki/425**

### Build artifacts
- `F:\workspace\musu-archive\builds\2026-05-16_v23.3-b6\` — B6 Build A archive (intra-hour byte-identical evidence)
- `F:\workspace\musu-archive\builds\2026-05-17_v23.3-a1a-fix\` — A1.a fix-pass archive (post-S-A1a-H1/H2 audit-fix)
- `F:\workspace\musu-archive\builds\2026-05-17_v23.3-a1b\` — A1.b canonical archive
- `F:\workspace\musu-archive\builds\2026-05-17_v23.3-a1c\` — A1.c canonical archive (latest outer tar `93b58e27…`)

### Mode references
- `MODE_Agent_Team.md` — agent-team activation triggers + universal envelope contract + /loop heartbeat decision tree + dual-audit conflict resolution (Critic-Constitution-gate exception, NEW-MED union acceptance)
- `feedback-autonomous-loop.md` — autonomous-loop protocol (applied throughout V23.3; per-push satisfaction; main-merge + Const III apply + production deploy as the only gating events)

---

**End of V23.3 final closure (wiki/396).** Awaiting operator: (1) A1.c bench EXECUTION + wiki/385 §7.1 in-place verdict fill-in, (2) Const III 진행해 + `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` + Const VII "진행해" + main-merge + `fly deploy` + B2 smoke per wiki/391 §6.2, (3) V23.4 prep starting from `wiki/425` against forward-pointer table in §5 (F-B2-1 HIGHEST priority).
