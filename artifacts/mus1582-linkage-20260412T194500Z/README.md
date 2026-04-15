# MUS-1685 Linkage Bundle

Generated at (UTC): 2026-04-12T19:45:00Z
Bundle root: artifacts/mus1582-linkage-20260412T194500Z

## Purpose
Deterministic mapping between:
1) design artifacts (MUS-1651 outputs),
2) implementation PR checks (GitHub check runs), and
3) G1->G2 propagation rows (issue/comment/timestamp).

## Replay Commands
Run from repo root.

1. Validate manifest JSON
```bash
jq empty artifacts/mus1582-linkage-20260412T194500Z/manifest.json
```

2. Validate all referenced files exist
```bash
jq -r '.design_artifacts[].file_path, .snippets[].path' artifacts/mus1582-linkage-20260412T194500Z/manifest.json \
  | while read -r p; do [ -f "$p" ] && echo "OK  $p" || echo "MISS $p"; done
```

3. Confirm check-run IDs and details URLs are present
```bash
jq '{total_count, check_ids:[.check_runs[].id], details_urls:[.check_runs[].details_url]}' \
  artifacts/mus1582-linkage-20260412T194500Z/snippets/github_check_runs_pr1_head.json
```

4. Confirm no placeholder marker appears inside this bundle
```bash
A='[TBD: awaiting'
B=' real data]'
PAT="${A}${B}"
if rg -F -n "$PAT" artifacts/mus1582-linkage-20260412T194500Z; then
  echo "FAIL: placeholder marker detected"
  exit 1
fi
echo "PASS: no placeholder marker"
```

## Expected Output
- Step 1: success (exit 0)
- Step 2: all lines begin with `OK`
- Step 3: `total_count >= 1` with non-empty `check_ids` and `details_urls`
- Step 4: prints `PASS: no placeholder marker`

## Failure Conditions
- Any `MISS` in step 2
- Empty check-run payload in step 3
- Missing IDs/timestamps in `propagation_trace`
- Placeholder marker detected in step 4
