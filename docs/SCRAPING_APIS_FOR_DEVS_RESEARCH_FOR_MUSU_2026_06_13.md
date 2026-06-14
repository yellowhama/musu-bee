# Scraping APIs for Developers audit for MUSU

Date: 2026-06-13
Source repo: https://github.com/cporter202/scraping-apis-for-devs
Local research clone: `F:/workspace/musu-bee/external/scraping-apis-for-devs`
Current re-check clone: `F:/workspace/reference-repos/scraping-apis-for-devs`
Current workspace clone: `F:/workspace/musu-bee/research/scraping-apis-for-devs`
Snapshot commit: `8d3f03d15293077576cdb870925a5495a8414a7d`
Snapshot commit date: 2026-01-20
Re-verified: 2026-06-14 KST

## Verdict

Do not integrate this repository directly into MUSU.

This is a generated Apify Store catalog with affiliate links, not a curated connector registry. It is useful as market/risk research only: users clearly want task-specific extractors, MCP servers, browser automation, website-to-markdown, RAG browser, OpenAPI/API wrappers, and productivity connectors. But the dominant operating model is hosted scraping/downloading/lead-generation actors with unclear provenance, unclear licensing, third-party data egress, metered cost, and platform ToS/privacy risk.

MUSU should treat the repo as `marketplace_catalog_index`: discovery-only, never a proof source, never a shipped connector source, never copied into product UI as a trusted registry.

## Evidence From The Snapshot

GitHub metadata from `gh repo view cporter202/scraping-apis-for-devs` and the GitHub repository API:

| Signal | Value |
| --- | --- |
| Stars | 3,631 |
| Forks | 663 |
| GitHub license | `null` |
| Default branch | `main` |
| Pushed at | 2026-01-20T17:54:18Z |
| Updated at | 2026-06-13T22:29:06Z |

Repository structure:

| Signal | Value |
| --- | ---: |
| Top-level category folders | 17 |
| Parsed category README rows | 2,622 |
| Unique Apify URLs after removing `?fpr=` | 2,622 |
| Rows with Apify links | 2,622 |
| Rows with affiliate parameter `?fpr=p2hrc6` | 2,622 |
| License/COPYING/NOTICE files found | 0 |

The README top section claims `2,622` APIs and `17` categories. The README footer still claims `10,498` APIs and `18` categories, so the repo should not be treated as internally self-consistent without re-scanning.

The README states the list is automatically generated from the Apify Store API and that all links include affiliate tracking. The generator script `settings/fetch_apify_actors.js` hardcodes `API_BASE_URL = 'api.apify.com'` and `AFFILIATE_PARAM = '?fpr=p2hrc6'`.

The 2026-06-14 local parser re-confirmed that all 2,622 category rows point to `apify.com` and all 2,622 include `fpr=` affiliate tracking. Risk keyword counts in category READMEs were also high: `scraper` 4,866, `download` 544, `email` 471, `facebook` 468, `instagram` 305, `linkedin` 273, `lead` 241, `downloader` 208, `phone` 138, `tiktok` 123, `proxy` 61, `bypass` 16.

The 2026-06-14 re-check clone in `F:/workspace/reference-repos/scraping-apis-for-devs` produced the same structural result: 17 category directories, 2,622 category table rows by pipe-row count, 2,622 Apify links, 2,622 affiliate-tagged links, and 2,622 unique Apify URLs after stripping the `fpr` parameter. `gh repo view` also still reports no GitHub license metadata.

The current workspace clone in `F:/workspace/musu-bee/research/scraping-apis-for-devs` confirms the same commit and no license file. A strict Markdown table parser matched 2,594 rows because 28 entries contain markdown/table formatting that breaks the simple regex, but the raw category table row count is still 2,622. Treat the repo as loosely generated Markdown, not as a schema-stable data source.

Category row counts in the current clone:

| Category | Rows |
| --- | ---: |
| agents | 250 |
| ai | 173 |
| automation | 218 |
| developer-tools | 172 |
| ecommerce | 147 |
| integrations | 191 |
| jobs | 167 |
| lead-generation | 80 |
| mcp-servers | 28 |
| news | 198 |
| open-source | 216 |
| other | 133 |
| real-estate | 130 |
| seo-tools | 159 |
| social-media | 73 |
| travel | 139 |
| videos | 148 |

## Official Apify Model Check

Apify's official docs describe Actors as serverless programs that take structured JSON input, run browser automation/scraping/data processing, and produce structured output. The API workflow is: run an Actor/task, poll the run, then fetch dataset/key-value-store results. Store Actors can be monetized with pay-per-event, pay-per-usage, or rental models, and the Store pages define pricing/events.

