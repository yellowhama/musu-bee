# Musu Indexer TODO

## Active

- [x] Phase 01. CLI Runtime Decoupling And Workspace Profiles
  - [x] Verify local CLI help paths work without `mcp`
  - [x] Verify workspace profile example is documented and usable
  - [x] Verify scope filtering and search excludes behave as expected
  - [x] Close phase docs and README with final validation notes

- [x] Phase 02. Sync Engine Stabilization
  - [x] Add cleanup/reconciliation command with `--dry-run`
  - [x] Report missing-on-disk vs out-of-workspace rows separately
  - [x] Verify stale row cleanup works without manual SQL
  - [x] Reflect the cleanup flow in README and plan docs
  - [x] Instrument full sync vs partial ingest timing and output
  - [x] Capture large-workspace sync evidence and stuck-state diagnosis

- [x] Phase 03. Query And Retrieval Quality
  - [x] Refine category tagging beyond `%spec%/%report%/%reference%`
  - [x] Improve query expansion and ranking quality
  - [x] Standardize search output for spec/report/reference/code mixes

- [x] Phase 04. Session / ACP Productization
  - [x] Define session lifecycle contract and stale session cleanup
  - [x] Reduce raw snapshot DB bloat and logging duplication
  - [x] Align CLI and MCP naming/payloads for session tools
  - [x] Fix session start cwd and session-log source mapping

- [x] Phase 05. MCP Tool Surface And Packaging
  - [x] Split optional dependencies for CLI vs MCP vs watcher runtime
  - [x] Review MCP tool taxonomy and install flow
  - [x] Align package metadata and README with actual runtime boundaries

- [x] Phase 06. Validation And Release Readiness
  - [x] Add repeatable smoke checks for sync/search/profile flows
  - [x] Add workspace profile examples and release checklist
  - [x] Write handoff/runbook docs for next session

## Backlog

- [x] Phase 07. Session Runtime Persistence
  - [x] Persist ended session metadata and history across CLI invocations
  - [x] Distinguish active sessions from historical sessions in CLI/MCP output
  - [x] Add retention policy for historical session artifacts

- [x] Phase 08. Packaged Install And Engine Failure Propagation
  - [x] Add Python scan + Python write fallback to protect sync correctness
  - [x] Add packaged install smoke script and blocked-environment detection
  - [x] Finish explicit Go engine error surfacing for every runtime path (`sync-map`, watcher, MCP)
  - [x] Add packaged-install smoke report output and optional online extras mode

- [x] Phase 10. Packaged Bootstrap Fallback And Host Guidance
  - [x] Capture blocker research with official sources
  - [x] Add `uv` fallback to packaged-install smoke bootstrap
  - [x] Record venv backend and tool availability in the smoke report
  - [x] Update README / handoff / release guidance with host bootstrap notes

- [x] Phase 11. Host Validation Automation And Bundle
  - [x] Add a host prerequisite probe for packaged validation
  - [x] Add an aggregate validation bundle script
  - [x] Wire bundle and probe into README / release docs

- [ ] Phase 09. Host Packaged Validation And Release Evidence
  - [ ] Provision a host where `python3 -m venv` / `ensurepip` works
  - [ ] Or provide a host with `uv` available for the bootstrap fallback
  - [ ] Run `bash scripts/run-validation-bundle.sh` on a suitable host
  - [ ] Run `bash scripts/run-validation-bundle.sh --online-extras` on a suitable host with network access
  - [ ] Record the latest packaged-install report path and outcome in `RELEASE_CHECKLIST.md`
  - [ ] Close `HANDOFF.md` and `MASTER_PLAN.md` with the final packaged-install evidence
