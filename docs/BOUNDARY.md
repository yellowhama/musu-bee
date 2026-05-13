# Workspace Boundary — Operating Rules

> Settled 2026-05-13 during the boundary settlement cycle.
> Migrated 2026-05-13 from `C:\dev\musu-bee` to `F:\workspace\musu-bee`.
> Master plan: [docs/plans/BOUNDARY_MASTER_PLAN_2026_05_13.md](plans/BOUNDARY_MASTER_PLAN_2026_05_13.md).

## TL;DR — three rules

1. **Source of truth = `F:\workspace\musu-bee` (Windows)**.
2. **Tools see `F:\workspace\musu-bee` (Windows) or `/mnt/f/workspace/musu-bee` (WSL bridge to the same files)** — never `~/musu-functions/` for code changes.
3. **One direction of flow**: changes land in Windows clone → commit → push `origin/main`. WSL repo is a *mirror or operator scratch space*, not the truth.

If you only read three lines, those are them.

---

## What lives where

| Concern | Location | Notes |
|---|---|---|
| Code source of truth | `F:\workspace\musu-bee` | Cloned from `github.com/yellowhama/musu-bee`. `main` branch only. (Was `C:\dev\musu-bee` until 2026-05-13 migration.) |
| Bridge runtime data | `C:\Users\<you>\.musu\` | Created by `install.ps1`. `bridge.env`, `nodes.toml`, `musu.db`. **User profile path stays on C: — only the repo moved.** |
| Bridge process | Scheduled Task `musu-bridge`, started at logon | LogonType=Interactive. Auto-restarts on crash. |
| Bridge HTTP | `http://127.0.0.1:8070` | Bearer auth via `MUSU_BRIDGE_TOKEN`. |
| Indexer | `F:\workspace\musu-bee\musu-indexer\.venv` | Python venv on Windows. `musu-indexer.exe` scanner binary. |
| Indexer DB | `F:\workspace\musu-bee\.musu_dev.db` | SQLite + FTS5. ~50–200 MB depending on scope. |
| Wiki | `\\wsl$\Ubuntu-22.04\home\hugh51\llm-wiki\` | Separate git repo, WSL side. Indexed but not part of musu-bee. |
| Old WSL repo | `\\wsl$\Ubuntu-22.04\home\hugh51\musu-functions\` | **Operator's scratch** — different branches, uncommitted work. **Do not treat as source of truth.** |

## Rule 1 — Source of truth is `F:\workspace\musu-bee`

- All new code changes are authored in this clone.
- `git commit` happens here. `git push origin main` happens here.
- The Windows clone's `git remote -v` is `origin → github.com/yellowhama/musu-bee.git`. WSL clone uses different remote naming (`github` + `forgejo`) and is not part of the truth chain.
- The previous location (`C:\dev\musu-bee`) was migrated on 2026-05-13 to consolidate workspace on F: drive. Old plan/handoff docs that still reference `C:\dev\musu-bee\…` are historical record — translate to `F:\workspace\musu-bee\…` when applying.

If a fix originates somewhere else (operator paste into WSL, AI tool writing to `~/musu-functions/`), copy it into the Windows clone before committing. The first enforcement of this rule was Phase 0 of the boundary settlement cycle (commit `9b62fd1`).

## Rule 2 — Tools see Windows paths or `/mnt/f/...`

- **Windows tools** (PowerShell, `git`, `npm`, `npx`, `pytest`, `python`, `musu-indexer.exe`): use `F:\workspace\musu-bee\…` paths.
- **WSL tools** (`bash`, `rg`, `grep`, optional Linux indexer binary): use `/mnt/f/workspace/musu-bee/…`. Same file system, different driver. Editing from either side touches the same bytes.
- **Never** point a tool at `/home/hugh51/musu-functions/…` and treat its output as authoritative about MUSU code. That tree has its own commits, its own branch, and its own uncommitted scratch.

`musu-indexer` was reconfigured during Phase 1 to load `musu-indexer.exe` on Windows (`sys.platform == "win32"`). The `.musu-indexer.json` at the repo root tells the indexer "this is the workspace." Both sides honor the same file.

## Rule 3 — One direction of flow

```
Windows clone   →   git commit   →   git push origin main   →   github
       ↑
       └── (manual copy in if changes originated in WSL)
```

WSL clone is read-only as far as MUSU code authority. If the operator wants WSL to see the latest, they `git fetch github main && git checkout main && git pull` — but only as a downstream consumer, never as a place to author changes that then propagate up.

## Open items that this boundary does not solve

These remain real issues; the boundary just keeps them from getting worse.

### Bridge restart needs admin (Phase 3 finding)

`Stop-ScheduledTask musu-bridge` returns 0 without elevation, but the python child process keeps running (uvicorn doesn't process the stop signal under Interactive LogonType on Windows). Direct `Stop-Process -Id <pid>` fails with "Access denied" because the process belongs to the Interactive logon session.

`-LogonType S4U` would fix this, but registering an S4U task itself requires the "Replace a process level token" privilege, which non-admin users don't have. So neither path works without elevation right now.

**Workaround until v17**: to reload bridge code, either
1. log out and back in (Scheduled Task restarts with new code), or
2. `Unregister-ScheduledTask musu-bridge -Confirm:$false` (works without admin) and run `install.ps1 -Service -Start` again.

### Indexer scanner binary is `.gitignore`d

`bin/musu-indexer.exe` ships only in pre-built indexer releases. Fresh clones have no scanner. Phase 1 of this cycle copied the binary from WSL manually. Long-term, `install.ps1` needs an indexer setup step or the binary should be committed.

### Old WSL MCP servers no longer autostart, but were stopped manually

Phase 2 killed two MCP servers and commented out the cron line that re-launched the auto-sync. Both are reversible (cron backup in `/tmp/crontab-backup-20260513-210559.txt`). Future tools that re-launch indexer MCP must point at `/mnt/f/workspace/musu-bee` as workspace root, not `~/musu-functions`.

## How a new Claude session should orient itself

1. Read this file first.
2. `cd F:\workspace\musu-bee && git log -3 --oneline` to see the most recent commits.
3. `git status` should be empty (or just untracked artifacts like `scripts/start-bridge.ps1`).
4. If asked to make changes, make them here, not in WSL. Cross-reference [docs/plans/](plans/) for any in-progress cycle.
5. `musu-indexer search "<query>"` (via `F:\workspace\musu-bee\musu-indexer\.venv\Scripts\musu-indexer.exe`) is the way to find code without paying for a full grep.

If you find yourself editing in `/home/hugh51/musu-functions/…`, stop. Move the change to `F:\workspace\musu-bee\…` and commit there.
