# API Mega List research for MUSU

Date: 2026-06-13
Source repo: https://github.com/cporter202/API-mega-list
Local snapshot: `docs/vendor/API-mega-list`
Snapshot commit: `f7a3511f6eb0d46ff0d6deb7b3c792ff9bdc4ed5`

## Verdict

This repository is useful as a discovery index, not as a trusted API catalog and not as a dependency to embed into MUSU.

The practical value for MUSU is the market signal: users want many task-specific connectors, especially MCP servers, browser automation, documentation search, web search, Slack/Google-style productivity tools, and OpenAPI-to-MCP conversion. The direct product risk is also clear: a large share of the catalog is scraping, lead generation, social-media extraction, downloader, proxy, bypass, and similar tooling. Shipping those as first-class MUSU features would weaken trust, increase legal/ToS exposure, and make MUSU feel like an automation spam toolbox instead of a dependable personal machine mesh.

## Evidence from the snapshot

The top-level README claims `10,498 ready-to-use APIs`, `18 categories`, and `Last Updated 2025-12-09`.

The generator script identifies the source as the Apify Store API and states that links include affiliate tracking. The fetcher script hardcodes `AFFILIATE_PARAM = '?fpr=p2hrc6'`.

No top-level `LICENSE`, `COPYING`, or `NOTICE` file was found in the cloned snapshot. Treat the repository contents as all-rights-reserved unless proven otherwise. Do not copy the catalog wholesale into MUSU docs, UI, fixtures, or shipped assets.

Quantitative scan:

| Signal | Count |
| --- | ---: |
| Parsed table rows across README files | 52,010 |
| Apify links | 52,010 |
| Links with referral parameter | 52,010 |
| Unique entry names | 9,327 |
| Duplicate-name groups | 9,193 |

Category README row counts:

| Category | Rows |
| --- | ---: |
| agents | 697 |
| ai | 1,208 |
| automation | 4,825 |
| business | 2 |
| developer-tools | 2,652 |
| ecommerce | 2,440 |
| integrations | 890 |
| jobs | 848 |
| lead-generation | 3,452 |
| mcp-servers | 131 |
| news | 590 |
| open-source | 768 |
| other | 1,297 |
| real-estate | 851 |
| seo-tools | 710 |
| social-media | 3,268 |
| travel | 397 |
| videos | 979 |

Risk keyword scan across README files:

| Term | Matches |
| --- | ---: |
| scraper | 34,872 |
| download | 4,032 |
| lead | 3,844 |
| email | 3,631 |
| instagram | 2,802 |
| linkedin | 2,622 |
| tiktok | 2,038 |
| phone | 1,640 |
| twitter | 1,466 |
| proxy | 1,096 |
| telegram | 290 |
| bypass | 274 |
| stealth | 176 |
| captcha | 124 |
| password | 46 |
| brute | 6 |

MUSU-relevant keyword scan:

| Term | Matches |
| --- | ---: |
| MCP | 645 |
| GitHub | 323 |
| Playwright | 282 |
| Browser | 264 |
| n8n | 142 |
| Security | 140 |
| Documentation | 111 |
| Docs | 72 |
| Web Search | 68 |
| Slack | 66 |
| Gmail | 62 |
| Google Drive | 26 |
| OpenAPI | 20 |
| Notion | 18 |
| Tavily | 18 |
| CVE | 14 |
| Google Calendar | 12 |
| Jira | 12 |
| Supabase | 10 |
| Home Assistant | 6 |
| Firecrawl | 6 |
| Microsoft Learn | 4 |
| Linear | 1 |

## What MUSU should learn from it

Users do not want a blank automation box. They want a cockpit that can discover, install, run, verify, and recover useful tools on their own machines. The high-value direction is not "add 10,000 APIs"; it is "make the first 20 trusted connectors feel inevitable."

MUSU should treat external tool catalogs with a trust gate:

| Tier | Meaning | Product behavior |
| --- | --- | --- |
| Tier 0 | MUSU local built-ins: fleet, terminal, files, browser, local MCP, private mesh | Enabled by default, audited, offline-first |
| Tier 1 | Official/open-source connectors with clear license and maintained source | Curated install, visible permissions, regression-tested |
| Tier 2 | User-authorized cloud APIs such as Slack, GitHub, Google, Notion | Explicit OAuth/API-key flow, scoped permissions, revocation UI |
| Tier 3 | Marketplaces and hosted actors such as Apify entries | Discovery only, disabled by default, sandboxed, cost/ToS/privacy warning |
| Blocked | Credential theft, spam, evasion, bypass, view generation, unauthorized scraping/downloading | Not recommended and not surfaced as first-class MUSU workflows |

