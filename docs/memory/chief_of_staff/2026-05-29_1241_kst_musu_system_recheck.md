# CoS Memory - musu-system Recheck

2026-05-29 12:41 KST recheck of `yellowhama/musu-system` kept the integration verdict unchanged.

- Canonical repo: `yellowhama/musu-system`, not the older split repos.
- Monorepo HEAD: `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs remain unchanged: `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Active service tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Latest monorepo CI run `26587103682` and GHCR publish run `26587105434` are still successful.
- Local `go test ./...` and `go vet ./...` passed in `core`, `crawl-ai`, `marketer`, and `nurikun` from `F:\workspace\_external\musu-system`.
- Integration value is high, but the integration mode remains MCP/CLI/bridge adapter first. Do not merge this Go stack into `musu-rs` now and do not bundle it into the first Microsoft Store desktop package.
- First candidate: `crawl-ai` as optional knowledge/wiki ingestion. Later candidates: `marketer` for launch campaigns, `nurikun` for gated support/opt-in ops.
- Risk to preserve: `nurikun` delivery operations remain outside MCP and should stay human-approved; `watch` send-failure persistence must be fixed or wrapped before dashboard integration.
