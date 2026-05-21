# V24 §9.12 operator-attested closure — HOW-TO (operator-facing)

**Audience**: musu operator (you).
**Wiki ID**: this doc = wiki/505. Target = `docs/V24_CLOSURE_2026_05_21.html` §5 §9.12 attestation block (L212-229).
**Status**: V24 ships in **"code shipped, acceptance pending"** state. §9.12 attestation block exists as empty stubs awaiting your authorship. **No orchestrator may prefill this block.** Goodhart firewall.

---

## §1 What §9.12 is, and why orchestrator must not prefill it

V24 의 §A acceptance bar (`docs/GOAL.md` §A) 는 "land-os + vibecode-town cross-machine task with ≥5 non-testclient audit_log rows". orchestrator 가 이 metric 을 자동 만족하기 너무 쉽다 — testclient 가 아닌 curl wrapper 5 개 실행 + audit_log 행 5 개 emit → metric satisfied, but real operator workflow zero. 이게 **Goodhart's law**: 목표 metric 이 proxy 가 되는 순간 그 proxy 게이밍이 시작된다.

§9.12 가 firewall 역할: operator-authored attestation 으로만 V24 close. orchestrator 가 작성하면 firewall 깨짐. attestation 의 **forensic property** 가 firewall mechanism:

1. **Git authorship**: `git log --format="%an %ae"` 가 operator 의 email/identity 보장 — orchestrator 가 다른 identity 로 commit 불가
2. **Terminal history**: operator 의 실제 workspace (`F:\Aisaak\Projects\land-os`, `F:\Aisaak\Projects\vibecode-town`) 에서 task 실행 — orchestrator 의 testclient/curl 으로 reproduce 불가
3. **audit_log forensics**: `actor_ip != 'testclient'` 행이 operator 의 실제 cross-machine 작업 결과

orchestrator 가 §9.12 작성 시 위 셋 다 fake. operator 자기 손으로 작성해야 valid.

---

## §2 4 target fields you must author yourself

V24_CLOSURE_2026_05_21.html §5 안 (line 212-227) `<blockquote class="attest">` 의 4 field. 각각:

| Field | V24_CLOSURE line | Type | Your input |
|---|---|---|---|
| **Task 1 details** | L218 | text | One real task you (operator) ran on `land-os` or `vibecode-town`. Include company name + what you did. Optional: audit_log row reference |
| **Task 2 details** | L219 | text | Second real task — different company OR different machine |
| **Task 3 details** | L220 | text | Third real task. Together with 1+2 the 3 tasks ≥3 distinct operator workflows |
| **Reproducibility attestation** | L223 | sentence | Free-form: "Tasks above are reproducible from my terminal history at `<path>` and git log at `<repo>`" |
| **Operator signature** | L225 | identifier | Your git author identity (email or hostname). Must match `git config user.email` |
| **Date** | L226 | yyyy-mm-dd | Either R10 ship date OR earlier acceptance date (R8 가 acceptance trigger 면 R8 ship date OK). format `yyyy-mm-dd` strict |

(V24_CLOSURE line numbers are accurate at commit `a5a85cf`. After W3 commit (line 6b7263c) line numbers may shift — re-locate with `grep -n 'class="attest"' docs/V24_CLOSURE_2026_05_21.html`.)

---

## §3 How to fill each field (operator workflow)

### 3.1 Tasks 1/2/3 — gather from your real history

**audit_log query** (sqlite3 CLI, works in Windows PowerShell + WSL + bash):

```sh
sqlite3 ~/.musu/audit.db "select datetime(timestamp/1000, 'unixepoch') as ts, actor_ip, company, activity from audit_log where actor_ip != 'testclient' order by timestamp desc limit 20"
```

(Replace `~/.musu/audit.db` with the actual path your install uses. Common alternatives: `$MUSU_FUNCTIONS_ROOT/audit.db`, or wherever your installer placed it. On Windows PowerShell, use `$env:USERPROFILE\.musu\audit.db`.)

Pick **3 distinct rows** that represent different real workflows you did. Examples (shape only):
- Task 1: "Registered <COMPANY_NAME> as company at <DATE>, ran initial smoke (`musu bridge`+ audit_log row <ID>)"
- Task 2: "Cross-machine task from <MACHINE_A> to <MACHINE_B>, output written to <PATH>"
- Task 3: "Wiki page <PAGE_ID> created via `/sc:research` on <COMPANY_NAME>"

### 3.2 Reproducibility attestation

