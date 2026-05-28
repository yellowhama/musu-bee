# CoS Memory Note - musu-system Recheck (2026-05-29 06:45 KST)

Facts:

- `yellowhama/musu-system` HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs remain unchanged: `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- `go test ./...` and `go vet ./...` passed from `F:\workspace\external\musu-system` for `core`, `crawl-ai`, `marketer`, and `nurikun`.
- Monorepo tags observed via `git ls-remote --tags`: `crawl-ai/v0.8.0`, `marketer/v2.0.5`, `nurikun/v0.3.1`.

Decision:

- Integration value remains high.
- Keep `musu-system` adjacent to MUSU runtime; integrate through MCP/CLI/bridge adapters and shared wiki/project contracts.
- Do not merge Go code into `musu-rs` now and do not bundle crawler/marketer/email tooling into the first Microsoft Store package.

Audit note:

- `nurikun` correctly keeps outbound delivery operations out of MCP.
- Before any MUSU dashboard integration, fix or wrap `watch` so mailbox send failures are persisted as failed instead of leaving a pre-saved `sent` row.

Canonical doc:

- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
