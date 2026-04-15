# MUS-1685 Linkage Bundle

Generated at (UTC): 2026-04-12T19:39:16Z
Bundle root: artifacts/mus1582-linkage-20260412T193914Z

## Purpose
Deterministic mapping between:
1) design artifacts (MUS-1651 outputs),
2) implementation PR checks (GitHub check runs), and
3) G1->G2 propagation rows (issue/comment/timestamp).

## Replay Commands
Run from repo root.

1. Validate manifest JSON
```bash
jq empty artifacts/mus1582-linkage-20260412T193914Z/manifest.json
```

2. Validate all referenced files exist
```bash
jq -r '.design_artifacts[].file_path, .snippets[].path' artifacts/mus1582-linkage-20260412T193914Z/manifest.json \
  | while read -r p; do [ -f "$p" ] && echo "OK  $p" || echo "MISS $p"; done
```

3. Re-fetch check runs for captured PR head SHA
```bash
SHA=$(jq -r '.[0].headRefOid' artifacts/mus1582-linkage-20260412T193914Z/snippets/github_pr_list.json)
gh api -H 'Accept: application/vnd.github+json' "/repos/yellowhama/musu-bee/commits/$SHA/check-runs" \
  | jq '{total_count, check_ids:[.check_runs[].id], details_urls:[.check_runs[].details_url]}'
```

## Expected Output
- Step 1: success (exit 0)
- Step 2: all lines begin with `OK`
- Step 3: `total_count >= 1` with non-empty `check_ids`

## Failure Conditions
- Any `MISS` in step 2
- Empty check-run payload in step 3
- Missing IDs/timestamps in `propagation_trace`
