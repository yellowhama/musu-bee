# CTO Plan-Eng-Review — MUS-1685

Date: 2026-04-13 (KST)
Issue: MUS-1685 (`4c71f81f-914d-4928-bdfb-b371c6899543`)
Parent: MUS-1582 (`203bfa4d-0aa8-49cc-904b-5276fdccc794`)

## 1) Problem Statement
QA cannot admit G2 on MUS-1582 because design artifacts and implementation PR checks are not linked by deterministic IDs/timestamps/files. Current proofs are narrative and non-replayable.

## 2) Decision
Use an evidence-manifest contract as the single source of truth and require replay commands that regenerate validation from the same artifact set.

## 3) Data Flow (Required)
```text
Design Artifact Source(s)        PR Check Source(s)             Issue Comment Source(s)
            |                             |                               |
            v                             v                               v
     collect IDs + paths            collect check IDs/URLs         collect G1/G2 comment IDs
            \___________________________|_______________________________/
                                        v
                    artifacts/mus1582-linkage-<ts>/manifest.json
                                        |
                                        v
                    replay commands validate manifest references
                                        |
                                        v
                             CTO G1 verdict -> QA G2 replay
```

## 4) Required Bundle Shape
- `artifacts/mus1582-linkage-<timestamp>/manifest.json`
- `artifacts/mus1582-linkage-<timestamp>/README.md`
- evidence snippets (screenshots/log snippets) referenced by manifest

`manifest.json` must contain:
- `design_artifacts[]`: `artifact_id`, `source_issue_identifier`, `file_path`, `checksum_or_size`, `captured_at`
- `pr_checks[]`: `check_id`, `provider`, `status`, `url`, `captured_at`
- `propagation_trace[]`: `stage`, `issue_identifier`, `comment_id`, `timestamp`
- `snippets[]`: `path`, `proves`

## 5) Failure Modes and Mitigations
- Missing files in manifest -> fail G1 immediately; require path-existence proof from repo root.
- PR check URL omitted or stale -> fail G1; require status URL plus capture timestamp.
- Timestamp drift or non-monotonic trace -> fail G1; require ordered G1/G2 trace entries.
- Manual-edit dependent replay -> fail G1; README must run cleanly without editing paths/IDs.
- Placeholder fabrication -> fail G1; unknown values must be `[TBD: awaiting real data]`.

## 6) Security/Integrity Guardrails
- Never include raw secrets in artifacts.
- Redact tokens/keys in all snippet outputs.
- Keep evidence immutable per run timestamped folder.

## 7) Gate Contract
- G1 (CTO): pass only when bundle is deterministic and replayable.
- G2 (QA): rerun from the exact bundle and publish binary verdict.

## 8) Current Routing Decision
- Reparented MUS-1685 from cancelled MUS-1553 to active MUS-1582.
- Assigned implementation ownership to Founding Engineer.
- Blocked MUS-1582 until MUS-1685 posts admissible bundle.
