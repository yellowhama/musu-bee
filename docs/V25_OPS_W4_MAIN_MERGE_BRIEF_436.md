# #436 main-merge — operator brief (V23.3 + V23.4 Tier-1 + V23.5 + V24 bundle)

**Audience**: musu operator (you).
**Wiki ID**: this doc = wiki/505 sibling. Task = GOAL.md L166 / task #436 "Operator main-merge precondition: V23.3 + V23.4 Tier-1 → main".
**Status**: V23.3/V23.4 Tier-1/V23.5/V24 all SHIP-ed on feature branches. main-merge is your decision. orchestrator does NOT auto-merge to main (Const VII orthogonal).

---

## §1 What #436 is

`docs/GOAL.md` L166 + L170 + L252 명시:

- V23.3 closure shipped on `v22/gap-analysis` (HEAD `429044f`)
- V23.4 Tier-1 closure shipped on `v22/gap-analysis` / `v23/phase4` (Tier-1 specific commits)
- V23.5 closure shipped on `v23/phase4`
- V24 closure shipped on `v24/rust-cleanup` (HEAD as of W3 = `6b7263c`)

main branch는 V23.2 시점에 멈춤. 4 master plan epoch (V23.3, V23.4 Tier-1, V23.5, V24) 가 main 밖에서 누적되어 있음. #436 은 그 누적을 main 으로 cohere 하는 operator decision.

orchestrator 는 main 으로 push 하지 않음 ([[feedback-autonomous-loop]] explicit gate). main-merge 는 operator 권한.

---

## §2 4 master plan bundle — what each shipped

| Master | Branch | What shipped | Closure doc |
|---|---|---|---|
| **V23.3** | `v22/gap-analysis` | K3s substrate + Alpine WSL2 + signaling Fly.io retirement prep | `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` (wiki/396) |
| **V23.4 Tier-1** | `v22/gap-analysis` then `v23/phase4` | install_attempt sweeper + uniform DB-write try/catch + PowerShell installer enrichment + fleet view + workflow runner asyncio | `docs/V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html` (wiki/447) + `docs/V23_4_TIER1_FINAL_CLOSURE_2026_05_18.md` |
| **V23.5** | `v23/phase4` | 4-layer architecture lock (CoS Layer 0) + HTML wiki memory layer (DOMPurify + Tariq skeleton) + Paperclip observer wiki/457 | `docs/V23_5_FINAL_CLOSURE_*` (wiki/485+) |
| **V24** | `v24/rust-cleanup` | Layer 1 Python → Rust substrate migration (musu single binary, 6 subcommand, R-fast + R-cleanup phased) | `docs/V24_CLOSURE_2026_05_21.html` (wiki/500) + V25-OPS W3 R10 runbook completeness |

V25-OPS 자체 (W1-W5) 는 V24 운영 마무리이므로 자연스럽게 V24 bundle 안 포함. 별도 master 로 분리 X.

---

## §3 Closure docs cross-link

main-merge 직전 review 권장 (operator):

- `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` (V23.3, K3s + signaling)
- `docs/V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html` (V23.4 Phase 4)
- `docs/V23_4_TIER1_FINAL_CLOSURE_2026_05_18.md` (V23.4 Tier-1)
- `docs/V23_5_FINAL_CLOSURE_*.html` (V23.5; 정확한 file name 은 `ls docs/V23_5_*CLOSURE*` 으로 확인)
- `docs/V24_CLOSURE_2026_05_21.html` (V24)
- `docs/V25_OPS_CLOSURE_2026_05_21.html` (V25-OPS W5, 추후 생성)

각 master plan 의 §0/§1 thesis + §9 acceptance criteria 확인 — 모두 SHIP-OK 인지.

---

## §4 Branch + commit range (variables — confirm at merge time)

이 brief 가 commit hash 박지 않음 ([[feedback-loc-estimate-x2]] adjacent — hash drift 방지). operator 가 merge time 에 `git rev-parse` 로 확정.

