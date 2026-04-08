# Paperclip Blocked/High 7 — Unblock Pack (2026-04-09 KST)

This document repackages the **top 7 blocked/high (incl. critical)** Paperclip issues into a consistent unblock format:
**(1) 1–2 decisions → (2) deploy/env checklist → (3) verification commands**.

Scope note:
- This pack is written so **the CEO does not have to personally execute**. Any “board action” is converted into a *delegable operator checklist*.
- Keep org size ≤10: current roster is 5 agents (CEO/CTO/CoS/FE/QA).

Company (Paperclip local board)
- API: `http://127.0.0.1:3100/api`
- companyId: `f27a9bd2-688a-450b-98b4-f63d24b0ab50`

## Snapshot (source of truth)

Commands used:
- `curl -sS http://127.0.0.1:3100/api/health`
- `curl -sS "http://127.0.0.1:3100/api/companies/$CID/agents" | jq`
- `curl -sS "http://127.0.0.1:3100/api/companies/$CID/issues?status=blocked" | jq`

Top 7 (blocked/high) as-of 2026-04-09:
1. `d30c7dd6-afb2-4180-857c-787e7603005e` (critical) BOARD-ACTION: Deploy proof + Local Worker recovery coordination
2. `f2256fab-82bf-4e3d-8528-7adfd64ce461` (high) Run linkage integrity hardening (executionRunId ↔ heartbeat_run.issueId)
3. `f98b1b21-2b55-438d-9cb5-e5825921682c` (critical) BOARD-ACTION: Paddle credentials + 5070Ti SSH access
4. `cd58ca32-2d4b-4322-b326-35e29e4b390b` (high) Paddle production-readiness gate + rollback signoff
5. `f5534b89-6dfc-4e94-a9ab-63d7a4a1c502` (high) BOARD-ACTION: run-linkage repair execution (unblock MUS-1131)
6. `8d2fe85d-55ba-4025-a7d7-677077b71968` (high) QA: Post-repair run-linkage coherence verification (G2)
7. `3a14e790-7066-47d1-9ad8-f54f847781ef` (critical) BOARD-INPUT: 5070Ti SSH authorization or manual status proof

## Master Resume Order (minimal critical path)

1) **SSH/manual status proof (5070Ti)** → unblocks multi-machine lanes.
2) **Credential injection evidence (Paddle sandbox)** → unblocks QA intake → CTO gate.
3) **Run-linkage repair (board-privileged)** → **QA G2** → close run-linkage integrity lane.
4) Then resume downstream implementation work (deployment, E2E routing, payment flow).

## Pack Format (copy/paste template)

Each issue below is written as:
- **Decisions (pick 1–2)**: A/B options. Make an explicit choice.
- **Deploy / Env Checklist**: step-by-step, no guessing.
- **Verification Commands**: commands + required outputs (attach evidence).

---

# 1) MUS-1016 Umbrella — Deploy proof + Local Worker recovery coordination

Issue: `d30c7dd6-afb2-4180-857c-787e7603005e`

## Decisions (pick 1–2)
1. **Owner decision:** keep this as *CoS-owned umbrella* (recommended) vs move to CEO.
2. **Evidence decision:** accept “manual proof” for remote status (allowed) vs require SSH proof only.

## Deploy / Env Checklist
- [ ] Confirm Paperclip API is healthy: `/api/health` returns JSON `status=ok`.
- [ ] Confirm agent roster has no `error` agents (or explicitly note which ones are error).
- [ ] Confirm the two board-input children for Paddle/SSH are still the only hard blockers.
- [ ] If local “proof” is required: ensure local `musu-portd` health endpoint is reachable (if running).

## Verification Commands
```bash
curl -sS http://127.0.0.1:3100/api/health | jq
CID=f27a9bd2-688a-450b-98b4-f63d24b0ab50
curl -sS "http://127.0.0.1:3100/api/companies/$CID/agents" | jq -r '.[] | [.name,.status,.adapterType] | @tsv'
curl -sS "http://127.0.0.1:3100/api/companies/$CID/issues?status=blocked" | jq -r '.[] | [.priority,.title] | @tsv'
curl -sf http://127.0.0.1:1355/health || true
```

Exit criteria:
- Umbrella issue points at **exact** next two board-input actions (Paddle creds + 5070Ti proof), with evidence requirements.

---

# 2) Run-linkage integrity hardening (executionRunId ↔ heartbeat_run.issueId)

Issue: `f2256fab-82bf-4e3d-8528-7adfd64ce461` (project: `musu_corp control plane`)

## Decisions (pick 1–2)
1. **Enforcement location:** DB-level invariant (preferred if feasible) vs application-layer guard only.
2. **Repair method:** one-off repair script (preferred) vs manual SQL ops.

## Deploy / Env Checklist
- [ ] Identify the live DB / state source used by `musu_corp` audit scripts (don’t guess).
- [ ] Prepare an immutable “before” artifact (JSON report) and store the path in the issue comment.
- [ ] If applying a migration/repair: take a DB backup (copy file) and record the backup path.

## Verification Commands
```bash
# Baseline mismatch reproduction (example referenced in the issue)
curl -sS http://127.0.0.1:3100/api/issues/MUS-1083 || true

# Post-fix audit commands (from QA plan; paths must exist on this machine)
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_state_audit.py --json --source-mode live
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run
```

Exit criteria:
- New mismatched linkage writes are fail-closed (rejected) with an explicit error.
- Repair path produces a deterministic repaired-rows report (before/after IDs).
- Regression test coverage exists for the write path that previously drifted.

