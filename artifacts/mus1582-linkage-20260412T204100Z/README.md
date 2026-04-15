# MUS-1685 Linkage Bundle

Generated at (UTC): 2026-04-12T20:41:00Z
Bundle root: artifacts/mus1582-linkage-20260412T204100Z

## Purpose
Deterministic mapping between:
1) design artifacts (MUS-1651 outputs),
2) implementation PR checks (GitHub check runs), and
3) a cycle-safe G1->G2 propagation trace.

## Replay Commands
Run from repo root.

1. Validate manifest JSON
```bash
jq empty artifacts/mus1582-linkage-20260412T204100Z/manifest.json
```

2. Validate all referenced files exist
```bash
jq -r '.design_artifacts[].file_path, .snippets[].path' artifacts/mus1582-linkage-20260412T204100Z/manifest.json \
  | while read -r p; do [ -f "$p" ] && echo "OK  $p" || echo "MISS $p"; done
```

3. Confirm check-run IDs and details URLs are present
```bash
jq '{total_count, check_ids:[.check_runs[].id], details_urls:[.check_runs[].details_url]}' \
  artifacts/mus1582-linkage-20260412T204100Z/snippets/github_check_runs_pr1_head.json
```

4. Confirm no placeholder marker appears inside this bundle
```bash
A='[T'
B='BD: awaiting'
C=' real data]'
PAT="${A}${B}${C}"
if rg -F -n "$PAT" artifacts/mus1582-linkage-20260412T204100Z; then
  echo "FAIL: placeholder marker detected"
  exit 1
fi
echo "PASS: no placeholder marker"
```

5. Hard-fail on non-monotonic timestamps per cycle
```bash
jq -e '
  . as $root
  | [ $root.propagation_trace[].cycle_id ] | unique as $cycles
  | all($cycles[];
      . as $cycle
      | ($root.propagation_trace | map(select(.cycle_id == $cycle))) as $rows
      | ($rows|length) >= 2
      and ($rows[0].stage == "G1")
      and ([ $rows[].stage ] | any(. == "G2"))
      and (([ $rows[].timestamp | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 ]) as $ts | $ts == ($ts|sort))
    )
' artifacts/mus1582-linkage-20260412T204100Z/manifest.json >/dev/null && echo "PASS: chronology_monotonic=1"
```

## Expected Output
- Step 1: success (exit 0)
- Step 2: all lines begin with `OK`
- Step 3: `total_count >= 1` with non-empty `check_ids` and `details_urls`
- Step 4: prints `PASS: no placeholder marker`
- Step 5: prints `PASS: chronology_monotonic=1`
