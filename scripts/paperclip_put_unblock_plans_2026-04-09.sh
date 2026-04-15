#!/usr/bin/env bash
set -euo pipefail

API_BASE="${PAPERCLIP_API_BASE:-http://127.0.0.1:3100/api}"

put_plan() {
  local issue_id="$1"
  local body="$2"

  local rev
  rev="$(curl -sS "$API_BASE/issues/$issue_id/documents" | jq -r 'map(select(.key=="plan"))[0].latestRevisionId // ""')"

  local payload
  payload="$(jq -n --arg body "$body" --arg rev "$rev" '{
    title: "Plan",
    format: "markdown",
    body: $body,
    baseRevisionId: (if $rev=="" then null else $rev end)
  }')"

  curl -sS -X PUT -H 'content-type: application/json' \
    -d "$payload" \
    "$API_BASE/issues/$issue_id/documents/plan" \
    | jq -r '"OK plan updated: " + (.latestRevisionId // "")'
}

d30_body="$(cat <<'EOF'
# Unblock Plan — Board Umbrella (MUS-1016)

## Decisions (pick 1–2)
1) **Owner model:** keep as *Chief of Staff-owned umbrella* (recommended) vs CEO-owned.
2) **Proof model:** allow **SSH OR manual proof** for remote machine status (recommended) vs SSH-only.

## Deploy / Env Checklist
- [ ] Confirm Paperclip API health (`/api/health` → `status=ok`).
- [ ] Confirm agent roster has no unacknowledged `error` agents.
- [ ] Confirm the only hard blockers are still the two board-input packets:
  - Paddle credential evidence
  - 5070Ti SSH/manual status proof
- [ ] If “deploy proof” is requested: attach a runnable health proof for the relevant service (local `musu-portd` or remote).

## Verification Commands
```bash
curl -sS http://127.0.0.1:3100/api/health | jq
CID=f27a9bd2-688a-450b-98b4-f63d24b0ab50
curl -sS "http://127.0.0.1:3100/api/companies/$CID/agents" | jq -r ".[] | [.name,.status,.adapterType] | @tsv"
curl -sS "http://127.0.0.1:3100/api/companies/$CID/issues?status=blocked" | jq -r ".[] | [.priority,.title] | @tsv"

# Optional: local portd proof (only if actually running)
curl -sf http://127.0.0.1:1355/health || true
```

## Exit Criteria
- Umbrella issue points at the next exact board-input actions with explicit evidence requirements.

## Delegation
- If CEO can’t do this, assign a single operator (CoS) to keep blocker truth synced.
EOF
)"

f2256_body="$(cat <<'EOF'
# Unblock Plan — Run-linkage integrity hardening

## Decisions (pick 1–2)
1) **Enforcement location:** DB-level invariant (preferred if feasible) vs application-layer guard only.
2) **Repair method:** scripted repair (preferred) vs manual SQL ops.

## Deploy / Env Checklist
- [ ] Identify the live state source used by the audit/repair scripts.
- [ ] Produce immutable before/after artifacts (JSON) and attach paths in comments.
- [ ] Take a DB/state backup before any mutation.

## Verification Commands
```bash
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_state_audit.py --json --source-mode live
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run
```

## Exit Criteria
- Fail-closed guard prevents persisting mismatched run<->issue links.
- Deterministic repair report (before/after IDs) exists.
- Regression coverage exists for the write path that drifted.
EOF
)"

f98_body="$(cat <<'EOF'
# Unblock Plan — Paddle creds + 5070Ti access (delegable board action)

## Decisions (pick 1–2)
1) **Payment path:** proceed with Paddle sandbox now (recommended to unblock) vs switch provider (new lane).
2) **Remote access path:** SSH authorization vs manual status proof (both acceptable for unblock).

## Deploy / Env Checklist
Paddle sandbox credential injection (minimum set):
- [ ] `PADDLE_API_KEY`
- [ ] `PADDLE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- [ ] `NEXT_PUBLIC_PADDLE_ENV=sandbox`

5070Ti access (pick one):
- [ ] Add trusted public key to 5070Ti `~/.ssh/authorized_keys`
- [ ] OR run manual proof commands on 5070Ti and post outputs

## Verification Commands
```bash
# Credential injection evidence (run where secrets are stored)
grep -i PADDLE /mnt/f/Aisaak/Projects/yellow.txt

