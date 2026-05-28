# CoS Memory Note - musu-system Current Recheck (2026-05-29 07:52 KST)

Facts:

- `yellowhama/musu-system` HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` (`nurikun(v0.3.1): block placeholder sender_identity from sending`).
- GitHub shows `musu-system` as public, pushed at 2026-05-29 01:15:45 KST, with 155 commits and top-level `core`, `crawl-ai`, `deploy`, `docs`, `marketer`, and `nurikun`.
- Split repo HEADs remain transition/reference state: `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun` from `F:\workspace\_external\musu-system`.
- Latest remote monorepo CI run `26587103682` and GHCR publish run `26587105434` are green.

Corrections:

- Older notes that say MCP tool schemas are empty are stale for current `musu-system` HEAD. `crawl-ai`, `marketer`, and `nurikun` now declare tool arguments with MCP schema helpers.
- Older notes that say marketer/nurikun MCP invocations fail only because DB parent dirs are missing are stale for current HEAD. Both DB layers now create parent dirs before opening SQLite.
- The remaining MUSU integration caveat is adapter context, not schema: MUSU registration must pass or wrap working directory, wiki root, project, model, and env settings.

Decision:

- Integration value remains high, but keep the boundary as MCP/CLI/bridge adapter.
- Do not merge Go code into `musu-rs` now.
- Do not bundle `crawl-ai`, `marketer`, or `nurikun` into the first Microsoft Store desktop package.
- Treat `musu-system` as canonical over the older split repos.

Audit note:

- `nurikun` correctly keeps delivery operations (`watch`, `campaign`, `serve`) out of MCP.
- `nurikun watch` still needs send-failure persistence fixed or wrapped before dashboard integration because auto-send saves outbound status as `sent` before mailbox `Send` returns.

Canonical doc:

- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
