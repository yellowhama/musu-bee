# MUS-1582 Linkage Evidence Bundle

Generated at: 2026-04-12T19:35:41Z
Issue: MUS-1685 (remediation for MUS-1582)
Bundle path: artifacts/mus1582-linkage-20260412T193540Z

## Contents
- manifest.json
- snippets/design_artifact_refs.txt
- snippets/pr_checks_pr1.json
- snippets/g1_g2_trace.txt
- snippets/linkage_matrix.csv

## Replay Commands
1. Verify all design artifact files are readable from repo root:

a) while read -r p; do test -r "$p" && echo "ok:$p" || echo "missing:$p"; done < <(jq -r '.design_artifacts[].file_path' "artifacts/mus1582-linkage-20260412T193540Z/manifest.json")

2. Recompute checksum/size for each artifact:

a) jq -r '.design_artifacts[].file_path' "artifacts/mus1582-linkage-20260412T193540Z/manifest.json" | while read -r p; do printf '%s\t' "$p"; stat -c '%s' "$p"; sha256sum "$p" | awk '{print $1}'; done

3. Replay PR check extraction from GitHub (requires gh auth):

a) gh pr view 1 --repo yellowhama/musu-bee --json statusCheckRollup

4. Verify propagation trace IDs resolve in MUS-1582 comments:

a) curl -sS http://127.0.0.1:3100/api/issues/203bfa4d-0aa8-49cc-904b-5276fdccc794/comments | jq -r '.[] | [.id,.createdAt] | @tsv' | rg 'b64c1871-86c0-4295-b722-23a48e8ebbad|631adaa5-0fea-49fe-80d5-52926bf7e616|ed2a7a08-01fa-4ecf-ae9d-7e6ce1db6b9b|0c8e5cb9-8f7d-49ab-994a-95086d390c18'

## Expected Output
- 4 readable design artifact paths.
- 4 PR check entries with non-empty status_url values.
- 4 propagation trace rows that resolve to real comment IDs/timestamps.

## Failure Conditions
- Any manifest path missing/unreadable.
- Any `pr_checks[]` row missing `check_id`, `status`, or `status_url`.
- Any propagation comment ID absent from MUS-1582 comments.