# 5070Ti proof (choose one)
ssh <user>@100.121.211.106 'echo OK; hostname; date'
curl -sS http://localhost:23880/status | head -n 60
```

## Exit Criteria
- Redacted-but-real credential presence proof is posted.
- 5070Ti proof is posted and linked to dependent lane.
EOF
)"

cd58_body="$(cat <<'EOF'
# Unblock Plan — CTO gate: Paddle production-readiness + rollback

## Decisions (pick 1–2)
1) **GO/NO-GO:** keep Paddle as provider vs pause and switch.
2) **Rollback mechanism:** feature-flag/kill-switch (recommended) vs deploy revert only.

## Deploy / Env Checklist
- [ ] Ensure sandbox E2E proof exists before any production talk.
- [ ] Rollback playbook (<15 min): disable checkout, stop webhook processing, freeze tier writes.
- [ ] Security: signature verification is fail-closed; secrets never logged.

## Verification Commands
```bash
cd /home/hugh51/musu-functions
npx vitest run || true
```

## Exit Criteria
- CTO posts `G1: PASS` or `G1: FAIL` with command-backed artifacts + rollback plan.
EOF
)"

f553_body="$(cat <<'EOF'
# Unblock Plan — Board-privileged run-linkage repair execution

## Decisions (pick 1–2)
1) **Timing:** quiet window (recommended) vs immediate.
2) **Cancellation policy:** cancel in-flight mutating runs (recommended) vs leave running.

## Deploy / Env Checklist
- [ ] Verify board-privileged access is available.
- [ ] Take DB/state backup and record the path.
- [ ] Dry-run first, then apply.
- [ ] Post a single artifact bundle (commands + outputs + counts).

## Verification Commands
```bash
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json
```

## Exit Criteria
- Repair artifact posted; QA gate becomes runnable.
EOF
)"

qa_body="$(cat <<'EOF'
# Unblock Plan — QA G2: Post-repair run-linkage coherence verification

## Decisions (pick 1–2)
1) **Verdict:** `G2: PASS` vs `G2: FAIL` (binary only).
2) **Sampling:** full audit run (recommended) vs bounded sample.

## Deploy / Env Checklist
- [ ] Board repair lane posts artifacts.
- [ ] Engineering hardening lane posts invariant statement.
- [ ] Run audits from a clean environment; attach JSON outputs.

## Verification Commands
```bash
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_state_audit.py --json --source-mode live
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run
```

## Exit Criteria
- QA posts `G2: PASS` or `G2: FAIL` with deterministic command/output bundle.
EOF
)"

ssh_body="$(cat <<'EOF'
# Unblock Plan — 5070Ti SSH authorization OR manual status proof

## Decisions (pick 1–2)
1) **Access lane:** SSH authorization (preferred) vs manual proof.
2) **Runtime lane:** confirm required service is running vs start it.

## Deploy / Env Checklist
- [ ] Ensure 5070Ti is reachable.
- [ ] SSH lane: add trusted pubkey to `authorized_keys`.
- [ ] Manual lane: run status commands on 5070Ti and capture required fields.

## Verification Commands
```bash
# SSH lane (from this machine)
ssh <user>@100.121.211.106 'hostname; date; curl -sS http://localhost:23880/status | head -n 80'

# Manual lane (run on 5070Ti console)
curl -sS http://localhost:23880/status | head -n 120
curl -sf http://127.0.0.1:1355/health || true
```

## Exit Criteria
- Proof artifact posted and linked to dependent lane (MUS-1024 → MUS-995).
EOF
)"

put_plan d30c7dd6-afb2-4180-857c-787e7603005e "$d30_body"
put_plan f2256fab-82bf-4e3d-8528-7adfd64ce461 "$f2256_body"
put_plan f98b1b21-2b55-438d-9cb5-e5825921682c "$f98_body"
put_plan cd58ca32-2d4b-4322-b326-35e29e4b390b "$cd58_body"
put_plan f5534b89-6dfc-4e94-a9ab-63d7a4a1c502 "$f553_body"
put_plan 8d2fe85d-55ba-4025-a7d7-677077b71968 "$qa_body"
put_plan 3a14e790-7066-47d1-9ad8-f54f847781ef "$ssh_body"

