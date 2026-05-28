# musu-system Integration Assessment — 2026-05-29

**Date**: 2026-05-29
**Scope**: `yellowhama/musu-system`, `musu-crawl-ai`, `musu-marketer`, private `musu-nurikun`, and their fit with current `musu-bee` / `musu-rs`.

## Executive Verdict

`musu-system` has real integration value, but it should **not** be merged into the MUSU Rust core now.

Best architecture:

- keep `musu-rs` as the machine/control/runtime layer
- keep `musu-system` as an adjacent Go application/tool layer
- integrate through MCP, CLI, bridge adapters, shared wiki paths, and dashboard surfaces
- avoid bundling the email/crawl/marketing stack into the first Microsoft Store desktop package

Reason:

The current MUSU desktop beta is trying to prove a narrow Windows trust/install loop. Pulling crawl, marketing, and email automation into the Store build would expand the certification and security surface at the worst possible time. The right move is to expose them as optional MUSU ecosystem tools after the Store path is stable.

## Repository Snapshot

Checked via local Git clone on 2026-05-29. Rechecked again at 2026-05-29 06:43 KST from `F:\workspace\external\musu-system`.

| Repo | HEAD | Time | State |
|---|---|---:|---|
| `yellowhama/musu-system` | `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40` | 2026-05-29 01:06 KST | current monorepo |
| `yellowhama/musu-crawl-ai` | `f94b79b1cd8b81fd320e504318ea7dfd61d57596` | 2026-05-28 21:41 KST | legacy/reference split repo |
| `yellowhama/musu-marketer` | `5b3bd5c3c91cb3f68f964b70bca310a5bebfb88a` | 2026-05-28 21:41 KST | legacy/reference split repo |
| `yellowhama/musu-nurikun` | `4bed668f3b809cc9157ae8d28cce59b58ce8daa2` | 2026-05-28 21:41 KST | private legacy/reference split repo |

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

The latest verification was run from `F:\workspace\external\musu-system` against HEAD `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`.

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

## Code Audit Notes

`musu-system` is not just a README wrapper. It has a coherent Go workspace, per-module tests, CI build/vet/race-test workflow, tag-triggered GHCR publishing, and a deploy bundle with Ollama, shared wiki volume, Caddy TLS profile, and optional scheduler.

Important observations:

- `crawl-ai` MCP exposes `fetch`, `search`, and `research` with declared schemas and required arguments. This is immediately useful for MUSU knowledge ingestion.
- `marketer` MCP exposes `draft_campaign` and `list_campaigns`; the REST server is still shallow (`/health` plus WIP endpoints), so MCP/CLI should be the first integration path.
- `nurikun` MCP exposes safe operations only: doctor, list/create list, subscribe, confirm subscriber, list subscribers, suppress, and message listing. It intentionally does not expose `watch`, `campaign`, or `serve`.
- `nurikun campaign` has send-time gates for confirmed/due subscribers, suppression checks, per-domain/per-run rate limiting, sender identity validation, `(광고)` labeling, footer, and `List-Unsubscribe`.
- `nurikun watch` can auto-send low-risk high-confidence inbound replies according to policy. That is useful, but it should remain behind explicit operator configuration and not become a default dashboard button.
- Runtime state paths (`/var`, `/wiki`, `/oauth`, `/projects-*`, `.env`) are gitignored, and deploy docs explicitly keep Gmail OAuth material mounted read-only.

Audit concern:

- `nurikun watch` records outbound status as `sent` before mailbox `Send` returns. If send fails, the log reports failure but the stored row has already been saved as `sent`. This is acceptable for an adjacent prototype, but before any MUSU dashboard integration it should record `send_failed` or update the row after delivery success.

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