---

# 3) BOARD-ACTION: Paddle credentials + 5070Ti SSH access

Issue: `f98b1b21-2b55-438d-9cb5-e5825921682c`

## Decisions (pick 1–2)
1. **Payment path:** proceed with Paddle sandbox now (recommended to unblock) vs switch provider (creates new lane).
2. **Remote access path:** SSH authorization vs manual status proof (both acceptable to unblock).

## Deploy / Env Checklist
Paddle sandbox credential injection (minimum set):
- [ ] `PADDLE_API_KEY`
- [ ] `PADDLE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- [ ] `NEXT_PUBLIC_PADDLE_ENV=sandbox`

5070Ti access (pick one):
- [ ] Add trusted public key to 5070Ti `~/.ssh/authorized_keys`
- [ ] OR board/operator runs manual proof commands on 5070Ti and posts outputs

## Verification Commands
```bash
# Credential injection evidence (run on the operator machine where secrets are stored)
grep -i PADDLE /mnt/f/Aisaak/Projects/yellow.txt

# 5070Ti access proof (choose one)
ssh <user>@100.121.211.106 'echo OK; hostname; date'
curl -sS http://localhost:23880/status | head -n 60
```

Exit criteria:
- Credential evidence posted (redacted, but proving presence) + 5070Ti proof posted.

---

# 4) CTO Gate: Paddle production-readiness + rollback signoff

Issue: `cd58ca32-2d4b-4322-b326-35e29e4b390b` (project: `musu-functions root`)

## Decisions (pick 1–2)
1. **GO/NO-GO:** Paddle remains the provider for WAVE-I-4 vs pause and switch.
2. **Rollback mechanism:** feature-flag/kill-switch vs “deploy revert” only (feature-flag recommended).

## Deploy / Env Checklist
- [ ] Confirm sandbox end-to-end is passing **before** any production signoff.
- [ ] Define rollback playbook (<15 min): disable checkout, stop webhook processing, freeze tier state writes.
- [ ] Confirm secret handling: do not leak keys into logs, ensure signature verification is fail-closed.

## Verification Commands
```bash
# Minimum: run tests in the payment integration workspace (adjust to actual repo commands)
cd /home/hugh51/musu-functions
npx vitest run || true

# Validate Paperclip issue graph state for dependencies (must be evidence backed)
CID=f27a9bd2-688a-450b-98b4-f63d24b0ab50
curl -sS "http://127.0.0.1:3100/api/companies/$CID/issues?status=blocked,in_progress" | jq -r '.[] | [.priority,.status,.title] | @tsv'
```

Exit criteria:
- CTO posts explicit `G1: PASS` or `G1: FAIL` with command-backed artifacts and rollback plan.

---

# 5) BOARD-ACTION: run-linkage repair execution (unblock MUS-1131)

Issue: `f5534b89-6dfc-4e94-a9ab-63d7a4a1c502`

## Decisions (pick 1–2)
1. **Timing:** execute repair in a quiet window vs immediately (quiet window recommended).
2. **Cancellation policy:** cancel in-flight runs that can mutate linkage vs leave running (cancel recommended).

## Deploy / Env Checklist
- [ ] Verify you have the required access to execute repair (board-privileged).
- [ ] Take a DB/state backup and record path.
- [ ] Run repair first in dry-run mode; only then run the real mutation.
- [ ] Post a single artifact bundle: commands + output files + summary numbers.

## Verification Commands
```bash
# Dry run first (must output what it would change)
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run

# Then apply (ONLY after dry-run looks correct)
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json
```

Exit criteria:
- Repair execution artifact posted; downstream QA gate (issue #6) becomes runnable.

---

# 6) QA Gate (G2): Post-repair run-linkage coherence verification

Issue: `8d2fe85d-55ba-4025-a7d7-677077b71968` (project: `musu_corp control plane`)

## Decisions (pick 1–2)
1. **Verdict:** `G2: PASS` vs `G2: FAIL` — binary only.
2. **Sampling:** full audit run vs bounded sample (full recommended for a repair lane).

## Deploy / Env Checklist
- [ ] Confirm board repair lane posted artifacts (issue #5).
- [ ] Confirm engineering hardening lane posted its invariant statement (issue #2).
- [ ] Run audits from a clean environment; attach JSON outputs (paths).

## Verification Commands
```bash
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_state_audit.py --json --source-mode live
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run
```

Exit criteria:
- QA posts `G2: PASS` or `G2: FAIL` with deterministic command/output bundle.

---

# 7) BOARD-INPUT: 5070Ti SSH authorization or manual status proof

Issue: `3a14e790-7066-47d1-9ad8-f54f847781ef`

## Decisions (pick 1–2)
1. **Access lane:** SSH authorization (preferred) vs manual proof.
2. **Runtime lane:** confirm `musu-portd` is running vs start it (if not running).

## Deploy / Env Checklist
- [ ] Ensure the 5070Ti machine is reachable on Tailscale/WAN as expected.
- [ ] If SSH lane: add trusted pubkey to `authorized_keys`.
- [ ] If manual lane: run status commands on 5070Ti and capture required fields.

## Verification Commands
```bash
# SSH lane (from this machine)
ssh <user>@100.121.211.106 'hostname; date; curl -sS http://localhost:23880/status | head -n 80'

# Manual lane (run on 5070Ti console)
curl -sS http://localhost:23880/status | head -n 120
curl -sf http://127.0.0.1:1355/health || true
```

Exit criteria:
- Proof artifact posted and linked to the dependent lane (MUS-1024 → MUS-995).