## Concrete MUSU opportunities

1. Connector registry

MUSU needs a local, curated registry rather than an untrusted mega-list. Each connector record should include name, category, source URL, license, trust tier, required secrets, data egress, cost model, install mode, health check, and uninstall/revoke instructions.

2. MCP quality gate

The catalog contains MCP validators, stress testers, and tester clients. MUSU should internalize this concept: every MCP connector shown in the cockpit should have a `musu mcp verify` path that checks schema validity, tool list stability, timeout behavior, auth behavior, and safe error reporting.

3. OpenAPI-to-MCP path

The OpenAPI-to-MCP signal is directly useful. MUSU should support "give me an OpenAPI spec, turn it into a local MCP connector, and run a proof call" as a guided flow. This is more defensible than embedding random hosted actors.

4. Documentation/search connectors

Docs, Microsoft Learn, n8n, Docfork-style tools, Tavily/Firecrawl/Exa-style search, and RAG browser tools point to a core S-tier workflow: MUSU should let a user ask a machine to research with current docs and then write/run/verify locally. These should be curated via official sources or explicit user API keys, not blind Apify wrappers.

5. Browser automation

The Playwright/browser signal is strong, but MUSU already has a local-first desktop angle. The correct implementation is a local browser automation connector with proofs, screenshots, logs, and retry, not a default dependency on hosted browser actors.

6. Productivity connectors

Slack, Google Calendar, Gmail, Drive, Notion, Jira, Linear, GitHub, Supabase, Home Assistant, and WordPress are useful only if permissions are transparent. They belong in an optional "Connect work apps" layer, not in MUSU's private mesh core.

## Design implications for S-tier MUSU

The cockpit should not ask users to browse a catalog. It should infer the missing connector from the order:

- User says "summarize yesterday's Slack decision and open a task" -> MUSU says Slack and task tracker are not connected, shows required scopes, then installs/verifies.
- User says "check this repo against current docs" -> MUSU routes to official docs/search connector plus local git/filesystem connector.
- User says "run this on studio-pc" -> MUSU uses private mesh and returns route proof, not a cloud actor.
- User says "scrape 10k LinkedIn profiles" -> MUSU should warn about ToS/privacy risk and not present it as a recommended workflow.

This makes MUSU feel like a trustworthy operator, not a random API marketplace.

## Required architecture before importing any catalog data

Add a connector registry contract before productizing anything from this research:

```json
{
  "id": "github-official",
  "name": "GitHub",
  "category": "developer-tools",
  "trustTier": 2,
  "source": "official",
  "license": "n/a-service-api",
  "installMode": "oauth-or-token",
  "requiredSecrets": ["GITHUB_TOKEN"],
  "dataEgress": ["github.com"],
  "capabilities": ["issues", "pull_requests", "repositories"],
  "healthCheck": "list_authenticated_user",
  "proofRequired": true,
  "enabledByDefault": false
}
```

Minimum gate for every connector:

- License/source provenance is known.
- Required secrets are explicit.
- Data egress is explicit.
- The connector has a health check.
- The connector has a proof artifact after first successful use.
- Retry preserves the original order, target, connector, and input payload.
- Failure surfaces the actual cause and does not silently fall back to another machine or connector.

## Near-term recommendation

Do not integrate API-mega-list directly.

Use it to seed a manually reviewed MUSU connector shortlist:

1. Local browser automation
2. OpenAPI-to-MCP generator
3. MCP validator/stress tester
4. Docs/search connector using official or user-key-backed providers
5. GitHub connector
6. Slack connector
7. Google Calendar/Gmail/Drive connector
8. Notion/Jira/Linear connector
9. Supabase/Postgres read-only connector
10. Home Assistant connector

The product win is not breadth. It is verified usefulness: MUSU should install a connector, prove it works, show what it can access, run the user's order on the right machine, and make retry deterministic.

## Follow-up snapshot: `cporter202/scraping-apis-for-devs`

