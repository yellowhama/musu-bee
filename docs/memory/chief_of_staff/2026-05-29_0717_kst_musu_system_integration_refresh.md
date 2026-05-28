# CoS Memory Note - musu-system Integration Refresh (2026-05-29 07:17 KST)

Facts:

- `yellowhama/musu-system` HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` (`nurikun(v0.3.1): block placeholder sender_identity from sending`).
- Split repo HEADs remain transition/reference state: `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Fresh `go test ./...` and `go vet ./...` passed in `core`, `crawl-ai`, `marketer`, and `nurikun` under `F:\workspace\_external\musu-system`.
- Latest remote `musu-system` CI is green: GitHub Actions run `26587103682`.

Decision:

- Integration value remains high, but the integration boundary remains MCP/CLI/bridge adapter, not Rust-core merge.
- Do not bundle `crawl-ai`, `marketer`, or `nurikun` into the first Microsoft Store desktop package.
- Treat `musu-system` as canonical over the older split repos.

Audit notes:

- `nurikun` correctly keeps delivery ops (`watch`, `campaign`, `serve`) out of MCP.
- `nurikun watch` still needs send-failure persistence fixed or wrapped before dashboard integration; it saves `sent` before mailbox `Send` returns.
- `crawl-ai` and `marketer` MCP paths currently assume local defaults like `./wiki` and fixed model names; MUSU registration should provide explicit working directory/model settings or a wrapper adapter.

Launch-note filter:

- Keep the other-product launch memo only for narrow Store positioning, funnel/campaign tracking, and grounded promotion workflow.
- Do not reuse unrelated product names or old Microsoft packaging assertions without current re-verification.

Canonical doc:

- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