The official Store API documentation also matters for MUSU's design. `GET /v2/store` supports search, pagination, category, username, pricing model, and `allowsAgenticUsers` filters; `responseFormat=agent` returns a reduced LLM-oriented field set; and `includeUnrunnableActors` defaults to `false`, excluding actors Apify does not consider safe to run automatically. That means MUSU should never depend on a third-party README snapshot when the official API already exposes safer discovery controls.

Sources:

- https://docs.apify.com/platform/actors
- https://docs.apify.com/api/v2
- https://docs.apify.com/api/v2/store-get
- https://docs.apify.com/academy/api/run-actor-and-retrieve-data-via-api
- https://docs.apify.com/platform/actors/publishing/monetize
- https://docs.apify.com/platform/actors/running/actors-in-store

Product implication: Apify is a hosted third-party execution and billing environment. It can be an optional user-owned external connector later, but it is not compatible with MUSU's default promise of local-first, self-contained, proof-producing machine control.

## MUSU Product Decision

MUSU should not become "one click to run random scraping APIs." That would make the product feel like a spam/scraping toolbox and undermine trust.

Use this repo only to sharpen MUSU's connector policy:

- Block direct catalog import.
- Block Apify/affiliate actor links as connector proof sources.
- Block generated GitHub catalog indexes such as `cporter202/scraping-apis-for-devs` and `cporter202/API-mega-list` as connector proof sources.
- Require official source or reviewable source, license/provenance, explicit secrets, explicit egress, cost model, health check, proof artifact, and deterministic retry before a connector is recommended or run.
- Prefer local browser extraction, website-to-markdown with source provenance, document/PDF extraction, official docs/search, OpenAPI-to-MCP generation, MCP validation, and user-owned GitHub/Slack/Google/Notion/Jira/Linear credentials.

## Implementation Update

MUSU MCP connector policy now classifies generated marketplace catalogs as `marketplace_catalog_index`.

The new behavior:

- `musu_get_connector_policy` returns `blocked_or_explicit_warning` for `https://github.com/cporter202/scraping-apis-for-devs`.
- `musu_run_connector_health_check` blocks that repo as a `source_url` before network fetch when someone tries to use it as connector proof.
- Raw README URLs such as `https://raw.githubusercontent.com/cporter202/scraping-apis-for-devs/main/README.md` are also blocked before fetch; they cannot bypass the GitHub catalog rule by looking like ordinary Markdown content.
- The desktop connector gate shows the same source as `marketplace_catalog_index` instead of treating it as an ordinary reviewable GitHub URL.
- Existing Apify actor URLs remain blocked before fetch.
- Safe keywords such as "website-to-markdown" cannot override marketplace/affiliate/catalog source risk.

This keeps MUSU's line precise: external API catalogs can inform research, but MUSU only ships curated, proof-producing, user-controlled connectors.

## 2026-06-14 workspace URL re-check

User-supplied URL rechecked: `https://github.com/cporter202/scraping-apis-for-devs`.

Local path checked this pass: `F:/workspace/musu-bee/research/scraping-apis-for-devs`.

The clone was already present and fetch-clean against `origin/main` at `8d3f03d15293077576cdb870925a5495a8414a7d`. I did not reclone or overwrite it.

Strict category parsing result:

| Signal | Value |
| --- | ---: |
| Category README rows | 2,622 |
| Unique category URLs | 2,622 |
| Unique category names | 2,383 |
| Rows hosted on `apify.com` | 2,622 |
| Rows containing `fpr=` affiliate tracking | 2,622 |
| Category folders | 17 |

The root README plus category READMEs contain duplicate presentations of the same catalog, so naive repository-wide table parsing returns inflated counts. The reliable product reading is the category-folder count above: this is a 2,622-entry Apify actor catalog, not a general API repository.

MUSU product decision after re-check:

- Do not vendor this repository into product code.
- Do not show its README tables in MUSU as a trusted connector marketplace.
- Do not treat its `mcp-servers-apis-28` folder as vetted MCP server inventory; those entries are hosted Apify actor pages, not reviewed local MCP implementations.
- Use the repo only as a negative-space market signal for connector demand: website-to-markdown, RAG browser, official docs search, OpenAPI-to-MCP, browser automation, Slack/WordPress/GitHub-style work connectors.
- If MUSU ever supports Apify, it must be an optional user-owned cloud connector with explicit Apify account/API key, pricing display, data-egress warning, ToS warning, and proof artifact. It must not be part of the default local-first MUSU promise.

Workspace hygiene note:

Multiple snapshots of this catalog currently exist under research/vendor-style paths in the workspace. They should be treated as archived research evidence only. Future implementation must reference the MCP connector policy code and curated registry, not these copied README tables.

## 2026-06-14 direct URL revalidation

User-supplied URL revalidated directly: `https://github.com/cporter202/scraping-apis-for-devs`.

