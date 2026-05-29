# musu-system Integration Assessment — 2026-05-29

**Date**: 2026-05-29
**Scope**: `yellowhama/musu-system`, `musu-crawl-ai`, `musu-marketer`, private `musu-nurikun`, and their fit with current `musu-bee` / `musu-rs`.

## Executive Verdict

`musu-system` has real integration value, but it should **not** be merged into the MUSU Rust core now.

Korean operator summary:

- 통합 가치는 높다. 특히 `crawl-ai`는 무수 wiki/memory ingestion, `marketer`는 출시/캠페인 산출물, `nurikun`은 support inbox와 opt-in 운영에 바로 연결될 수 있다.
- 그러나 지금 `musu-rs`나 첫 Microsoft Store 패키지 안으로 끌어오면 안 된다. 현재 Store/desktop beta의 핵심 증명은 "안전한 설치 + 로컬 runtime + single/multi-device task"이고, crawler/marketing/email은 정책/운영 표면을 불필요하게 넓힌다.
- 올바른 방향은 **MCP/CLI/bridge adapter로 붙이는 companion tool line**이다. `musu-system`은 무수의 machine-control substrate가 아니라, 무수 위에서 돌아가는 Brain/Voice/Hand 업무 앱 묶음으로 봐야 한다.

Best architecture:

- keep `musu-rs` as the machine/control/runtime layer
- keep `musu-system` as an adjacent Go application/tool layer
- integrate through MCP, CLI, bridge adapters, shared wiki paths, and dashboard surfaces
- avoid bundling the email/crawl/marketing stack into the first Microsoft Store desktop package

Reason:

The current MUSU desktop beta is trying to prove a narrow Windows trust/install loop. Pulling crawl, marketing, and email automation into the Store build would expand the certification and security surface at the worst possible time. The right move is to expose them as optional MUSU ecosystem tools after the Store path is stable.

## Repository Snapshot

Checked via local Git clone on 2026-05-29. Rechecked again at 2026-05-29 07:52 KST and 08:14 KST from `F:\workspace\_external\musu-system`; latest 11:55 KST recheck used `.local-build\external\musu-system`.

| Repo | HEAD | Time | State |
|---|---|---:|---|
| `yellowhama/musu-system` | `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` | 2026-05-29 01:06 KST | current monorepo |
| `yellowhama/musu-crawl-ai` | `f94b79b1cd8b81fd320e504318ea7dfd61d57596` | 2026-05-28 21:41 KST | legacy/reference split repo |
| `yellowhama/musu-marketer` | `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a` | 2026-05-28 21:41 KST | legacy/reference split repo |
| `yellowhama/musu-nurikun` | `4bed668f3b809cc9157ae8d28cce59b58ce8daa2` | 2026-05-28 21:41 KST | private legacy/reference split repo |

Fresh recheck on 2026-05-29 07:17 KST:

- `gh repo view` shows `musu-system` public and pushed at 2026-05-29 01:15:45 KST.
- `gh repo view` shows private `musu-nurikun` plus public `musu-marketer` and `musu-crawl-ai` still active and pushed around 2026-05-28 21:50 KST.
- Local analysis clones live under `F:\workspace\_external\`.
- `git log -1` for `musu-system` remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` (`nurikun(v0.3.1): block placeholder sender_identity from sending`).
- Latest GitHub Actions CI on `musu-system` passed for run `26587103682`.

Fresh recheck on 2026-05-29 07:52 KST:

- GitHub page shows `yellowhama/musu-system` as a public repo with 155 commits and top-level `core`, `crawl-ai`, `deploy`, `docs`, `marketer`, and `nurikun` folders.
- `git ls-remote https://github.com/yellowhama/musu-system.git HEAD refs/heads/main` still resolves to `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs still resolve to `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, and private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- `git ls-remote --tags` still shows active service tags `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Local `go test ./...` passed in `core`, `crawl-ai`, `marketer`, and `nurikun`.
- Local `go vet ./...` passed in the same four modules.
- Latest remote runs on the monorepo HEAD are green: CI run `26587103682` and GHCR publish run `26587105434`.

Fresh recheck on 2026-05-29 08:14 KST:

- `gh repo view` confirms `yellowhama/musu-system` is still public, default branch `main`, pushed at 2026-05-29 01:15:45 KST.
- `gh repo view` confirms `musu-crawl-ai` and `musu-marketer` are public split repos, while `musu-nurikun` is private; all three split repos still show the 2026-05-28 21:50 KST push window.
- `git ls-remote` confirms `musu-system` HEAD/main remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`; split repo HEADs remain `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, and `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Active monorepo service tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Latest branch CI on the monorepo HEAD remains green: run `26587103682`.
- Local `git fetch --all --tags --prune` left `F:\workspace\_external\musu-system` clean and aligned with `origin/main`.
- Local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun`.

Fresh recheck on 2026-05-29 09:19 KST:

- `git ls-remote https://github.com/yellowhama/musu-system.git HEAD` still resolves to `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs still resolve to `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, and private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Active monorepo service tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Latest remote runs on monorepo HEAD remain green: CI run `26587103682` and GHCR publish run `26587105434`.
- Local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun` from `.local-build\external\musu-system`.
- Conclusion unchanged: integration value is high, but the right first move is optional MCP/CLI/bridge integration, not Rust-core merge or first Store package bundling.

Fresh recheck on 2026-05-29 11:55 KST:

- GitHub public repo view still shows `yellowhama/musu-system` as public, default branch `main`, pushed at 2026-05-29 01:15:45 KST.
- `git ls-remote https://github.com/yellowhama/musu-system.git HEAD refs/heads/main` still resolves to `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.
- Split repo HEADs still resolve to `musu-crawl-ai` `f94b79b1cd8b81fd320e504318ea7dfd61d57596`, `musu-marketer` `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a`, and private `musu-nurikun` `4bed668f3b809cc9157ae8d28cce59b58ce8daa2`.
- Active monorepo service tags still resolve to `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun` from `.local-build\external\musu-system`.
- Conclusion unchanged: keep `musu-system` as optional ecosystem tooling; do not merge it into `musu-rs` and do not bundle it into the first Microsoft Store package.

Links:

- `https://github.com/yellowhama/musu-system`
- `https://github.com/yellowhama/musu-crawl-ai`
- `https://github.com/yellowhama/musu-marketer`
- `https://github.com/yellowhama/musu-nurikun` (private)

Interpretation:

- `musu-system` is the new source of truth.
- The three split repos remain useful as reference/transition mirrors, but should not be developed in parallel long-term.
- Monorepo README explicitly says the repo was consolidated from the four prior repos on 2026-05-28 and that legacy repos are kept as a short observation-window reference.
- Treat older agent notes that discuss only the split repos as stale unless they are reconciled against `musu-system` HEAD.
- Current monorepo release tags observed: `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- The split repos still resolve at the recorded HEADs, but `musu-system` already contains newer consolidated changes such as `nurikun(v0.3.1): block placeholder sender_identity from sending`.

## What `musu-system` Contains

`musu-system` is a Go workspace:

```text
core/      shared env, agent client, preflight probe
crawl-ai/  knowledge harvester + local wiki + MCP
marketer/  grounded campaign drafting + MCP + REST
nurikun/   compliant support/newsletter email operations + MCP-safe ops
deploy/    Docker Compose, Caddy, scheduler, GHCR image workflow
```

Conceptually it is a clean product line:

1. **Brain**: `crawl-ai` harvests and structures knowledge.
2. **Voice**: `marketer` drafts grounded campaigns.
3. **Hand**: `nurikun` works support inboxes and opt-in lists.

That maps well to MUSU's company/agent thesis, but it is an application layer, not the machine-control substrate.

## Verification

Local Go tests passed with the monorepo `go.work` modules tested one by one:

```powershell
foreach ($d in @('core','crawl-ai','marketer','nurikun')) {
  Push-Location $d
  go test ./...
  Pop-Location
}
```

Observed:

- `core`: agent/env/preflight tests passed
- `crawl-ai`: cmd, internal/agent, preflight, utils tests passed
- `marketer`: cmd, agent, bridge, preflight tests passed
- `nurikun`: cmd, agent, compliance, config, knowledge, policy, preflight tests passed

This is enough to treat the repo as a credible integration candidate.

The latest verification was run from `.local-build\external\musu-system` against HEAD `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.

