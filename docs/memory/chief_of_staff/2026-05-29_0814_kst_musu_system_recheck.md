# CoS Memory Note - musu-system Recheck (2026-05-29 08:14 KST)

## Durable Facts

- `yellowhama/musu-system` remains the canonical Go monorepo for `core`, `crawl-ai`, `marketer`, and `nurikun`.
- Latest verified monorepo HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` (`nurikun/v0.3.1`).
- Split repo HEADs remain unchanged/reference state:
  - `musu-crawl-ai`: `f94b79b1cd8b81fd320e504318ea7dfd61d57596`
  - `musu-marketer`: `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`
  - `musu-nurikun`: `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`
- Latest branch CI on `musu-system` remains green: GitHub Actions run `26587103682`.
- Local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun` from `F:\workspace\_external\musu-system`.

## Product Decision

- Integration value is high, but do not merge `musu-system` into `musu-rs` and do not bundle it into the first Microsoft Store desktop package.
- Integrate later through optional MCP/CLI/bridge adapters and shared wiki/project contracts.
- Priority order remains:
  1. `crawl-ai` for knowledge/wiki ingestion
  2. `marketer` for grounded launch/campaign drafting
  3. `nurikun` for gated support and opt-in email operations
  4. `core` concepts mirrored only where useful

## Surviving Caveats

- MUSU-side registration must provide explicit cwd, wiki root, project, model, and env context.
- `nurikun watch` still records outbound status as `sent` before mailbox `Send` returns; fix or wrap this before any MUSU dashboard integration.
- `nurikun` delivery operations should remain CLI-only or human-approved; MCP should expose safe list/status/subscribe/suppress operations first.
