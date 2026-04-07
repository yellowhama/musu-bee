# Musu Indexer Handoff

Date: 2026-04-02

## Current Status

- Phase 01: CLI runtime decoupling and workspace profiles are implemented.
- Phase 02: cleanup/reconciliation and sync run evidence are implemented.
- Phase 03: category inference, search scope, and result ranking are implemented.
- Phase 04: session metadata, stale cleanup, cwd-correct spawn, and CLI/MCP-aligned session surface are implemented.
- Phase 05: optional dependency split is implemented in `pyproject.toml`.
- Phase 06: smoke script and release checklist are added.
- Phase 07 is implemented: session history, persisted status lookup, orphaned-session reconciliation, and history cleanup are available.
- Phase 08 is done: `sync` now uses Python scan + Python write fallback to protect DB correctness, runtime error surfacing is aligned, and packaged smoke writes a report.
- Phase 10 is done: packaged smoke now tries `uv venv --seed` after `python3 -m venv`, and the blocker research is documented.
- Phase 11 is done: host prerequisite probing and aggregate validation bundle scripts are added.
- Phase 09 is in progress: remaining work is the actual packaged-install validation on a host with working `python3 -m venv` or `uv`.
- Latest local packaged-smoke evidence:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/packaged-install-smoke-blocked-20260402.txt`
- Latest validation bundle evidence:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/validation-bundle-20260402T121838Z.txt`
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/packaged-host-prereqs-20260402T121838Z.txt`
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/packaged-install-smoke-20260402T121838Z.txt`
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/smoke-20260402T121838Z.log`
- Blocker research:
  - `/home/hugh51/musu-functions/musu-indexer/PACKAGED_INSTALL_BLOCKER_RESEARCH_2026-04-02.md`
- Next-step runbook:
  - `/home/hugh51/musu-functions/musu-indexer/NEXT_STEPS.md`
- Quality audit:
  - `/home/hugh51/musu-functions/musu-indexer/QUALITY_AUDIT_2026-04-02.md`
- Latest code/doc index status:
  - `jcodemunch repo: local/musu-indexer-30ffe643 (21 files / 200 symbols)`
  - `jdocmunch repo: local/musu-indexer (21 docs / 207 sections)`

## Primary Entry Points

- README:
  - `/home/hugh51/musu-functions/musu-indexer/README.md`
- Master plan:
  - `/home/hugh51/musu-functions/musu-indexer/MASTER_PLAN.md`
- TODO:
  - `/home/hugh51/musu-functions/musu-indexer/TODO.md`
- Smoke:
  - `/home/hugh51/musu-functions/musu-indexer/scripts/run-smoke.sh`

## Commands

- Local CLI:
  - `PYTHONPATH=src python3 -m musu_indexer.cli sync --root <path>`
  - `PYTHONPATH=src python3 -m musu_indexer.cli search "<query>" --scope all|code|doc --root <path>`
  - `PYTHONPATH=src python3 -m musu_indexer.cli cleanup --dry-run --root <path>`
  - `PYTHONPATH=src python3 -m musu_indexer.cli runs --limit 5 --root <path>`
- Validation:
  - `bash scripts/run-smoke.sh`
  - `bash scripts/check-packaged-host-prereqs.sh`
  - `bash scripts/run-packaged-install-smoke.sh --report /tmp/musu-indexer-packaged-report.txt`
  - `bash scripts/run-packaged-install-smoke.sh --online-extras --report /tmp/musu-indexer-packaged-report-online.txt`
  - `bash scripts/run-validation-bundle.sh`
  - `bash scripts/run-validation-bundle.sh --online-extras`

## Known Limitations

- MCP and watcher extras are optional now, but a full install path still needs explicit packaging validation outside the local source tree.
- Active session registry is still process-local, but ended session history and persisted status now survive new CLI invocations through `session_runs`.
- Runtime error surfacing is aligned across `sync`, `sync-map`, watcher, and MCP `sync_workspace`.
- `scripts/run-packaged-install-smoke.sh` currently exits with a blocked state on this host because `python3-venv/ensurepip` is unavailable and `uv` is also absent, but it now writes a report file describing that blocker and the attempted bootstrap backend.
- `scripts/check-packaged-host-prereqs.sh` and `scripts/run-validation-bundle.sh` are available, but on this host both will still report `blocked` for packaged validation because neither `python3 -m venv` nor `uv` is available.
- Attempting `sudo apt-get install python3.12-venv python3-hatchling` is also blocked on this host (`Operation not permitted`), so packaged validation cannot be completed from this session.