2026-05-29 recheck:

- `musu-system`, `musu-crawl-ai`, `musu-marketer`, and private `musu-nurikun` all cloned successfully.
- 2026-05-29 `git ls-remote ... HEAD` confirmed the recorded HEADs are still current for all four repos.
- The split repos are behind the monorepo HEAD in this audit; treat them as transition/reference repos unless a deliberate split-release reason appears.
- Monorepo HEAD includes a newer `nurikun` compliance hardening commit: `nurikun(v0.3.1): block placeholder sender_identity from sending`.

2026-05-29 06:43 KST recheck:

- `go test ./...` passed again inside `core`, `crawl-ai`, `marketer`, and `nurikun`.
- `go vet ./...` passed inside the same four modules.
- `git ls-remote --tags https://github.com/yellowhama/musu-system.git` showed the active service tags are still `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`.
- Code audit spot-check found no evidence that `nurikun` exposes delivery operations through MCP; delivery remains CLI-only by design.

2026-05-29 07:17 KST recheck:

- `go test ./...` passed again in the monorepo modules: `core`, `crawl-ai`, `marketer`, and `nurikun`.
- `go vet ./...` passed again in all four modules.
- Latest remote CI for `yellowhama/musu-system` is green.
- This confirms the earlier integration verdict is still current, not stale split-repo information.

2026-05-29 07:52 KST recheck:

- `go test ./...` and `go vet ./...` passed again in all four modules from `F:\workspace\_external\musu-system`.
- The prior "MCP schema is empty" concern is stale for current HEAD. `crawl-ai`, `marketer`, and `nurikun` now declare MCP arguments with `WithString`, `WithNumber`, `Required`, and `Enum` where relevant.
- The prior SQLite cwd failure concern is partially closed for current HEAD. `marketer/internal/db` and `nurikun/internal/db` now create the parent DB directory before `sql.Open`.
- Remaining adapter concern is not MCP schema; it is MUSU-managed context: explicit working directory, wiki root, project, model, and env injection.

2026-05-29 08:14 KST recheck:

- HEADs, tags, and repo visibility remain unchanged from the 07:52 KST assessment.
- `go test ./...` and `go vet ./...` passed again in all four modules.
- Spot audit still supports the same boundary: `nurikun` exposes safe MCP operations only and keeps `watch`, `campaign`, and `serve` outside MCP.
- The surviving integration issue remains `nurikun watch` send-failure persistence plus MUSU-side adapter context management; no new blocker was found.

2026-05-29 09:19 KST recheck:

- HEADs, split repo references, and active service tags remain unchanged.
- Latest GitHub Actions CI and GHCR publish runs for the monorepo HEAD remain successful.
- `go test ./...` and `go vet ./...` passed again in all four modules.
- No new integration blocker was found. The stale-information risk is now mainly process risk: future reports must check `musu-system` first, then only use split repos as transition/reference context.

## Code Audit Notes

`musu-system` is not just a README wrapper. It has a coherent Go workspace, per-module tests, CI build/vet/race-test workflow, tag-triggered GHCR publishing, and a deploy bundle with Ollama, shared wiki volume, Caddy TLS profile, and optional scheduler.

Important observations:

- `crawl-ai` MCP exposes `fetch`, `search`, and `research` with declared schemas and required arguments. This is immediately useful for MUSU knowledge ingestion.
- `marketer` MCP exposes `draft_campaign` and `list_campaigns`; the REST server is still shallow (`/health` plus WIP endpoints), so MCP/CLI should be the first integration path.
- `nurikun` MCP exposes safe operations only: doctor, list/create list, subscribe, confirm subscriber, list subscribers, suppress, and message listing. It intentionally does not expose `watch`, `campaign`, or `serve`.
- `nurikun campaign` has send-time gates for confirmed/due subscribers, suppression checks, per-domain/per-run rate limiting, sender identity validation, `(광고)` labeling, footer, and `List-Unsubscribe`.
- `nurikun watch` can auto-send low-risk high-confidence inbound replies according to policy. That is useful, but it should remain behind explicit operator configuration and not become a default dashboard button.
- Current HEAD has already fixed the earlier MCP tool-parameter issue; do not repeat old split-repo reports that say the MCP tools have empty schemas.
- Current HEAD has already fixed the cheap SQLite `MkdirAll(parent)` failure in `marketer` and `nurikun`.
- Runtime state paths (`/var`, `/wiki`, `/oauth`, `/projects-*`, `.env`) are gitignored, and deploy docs explicitly keep Gmail OAuth material mounted read-only.

Audit concern:

- `nurikun watch` records outbound status as `sent` before mailbox `Send` returns. If send fails, the log reports failure but the stored row has already been saved as `sent`. This is acceptable for an adjacent prototype, but before any MUSU dashboard integration it should record `send_failed` or update the row after delivery success.
- The MCP surfaces are usable, but not yet ideal as a MUSU-managed adapter boundary. `crawl-ai` MCP currently starts from a local wiki default and model defaults, while `marketer` also assumes default model/context unless the operator supplies the right environment. Before MUSU registers these tools automatically, add explicit env/flag-driven model and wiki path contracts or wrap them with a MUSU-side adapter that supplies the right working directory, project, wiki root, and model settings.
- `marketer` has a useful MCP surface, but its REST API is not the primary integration path yet. Use CLI/MCP first; REST can follow after endpoint contracts become product-grade.

## Use Of The Cross-Product Launch Memo

The operator supplied a launch note written for a different product. Relevant parts to keep:

- Keep the Microsoft Store product narrow and trust-focused.
- Use Store/funnel metrics and campaign IDs for promotion measurement.
- Put launch copy through grounded, source-backed drafting.
- Separate "installable desktop trust channel" from broader ecosystem promotion.

Parts not to carry over:

- Do not reuse unrelated product names, screenshots, positioning, or HiveLink-specific P2P claims.
- Do not treat old Microsoft Store packaging claims as current policy without re-verifying them against Microsoft docs at submission time.
- Do not market `musu-system` as the first Store app. It is companion tooling after the MUSU desktop runtime is accepted.

## Integration Value By Component

### `crawl-ai`

Value: **high**

Best use in MUSU:

- external knowledge ingestion tool
- source harvester feeding MUSU wiki/memory
- MCP tool available to CoS/agents
- optional dashboard "Knowledge" app later

Do not replace the Rust indexer immediately. Current `musu-rs indexer` indexes local repo/code/docs into `.musu_dev.db`; `crawl-ai` harvests external/source material into a wiki/vector/search pipeline. They are adjacent, not duplicates.

Recommended integration:

- Add a MUSU bridge tool/adapter that calls `musu-crawl-ai mcp` or CLI.
- Define a shared wiki directory contract.
- Let CoS invoke `fetch`, `search`, and `research` when a task needs external evidence.

### `marketer`

Value: **medium-high**

Best use in MUSU:

- launch copy drafting
- Store listing copy variants
- blog/newsletter/social drafts grounded in the MUSU wiki
- campaign records connected to product release docs