Date checked: 2026-06-14
Source repo: https://github.com/cporter202/scraping-apis-for-devs
Local snapshot checked this pass: `F:/workspace/musu-bee/_external_research/scraping-apis-for-devs`
Earlier project snapshot reference: `external-research/scraping-apis-for-devs`
Snapshot commit: `8d3f03d15293077576cdb870925a5495a8414a7d`
Current recheck: 2026-06-14, same commit
`2026-01-20T12:54:18-05:00 8d3f03d Merge branch 'main' of https://github.com/cporter202/scraping-apis-for-devs`.

Verdict: same product lesson, stronger warning. This repo is not a MUSU dependency candidate. It is an Apify Store affiliate catalog generated from public actor metadata, not a vetted MCP/server implementation set. MUSU should not copy the README tables, descriptions, or referral links. If MUSU ever needs this class of discovery, it should query and normalize the official Apify Store API directly, keep entries disabled by default, and run the same connector trust gate as every other external integration.

Observed facts from the local snapshot:

| Signal | Value |
| --- | ---: |
| Top-level claimed APIs | 2,622 |
| Top-level claimed categories | 17 |
| Top-level claimed last updated | 2025-12-09 |
| Latest git commit checked | 2026-01-20 `8d3f03d1529` |
| Category README files | 17 |
| `mcp-servers` entries | 28 |
| Category table rows by pipe-row count | 2,622 |
| Category table rows with `?fpr=p2hrc6` | 2,622 |
| Unique category URLs after removing `?fpr=p2hrc6` | 2,622 |
| Duplicate category URLs | 0 |
| Strict regex-parsed table rows | 2,594 |
| Parsed rows including top-level README duplication | 6,753 |
| Top-level README Apify links | 4,133 |
| Top-level README links with referral parameter | 4,132 |
| Top-level license file | none found |

Generation/provenance notes:

- `settings/fetch_apify_actors.js` fetches from `api.apify.com/v2/store`.
- The generator hardcodes affiliate tracking as `?fpr=p2hrc6`.
- `settings/filter_scraping_apis.js` keeps entries by keyword matching terms such as `scrape`, `crawler`, `download`, `fetch`, and `parser`.
- Apify's official Store API already exposes a reduced `agent` response shape intended for LLM consumers and has an `includeUnrunnableActors` safety filter that defaults to excluding actors that are not safe to run automatically.
- The strict parser missed 28 rows because some generated Markdown entries contain table-breaking punctuation/formatting. This reinforces that the repo is not a schema-stable connector registry.
- The MCP category includes useful signals such as Markdownify, RAG Browser, Slack MCP, Tavily MCP, WordPress MCP, Google Maps MCP, Google Search MCP, and Puppeteer MCP, but mixed with downloaders, social scraping, and pay-per-result actors.

MUSU policy result:

- Do not import the README tables, links, descriptions, or generated category files into shipped MUSU assets.
- Do not present Apify marketplace entries as trusted MUSU connectors.
- Treat marketplace and affiliate catalogs as discovery-only inputs behind an explicit warning.
- Only promote a connector after independent review of source, license/terms, required secrets, data egress, cost, health check, proof artifact, retry determinism, and failure semantics.
- Prefer official-source ingestion over third-party README snapshots. For Apify, that means `GET /v2/store` with the minimal `agent` response shape and default runnable-actor filtering, followed by MUSU's own risk scoring and user-visible cost/data-egress warnings.

Concrete impact already reflected in Cockpit:

- The connector review gate recognizes `github.com/cporter202/api-mega-list` and `github.com/cporter202/scraping-apis-for-devs` as generated marketplace catalog indexes.
- The UI classifies those sources as blocked/warning discovery inputs: MUSU will not import them or use them as connector proof sources.
- Curated connector cards remain limited to local/browser/docs/OpenAPI/MCP-validator and explicit user-owned credential flows.

Implementation evidence checked on 2026-06-14:

- `musu_get_connector_policy` and `musu_run_connector_health_check` are exposed in the MCP tool list.
- The route tests include explicit cases for `https://github.com/cporter202/scraping-apis-for-devs` and its raw README URL.
- Those tests assert `risk_profile = marketplace_catalog_index` and prove the health checker blocks the URL before fetch.
- The desktop shell contract includes the connector policy card, review form, curated registry, proof plan, proof run controls, and `blocked-warning` styling.

S-tier design rule:

MUSU should not win by having the largest API list. MUSU should win by making a small number of trusted connectors feel operationally inevitable: install, prove, run on the selected machine, record evidence, and retry the same payload without silently changing target or connector.
