# Musu Indexer Release Checklist

## Pre-release

- Confirm [MASTER_PLAN.md](/home/hugh51/musu-functions/musu-indexer/MASTER_PLAN.md) and [TODO.md](/home/hugh51/musu-functions/musu-indexer/TODO.md) reflect the actual phase status.
- Confirm README examples still match the current CLI surface.
- Confirm optional dependency guidance matches `pyproject.toml`.

## Verification

- Run `bash scripts/run-smoke.sh`
- Run `bash scripts/check-packaged-host-prereqs.sh`
- Run `bash scripts/run-packaged-install-smoke.sh --report /tmp/musu-indexer-packaged-report.txt`
- If the host has network access, run `bash scripts/run-packaged-install-smoke.sh --online-extras --report /tmp/musu-indexer-packaged-report-online.txt`
- Prefer `bash scripts/run-validation-bundle.sh` as the single command that captures all validation evidence
- If `python3 -m venv` is unavailable, provide `uv` or an Ubuntu-equivalent `python3-full` environment before concluding the package path is broken
- Run `python3 -m musu_indexer.cli mcp` and confirm the missing-runtime message is clear on a base install.
- If testing MCP extras, install `.[mcp]` and verify `musu-indexer mcp` boots.
- If testing watcher extras, install `.[watch]` and verify `musu-indexer watch --help` works.

## Workspace Checks

- Verify `.musu-indexer.json` discovery works from a nested directory.
- Verify `cleanup --dry-run` shows no unexpected out-of-workspace rows for the target profile.
- Verify `runs --limit 5` records the latest sync/cleanup evidence.

## Release Notes

- Summarize CLI surface changes
- Summarize profile/root contract changes
- Summarize packaging/extras changes
- Summarize validation command and any known limitations
- Record the latest validation bundle report path
- Record the latest packaged-install report path and whether it ended in `success`, `blocked`, or `failed`