```sh
# Capture HEAD of each feature branch:
V23_3_HEAD=$(git rev-parse v22/gap-analysis)         # or specific tag if cut
V23_4_HEAD=$(git rev-parse v23/phase4)               # V23.4 Tier-1 + Phase 4 last commit
V23_5_HEAD=$(git rev-parse v23/phase4)               # V23.5 ships on same branch as V23.4 Phase 4 — verify
V24_HEAD=$(git rev-parse v24/rust-cleanup)           # V24 + V25-OPS

# Verify what's in each branch:
git log --oneline ${V23_3_HEAD} ^main                # commits ahead of main on V23.3 branch
git log --oneline ${V24_HEAD} ^main                  # commits ahead of main on V24 branch
git diff --stat main..${V24_HEAD}                    # LOC summary
```

V23.5 가 V23.4 Phase 4 위에 쌓였는지 v23/phase4 branch 자체에서 cut 됐는지 verify 필요 — `git log --oneline --decorate v23/phase4 | head -5` 로 확인.

---

## §5 Merge command template

**recommended**: `--no-ff` (merge commit preserves branch context). operator preference 에 따라 `--ff-only` 또는 `--ff` 가능.

```sh
# Switch to main
git checkout main

# Dry-run preview (NO COMMIT yet)
git merge --no-commit --no-ff ${V24_HEAD}
# inspect: git diff --cached --stat
# abort if not OK: git merge --abort

# If preview OK, complete the merge:
git merge --continue   # or: git commit (with the auto-prepared merge message)

# Alternative (if you prefer to rebase first, then merge):
# git checkout ${V24_HEAD} -b temp/main-merge-prep
# git rebase main
# git checkout main && git merge --ff-only temp/main-merge-prep && git branch -D temp/main-merge-prep
```

V23.3 → V23.4 → V23.5 → V24 의 sequence 가 v24/rust-cleanup 안에 이미 stacked 라면 V24_HEAD 한 번 merge 로 충분. stacked 아니면 V23.3 → V23.4 → V23.5 → V24 순서로 4 회 merge.

**push**:
```sh
git push origin main
```

main push 가 Const VII trigger — V25-OPS 의 batched approval 은 feature branch 한정, main 은 operator authority required.

---

## §6 Post-merge verification

merge 후 즉시 check:

1. `git log --oneline main | head -10` — V24 / V23.5 / V23.4 / V23.3 commit hash 모두 main history 에 visible
2. `bash scripts/install.sh --service --start` (Linux) 또는 PowerShell installer (Windows) — fresh install path 동작 (V24 R6 acceptance)
3. `curl http://127.0.0.1:8070/health` — Rust bridge 200 (V24 R1 acceptance)
4. `sqlite3 ~/.musu/audit.db "select count(*) from audit_log where actor_ip != 'testclient'"` — ≥5 (V24 acceptance §A item 5)
5. `musu indexer sync && musu indexer search --work-dir . --query "V24"` — FTS5 동작 (V24 R4 acceptance)
6. V24_CLOSURE_2026_05_21.html §5 §9.12 attestation: 이미 채워져 있어야 main merge 정당화 (see `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md`)

failure 시: `git reset --hard origin/main` 으로 pre-merge state 복귀. local merge commit 잃지만 feature branch 안전.

---

## §7 What does NOT happen automatically

- orchestrator 는 main push 안 함 — operator 직접 실행
- orchestrator 는 §9.12 attestation 작성 안 함 — operator 직접 작성 (Goodhart firewall)
- main 으로 가는 commit 의 author 는 operator git config 의 identity (orchestrator co-author trailer 는 history 에 남으나 author 는 operator)
- V23.5 wiki/485+ 또는 V24 wiki/500 closure 가 수정 필요 시 operator 직접 — orchestrator 가 closure 보조 가능하나 attestation 본문은 X

---

## §8 References

- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W4 + §4.4
- `docs/V25_OPS_W4_OPERATOR_BRIEFS_2026_05_21.md` (W4 detail plan)
- `docs/V25_OPS_W4_GOODHART_ATTESTATION_HOWTO.md` (sibling doc — §9.12 HOW-TO)
- `docs/GOAL.md` L166 / L170 / L252 — #436 task definition
- 4 closure docs (§3 위)
- Memory: [[feedback-autonomous-loop]] (main push gate explicit), [[feedback-const-vii-batched-approval]] (main 은 batched 제외, operator authority), [[feedback-no-python]] (V24 thesis)
