# CoS Memory Note - musu-system Integration Assessment (2026-05-29 02:45 KST)

Facts:

- `yellowhama/musu-system` is now the current monorepo for:
  - `core`
  - `crawl-ai`
  - `marketer`
  - `nurikun`
- Split repos `musu-crawl-ai`, `musu-marketer`, and private `musu-nurikun` remain accessible but are older than the monorepo HEAD in this audit.
- Local `go test ./...` passed for all four `musu-system` modules.

Decision:

- Do not merge `musu-system` code into `musu-rs` now.
- Treat it as adjacent MUSU ecosystem tooling.
- Integrate through MCP/CLI/bridge adapters and shared wiki/project contracts.

Priority:

1. `crawl-ai` -> knowledge/wiki ingestion for CoS and agents.
2. `marketer` -> Store/blog/campaign drafting after package submission path is stable.
3. `nurikun` -> gated support/opt-in email ops only; safe MCP tools first, no autonomous outbound send in dashboard.
4. `core` -> keep as Go shared module; mirror concepts into Rust only when needed.

Store warning:

- Do not bundle crawler/marketer/email tools into the first Microsoft Store desktop package.
- They enlarge the policy/certification surface while the current objective is to prove the narrow Windows trusted install loop.

Canonical doc:

- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
