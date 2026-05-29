# CoS Memory Note - Current Single-Machine Evidence + musu-system Recheck (2026-05-29 11:55 KST)

## Facts

- Current single-machine smoke evidence was recorded under `docs/evidence/single-machine/1.15.0-rc.1/20260529-114932-HUGH_SECOND.evidence.json`.
- Evidence commit: `a3ace02cf3006f6ae60ed34202c3f54d81efca67`.
- Dashboard task: `e97cec87-c10a-48e4-acfa-5052a6485320`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1149`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_1149`.
- `verify-single-machine-evidence.ps1` now requires current version/current commit and accepts only documentation/evidence-only deltas after the recorded code commit.
- `smoke-single-machine-beta.ps1` now runs CLI commands through timeout-safe process execution so `musu up --json` cannot hang the smoke recorder indefinitely.

## musu-system recheck

- Public `yellowhama/musu-system` HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs remain `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, and private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Active monorepo service tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Local `go test ./...` and `go vet ./...` passed in `core`, `crawl-ai`, `marketer`, and `nurikun` from `.local-build/external/musu-system`.

## Decision

- `musu-system` has high future integration value, especially `crawl-ai` for wiki ingestion, `marketer` for grounded launch/campaign drafting, and `nurikun` for support/opt-in operations.
- Do not merge it into `musu-rs` and do not bundle it into the first Microsoft Store package.
- First integration should be optional MCP/CLI/bridge adapters with explicit cwd/wiki/project/model/env contracts.
- Keep `nurikun` delivery operations gated; fix or wrap `watch` send-failure persistence before dashboard integration.
