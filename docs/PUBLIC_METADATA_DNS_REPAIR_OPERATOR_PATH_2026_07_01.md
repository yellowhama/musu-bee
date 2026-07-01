# Public Metadata DNS Repair Operator Path (2026-07-01)

## Verdict

This change does not close the `store-public-metadata` release blocker.

It closes a smaller source/operator gap: the non-mutating DNS repair planner and
the release go/no-go next action now point directly at the existing
Cloudflare DNS apply helper, including the safe dry-run command and the
explicit `-ConfirmApply` command required for live mutation.

## Current Product State

Live `https://musu.pro` public metadata remains NO-GO.

Latest verifier check:

- `ok=false`
- `fail_count=3`
- failure kinds:
  `request_failed`, `dns_configuration_mismatch`,
  `dns_nameserver_mismatch`, `apex_tls_handshake_failed`,
  `vercel_edge_apex_tls_failed`
- privacy/support/public-config checks are unreachable from the canonical apex
  path while DNS/TLS is broken.

The site routes themselves already exist in this repo:

- `src/app/privacy/page.tsx`
- `src/app/support/page.tsx`
- `src/app/api/public-config/route.ts`

The blocker is the external apex DNS/TLS authority path, not missing Next.js
route source.

## Source Changes

Updated:

- `scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1`
- `scripts/windows/write-release-go-no-go.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1`

Planner contract:

- remains non-mutating:
  `will_mutate_external_dns=false`, `apply_supported=false`, `can_apply=false`
- now emits a structured `cloudflare_apply` object with:
  - `script=scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1`
  - dry-run command:
    `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -BaseUrl https://musu.pro -Json`
  - apply command:
    `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -BaseUrl https://musu.pro -ConfirmApply -Json`
  - `requires_token_env=CLOUDFLARE_API_TOKEN`
  - `optional_zone_env=CLOUDFLARE_ZONE_ID`
  - `mutation_requires_confirm_apply=true`
  - `planner_mutates_dns=false`

Go/no-go next action:

- now tells the operator to run the Cloudflare helper in dry-run mode before
  any DNS mutation when staying on Cloudflare/third-party DNS;
- now gives the exact dry-run command;
- now gives the exact `-ConfirmApply` command;
- keeps the final closure condition as
  `verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` passing.

Regression coverage:

- the release evidence verifier source-contract test now requires the planner
  to keep the Cloudflare apply path, dry-run command, token env, and
  `mutation_requires_confirm_apply`;
- the go/no-go next-action contract now requires the concrete dry-run/apply
  commands.

## Code Audit

No external DNS mutation was attempted.

The existing apply helper still fails closed without a token:

- `ok=false`
- `apply_requested=false`
- `will_mutate_external_dns=false`
- `applied=false`
- `can_apply=false`
- `failure_kind=cloudflare_token_missing`
- error: `Set CLOUDFLARE_API_TOKEN or pass -CloudflareApiToken. No DNS mutation was attempted.`

PowerShell parser check passed for all three touched scripts.

Release evidence verifier regression passed:

- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`
- `ok=true`
- `case_count=219`
- `failed_case_count=0`
- output root:
  `.local-build/release-evidence-verifier-tests/20260701-145051`

Qualitative assessment:

| Rating | Area | Assessment |
|---|---|---|
| GOOD | Safety | The planner still cannot mutate DNS. Mutation remains isolated to the dedicated helper and requires `-ConfirmApply`. |
| GOOD | Operator clarity | The next action is now concrete instead of "fix Cloudflare DNS" prose. |
| GOOD | Test coverage | Source-contract tests now prevent the operator path from silently disappearing. |
| BLOCKED | Product readiness | Canonical apex DNS/TLS still fails. A real Cloudflare token or registrar/DNS console action is still required. |
| WATCH | Operational risk | Cloudflare record changes are external state. The dry-run must be reviewed before applying, and MX/TXT/mail records must not be touched. |

## Brain Handoff Cross-Check

The brain integration handoff exists in both places Codex may need:

- brain repo original:
  `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`
- local product copy:
  `docs/HANDOFF-musu-integration.md`

The handoff's standalone brain default `~/.musubrain` does not override the MUSU
product contract. The packaged MUSU product root remains `~/.musu/brain`, outside
MSIX LocalState, with MUSU acting as the motherboard and `musu-brain.exe` as the
Go sidecar chip.

## Next Steps

1. Run the non-mutating planner:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\plan-musu-pro-public-metadata-dns-repair.ps1 -BaseUrl https://musu.pro -Json
```

2. Choose exactly one DNS authority path:

- Vercel nameservers at the registrar; or
- Cloudflare/third-party DNS with the exact Vercel external records.

3. If staying on Cloudflare, dry-run first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -BaseUrl https://musu.pro -Json
```

4. Only after reviewing the dry-run, apply with a scoped token:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -BaseUrl https://musu.pro -ConfirmApply -Json
```

5. Wait for DNS/TLS propagation, then close the lane only if:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

both report the public metadata gate green.

## Indexing and Recall

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed `3701 files` and `3949 symbols`.
- Product brain ingest under tenant/workspace `local/musu` posted `8` sources:
  this report, the full-product roadmap, `docs/WIKI.md`,
  `docs/WIKI_INDEX.md`, the three touched PowerShell scripts, and
  `docs/HANDOFF-musu-integration.md`.
- `musu-brain process` reported `processed: 8`.
- After recording these indexing results, a final docs-only refresh posted the
  four changed docs again and `musu-brain process` reported `processed: 4`.
- Recall query
  `PUBLIC_METADATA_DNS_REPAIR_OPERATOR_PATH_2026_07_01 cloudflare_apply dry_run_command CLOUDFLARE_API_TOKEN`
  returned the new canonical report source
  `wiki/sources/src_a45322f5bc04c444.md` as the top result.

Search terms: `wiki/1222`,
`PUBLIC_METADATA_DNS_REPAIR_OPERATOR_PATH_2026_07_01`,
`cloudflare_apply`, `dry_run_command`, `mutation_requires_confirm_apply`,
`apply-musu-pro-public-metadata-cloudflare-dns.ps1`,
`CLOUDFLARE_API_TOKEN`, `store-public-metadata NO-GO`,
`HANDOFF-musu-integration`, `~/.musu/brain`.