Do not make it part of the first desktop install. It is a workflow app, not a runtime requirement.

Recommended integration:

- Treat as a company/workflow plugin.
- Expose campaign drafting through MCP or `/api/tools/marketer` later.
- Use it immediately for Store launch assets after the package submission path is stable.

### `nurikun`

Value: **high, but high-risk**

Best use in MUSU:

- support inbox triage
- opt-in lifecycle campaigns
- compliant newsletter operations

Keep it isolated.

Reasons:

- It touches real mailboxes, consent records, suppression lists, and outbound sending.
- The repo has good compliance posture: double opt-in, suppression hard gate, `(광고)` labeling, List-Unsubscribe, per-domain rate limits.
- That compliance value disappears if MUSU turns it into an overly broad autonomous dashboard action.

Recommended integration:

- Expose only safe MCP ops first: doctor, list, subscribe, confirm, suppress, message listing.
- Keep delivery ops (`watch`, `campaign send`) CLI-only or human-approved.
- Never include automatic outbound email in the first Microsoft Store desktop package.

### `core`

Value: **medium**

`core` is a good Go shared module for the Go ecosystem. Do not port it into Rust unless a specific contract needs mirroring.

Useful ideas to mirror:

- consistent env precedence
- AI endpoint preflight
- machine-readable doctor/actionable_fix envelopes

## Integration Roadmap

### Phase 0 — no code merge

- Document `musu-system` as an adjacent ecosystem line.
- Make `musu-system` the canonical source over split repos.
- Keep split repos as read-only/mirror/reference unless there is a deliberate release reason.

### Phase 1 — tool registration

- Add optional MCP registration docs for:
  - `musu-crawl-ai`
  - `musu-marketer`
  - `musu-nurikun`
- Add a MUSU doctor section that can detect whether those tools are installed and callable.
- Do not make beta desktop health depend on them.

### Phase 2 — shared data contracts

Define:

- wiki root path
- project/company ID mapping
- JSON envelope shape
- source/campaign/message IDs
- consent/suppression export shape

### Phase 3 — dashboard surfaces

Add optional dashboard sections:

- Knowledge: crawl/search/research status
- Campaigns: drafts and launch assets
- Inbox: safe status/triage views only

Outbound email and campaign sending must require explicit human approval.

### Phase 4 — Store-safe packaging decision

After the Store desktop app is approved:

- decide whether companion tools are separate downloads, GHCR services, or optional feature packs
- do not bundle them into the Store build until Microsoft policy sensitivity is reviewed
- keep `nurikun` especially outside the default Store app until a compliance review is done

## Main Risks

1. **Certification surface creep**
   - Crawling, remote research, and email automation are all more policy-sensitive than local diagnostics/task running.
   - Do not include them in the first Store package.

2. **Dual source-of-truth drift**
   - `musu-system` and split repos are not identical at HEAD.
   - Pick `musu-system` as canonical.

3. **Operational dependency sprawl**
   - Go tools assume Ollama/OpenAI-compatible endpoints, local wiki paths, mailbox credentials, Docker/GHCR in some paths.
   - MUSU desktop should detect these, not require them.

4. **Email compliance**
   - `nurikun` is valuable because it is conservative.
   - Preserve the boundary: safe MCP ops first; delivery ops gated.

## Product Conclusion

Integrating `musu-system` is worth doing, but only as **MUSU ecosystem tooling**, not as a direct Rust-core merge.

Priority order:

1. `crawl-ai` as knowledge/memory ingestion
2. `marketer` as launch/campaign workflow
3. `nurikun` as gated support/opt-in email operations
4. `core` concepts mirrored only where useful

The first integration target should be:

> MUSU can discover `musu-crawl-ai`, call its MCP tools, and ingest selected outputs into the current MUSU wiki/memory flow.

That gives immediate value without destabilizing the Windows desktop beta or Store review path.