Local clone: `F:/workspace/musu-bee/research/scraping-apis-for-devs`.

Remote state after `git fetch --prune origin`:

| Signal | Value |
| --- | --- |
| Local HEAD | `8d3f03d15293077576cdb870925a5495a8414a7d` |
| `origin/main` | `8d3f03d15293077576cdb870925a5495a8414a7d` |
| Commit date | 2026-01-20 12:54:18 -0500 |
| Commit subject | `Merge branch 'main' of https://github.com/cporter202/scraping-apis-for-devs` |

Current category scan:

| Signal | Value |
| --- | ---: |
| Category directories | 17 |
| Category table rows | 2,622 |
| Rows pointing to `apify.com` | 2,622 |
| Rows containing `fpr=` affiliate tracking | 2,622 |
| License/COPYING/NOTICE files in git index | 0 |

The repo's own generator confirms the provenance: `settings/fetch_apify_actors.js` targets `api.apify.com`, fetches `/v2/store`, and appends `fpr=p2hrc6` affiliate tracking to generated actor URLs.

Current MUSU enforcement was also rechecked:

| Check | Result |
| --- | --- |
| Desktop connector gate blocks `https://github.com/cporter202/scraping-apis-for-devs` as `marketplace_catalog_index` | PASS |
| Desktop connector gate blocks raw README URL bypass | PASS |
| MCP connector health check blocks generated catalog indexes before fetch | PASS |
| MCP connector policy classifies generated Apify catalog repos as discovery-only | PASS |
| `npm run test:tauri-shell` | 35/35 PASS |
| `npx tsx --test src/app/api/mcp/route.test.ts` | 41/41 PASS |

Verdict remains unchanged: this repository is useful as market signal only. MUSU must not vendor it, recommend it as a trusted connector registry, or use it as connector proof. If a future Apify integration is added, it must be a separate optional user-owned cloud connector with explicit account/API-key setup, cost disclosure, data-egress warning, ToS warning, health proof, and deterministic retry evidence.

## 2026-06-14 external clone recheck

User-supplied URL rechecked again: `https://github.com/cporter202/scraping-apis-for-devs`.

Fresh local clone for this pass: `F:/workspace/scraping-apis-for-devs`.

Remote/local state:

| Signal | Value |
| --- | --- |
| HEAD | `8d3f03d15293077576cdb870925a5495a8414a7d` |
| Commit date | 2026-01-20 12:54:18 -0500 |
| Commit subject | `Merge branch 'main' of https://github.com/cporter202/scraping-apis-for-devs` |
| Top-level license file | none found |

Fresh clone scan:

| Signal | Value |
| --- | ---: |
| Category directories | 17 |
| Category README table rows by raw pipe-row count | 2,622 |
| Strictly parseable actor rows | 2,594 |
| Unique strictly parsed Apify actor paths | 2,594 |
| Root README `apify.com` links | 4,131 |
| Root README links with `fpr=p2hrc6` | 4,132 |

The strict parser mismatch is a data-quality warning, not evidence of extra useful structure. Some entries contain Markdown/table formatting that breaks simple row parsing, while the raw category row counts still match the repo's claimed 2,622 category entries. The root README has inflated link counts because it repeats catalog material and non-table links.

The generator remains the controlling evidence. `settings/fetch_apify_actors.js` fetches from `api.apify.com`, walks `/v2/store`, and appends affiliate tracking (`fpr=p2hrc6`) to actor URLs. The repo is therefore a generated Apify Store affiliate catalog, not a connector implementation, not an SDK, and not a license-cleared source bundle.

MUSU decision after the fresh clone:

- Keep blocking this repo and its raw README URLs as `marketplace_catalog_index`.
- Do not import the list into MUSU UI as a trusted marketplace.
- Do not let LLM prompts treat these rows as approved tools.
- Use the repo only to prioritize MUSU-native jobs users clearly want: website-to-markdown, RAG browser, browser automation, official docs/search, GitHub/repo intelligence, PDF extraction, video transcript extraction, and Slack/WordPress-style business connectors.
- Build those as curated MUSU connectors with explicit source, license/provenance, secrets, egress, cost, health check, retry semantics, and proof artifacts.

Implementation implication: the next useful MUSU work is not "add Apify." It is a connector registry contract that separates `native`, `official_api`, `user_owned_cloud`, `open_source_adapter`, and `blocked_marketplace_catalog`, then makes the desktop/LLM surfaces refuse unverified marketplace catalogs before execution.

## 2026-06-14 live URL check from external workspace clone

User-supplied URL: `https://github.com/cporter202/scraping-apis-for-devs`.

External clone checked this pass: `F:/workspace/scraping-apis-for-devs`.

Remote/local state after `git fetch --all --prune`:

| Signal | Value |
| --- | --- |
| HEAD | `8d3f03d15293077576cdb870925a5495a8414a7d` |
| `origin/main` | `8d3f03d15293077576cdb870925a5495a8414a7d` |
| Commit subject | `Merge branch 'main' of https://github.com/cporter202/scraping-apis-for-devs` |
| Top-level files | `README.md`, `FOLLOW_CREATOR.md`, `settings/*` |
| Top-level license/COPYING/NOTICE file | none found |

GitHub page check:

| Signal | Value |
| --- | --- |
| Repository visibility | public |
| Stars shown by GitHub page | about 3.6k |
| Forks shown by GitHub page | 663 |
| Releases | none published |
| Language panel | JavaScript 100% |

Local content check:

| Signal | Value |
| --- | ---: |
| Category directories with README tables | 17 |
| Category table rows | 2,622 |
| Rows pointing to `apify.com` | 2,622 |
| README top claimed APIs | 2,622 |
| README top claimed categories | 17 |
| README footer claimed APIs | 10,498 |
| README footer claimed categories | 18 |

Interpretation:

- The repository is internally inconsistent at the root README level: top summary says `2,622 / 17`, footer says `10,498 / 18`.
- The category files are consistent with `2,622` entries, so `2,622 Apify actor links` is the usable snapshot count.
- The repo has no visible license file in the clone, so MUSU must not copy or redistribute its generated catalog content.
- The `settings/fetch_apify_actors.js` script shows the source model: fetch Apify Store entries from `api.apify.com/v2/store`, then add affiliate tracking to actor URLs.
- Official Apify docs confirm Apify is a hosted Actor/API platform: Actors run on Apify, produce datasets/key-value outputs, and can be run through the Apify API. This is compatible only with an optional user-owned cloud connector, not with MUSU's default local-first/private-machine promise.

MUSU action:

- Keep `cporter202/scraping-apis-for-devs` classified as `marketplace_catalog_index`.
- Keep the raw GitHub README URL blocked as the same risk class.
- Do not use this repo as an MCP prompt tool list.
- If MUSU later supports Apify, implement it from official Apify API/docs with user API key, cost disclosure, data-egress warning, health check, proof artifact, and deterministic retry. Do not import this affiliate README catalog.

## 2026-06-14 workspace clone recheck for connector gating

User-supplied URL rechecked: `https://github.com/cporter202/scraping-apis-for-devs`.

Fresh workspace clone for this pass: `F:/workspace/musu-bee/research/external/scraping-apis-for-devs`.

Remote/local state:

| Signal | Value |
| --- | --- |
| HEAD | `8d3f03d15293077576cdb870925a5495a8414a7d` |
| Commit subject | `Merge branch 'main' of https://github.com/cporter202/scraping-apis-for-devs` |
| Top-level license/COPYING/NOTICE file | none found |
| Product package files | none found (`package.json`, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, `go.mod`, Dockerfile all absent) |

Workspace clone scan:

| Signal | Value |
| --- | ---: |
| Markdown files | 20 |
| Category directories | 17 |
| Category README table rows | 2,622 |
| Total URLs in Markdown files | 33,225 |
| URLs pointing to `apify.com` | 32,935 |
| URLs containing `fpr=` affiliate tracking | 32,904 |
| URLs pointing to `github.com` | 29 |

Generator/provenance check:

- `settings/fetch_apify_actors.js` fetches Apify Store data from `api.apify.com` using `/v2/store`.
- The same script appends `fpr=p2hrc6` to generated actor URLs.
- `settings/filter_scraping_apis.js` is a Markdown filter over generated README rows, not a connector implementation.

MUSU decision after this clone:

- This repository is not code MUSU can embed as a scraping layer.
- It is not a license-cleared connector registry because no top-level license/COPYING/NOTICE file was present in the clone.
- It is not proof that an API is safe, legal, maintained, or compatible with MUSU's local-first/private-machine promise.
- It is market research only. MUSU can use it to spot demand categories, but the runtime must keep treating this URL and raw README URLs as `marketplace_catalog_index`.
- If a user asks MUSU to use Apify, the correct product shape is an optional `user_owned_cloud` connector built from official Apify API docs, with explicit account/API-key setup, cost disclosure, data-egress warning, ToS warning, health proof, deterministic retry payload, and audit artifact. The affiliate catalog itself must not become an LLM tool list.

Implementation update:

- The connector gates now classify the broader pattern, not only the `cporter202` repo. Generic GitHub/raw README URLs such as `awesome-scraping-apis`, `apify-actors-list`, `affiliate-api-list`, and hosted actor catalog/directory naming are blocked before fetch as `marketplace_catalog_index`.
- This keeps MUSU from laundering a new affiliate/generated catalog through `website-to-markdown` or MCP health checks merely because the owner/repo name changed.
