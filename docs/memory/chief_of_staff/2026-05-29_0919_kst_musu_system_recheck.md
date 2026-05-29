# CoS Memory Note - musu-system Recheck (2026-05-29 09:19 KST)

## Durable Facts

- `yellowhama/musu-system` remains the canonical Go monorepo for `core`, `crawl-ai`, `marketer`, and `nurikun`.
- Latest verified monorepo HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs remain unchanged/reference state:
  - `musu-crawl-ai`: `f94b79b1cd8b81fd320e504318ea7dfd61d57596`
  - `musu-marketer`: `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`
  - `musu-nurikun`: `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`
- Active monorepo tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Latest monorepo remote runs remain green: CI run `26587103682` and GHCR publish run `26587105434`.
- Local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun` from `.local-build\external\musu-system`.

## Product Decision

- Integration value is high.
- Do not merge `musu-system` into `musu-rs`.
- Do not bundle `crawl-ai`, `marketer`, or `nurikun` into the first Microsoft Store desktop package.
- First integration should be optional MCP/CLI/bridge registration, with `crawl-ai` as the most useful first target for MUSU wiki/memory ingestion.

## Caveats

- Split repos should be treated as transition/reference repos unless a deliberate split-release reason appears.
- Future reports must check `musu-system` HEAD before repeating older split-repo observations.
- MUSU-side adapters still need explicit cwd, wiki root, project, model, and env handling.
- `nurikun watch` send-failure persistence remains the main code caveat before dashboard integration.