One sentence. Template (replace `<PATH>` and `<REPO>` with your real values; DO NOT keep `<...>` placeholders in final):

```
Tasks above are reproducible from my terminal history at <PATH> and git log at <REPO>.
```

Both `<PATH>` and `<REPO>` must be paths YOU can verify, not orchestrator-asserted.

### 3.3 Operator signature

Your git author identity. Verify with:

```sh
git config user.email
git config user.name
```

Use the email shown. (orchestrator 가 이 identity 로 commit 불가 — git config 다름.)

### 3.4 Date

`yyyy-mm-dd`. **Constraint**: date must be R10 ship date ± 7 days, OR an earlier acceptance event (e.g., R8 ship date if you consider R8 the acceptance milestone). Pick whichever reflects when you actually attested.

---

## §4 DO NOT list (orchestrator-prohibited prefill)

The following must NOT appear pre-filled when you open the §9.12 block:

1. **DO NOT** prefill any Task 1/2/3 text with orchestrator-inferred content
2. **DO NOT** prefill operator signature with email harvested from `git log` (operator must explicitly write their own identity at attestation time)
3. **DO NOT** prefill date — operator must write today's date at attestation time
4. **DO NOT** template-substitute placeholders with actual operator data via automation
5. **DO NOT** add Tasks 4-N or other fields — 3 task slots intentional, operator may add narrative but signature/date fields are load-bearing

If you open V24_CLOSURE_2026_05_21.html §9.12 and find ANY of the above prefilled by orchestrator, raise this with the maintainer — Goodhart firewall is compromised.

---

## §5 Forensic property (why this works)

Three independent verification surfaces:

| Surface | Operator-verifiable | Orchestrator-fakeable? |
|---|---|---|
| Git authorship (`git log --format="%an %ae"`) | Yes — operator's git config | No — orchestrator commits as different identity, mismatch visible in `git blame` |
| Terminal history at `<PATH>` | Yes — operator's shell history | No — orchestrator runs in different shell context, history file 비공유 |
| audit_log rows where `actor_ip != 'testclient'` | Yes — operator's audit.db | Hard — orchestrator can write rows but `actor_ip` is set by HTTP middleware from real connection, not orchestrator-spoofable without intercepting the network stack |

세 surface 가 cross-verifiable. orchestrator 가 모두 fake 하려면 (a) operator git identity + (b) operator shell history + (c) operator audit.db 셋 다 access 필요 — 그러면 이미 firewall 깨진 상태.

---

## §6 Operator workflow example (with placeholders)

```
1. Open `docs/V24_CLOSURE_2026_05_21.html` (browser or editor)
2. Scroll to §5 §9.12 (search for "operator-attested closure")
3. Verify 4 fields (Task 1/2/3 + signature + date) are EMPTY or marked `<TBD>`
4. (If prefilled — STOP, raise firewall breach)
5. Run audit_log query (§3.1), select 3 real distinct rows
6. Write Task 1/2/3 in your own words (1-3 lines each)
7. Add reproducibility sentence (§3.2)
8. Add operator signature = your git user.email
9. Add date = today (or R10 ship date if attestation deferred until R10)
10. Save file
11. Stage + commit: `git add docs/V24_CLOSURE_2026_05_21.html && git commit -m "V24 §9.12: operator-attested close"`
12. Optionally push: `git push origin v24/rust-cleanup`
```

Commit step 11 is the load-bearing forensic act — your git authorship is now in the history, unfakeable.

---

## §7 What happens after §9.12 attestation

- V24 status updates from "code shipped, acceptance pending" to "operator-attested closed"
- V24 bundle becomes eligible for #436 main-merge (see `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md`)
- CHANGELOG.md [1.14.0] entry remains; future versions append below

`docs/V25_OPS_W5_CLOSURE_2026_05_21.html` (V25-OPS final closure, W5) will cross-link this doc and reference your §9.12 commit hash as the V24 close marker.

---

## §8 References

- `docs/V24_CLOSURE_2026_05_21.html` §5 (attestation block, L212-229)
- `docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` §9 acceptance criterion 12 (operator-attested)
- `docs/V25_OPS_MASTER_PLAN_2026_05_21.md` (wiki/501) §3 W4 + §4.4
- `docs/GOAL.md` §A acceptance + §A.0 day-2 acceptance bar
- `docs/V25_OPS_W4_MAIN_MERGE_BRIEF_436.md` (sibling doc — #436 operator decision)
- `docs/V25_OPS_W4_OPERATOR_BRIEFS_2026_05_21.md` (W4 detail plan, wiki/505)
