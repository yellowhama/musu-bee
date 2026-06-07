# MUSU 1.15.0-rc.1 Frontend Polling Inventory Gate

**Wiki ID**: wiki/949
**Date**: 2026-06-07 KST
**Base commit at audit start**: `04f525aa7b1c4c6033d9d706e5eb7f1d70287949`

## Summary

The frontend busy-loop release gate is now stricter.

Before this change, `audit-frontend-polling-contract.ps1` verified that at
least 20 non-test frontend files used the shared low-duty polling helper. That
was useful, but it would not fail if a new polling surface appeared silently.

The audit now locks the exact current inventory of 29 low-duty polling
call-site files. Any missing expected file or any unexpected new call-site file
fails the release audit and therefore the `frontend interval/refetch`
idle-busy-loop candidate in go/no-go.

This is release tooling, status, and test hardening. It does not change local
runtime behavior and does not move work into MUSU.PRO.

## Product Spec Interpretation

The product boundary remains unchanged:

- MUSU Desktop is the local executor on each device.
- MUSU Desktop owns local files, processes, browser/app automation, WebView,
  and local refresh loops.
- MUSU.PRO receives remote user input, hosts project/company rooms, coordinates
  presence/rendezvous/path selection, issues relay fallback coordination, and
  records evidence.
- MUSU.PRO does not execute local work.
- MUSU.PRO does not become the default payload data path.
- `localhost:3001` is not the packaged desktop runtime contract.

The frontend polling gate belongs to the local desktop/web surface quality
contract. It prevents UI refresh loops from becoming hidden idle CPU regressions
while keeping execution local.

## Code Changes

Changed files:

- `scripts\windows\audit-frontend-polling-contract.ps1`
- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `musu-bee\src\app\runtime-polling-contract.test.ts`

New audit behavior:

- `expectedLowDutyPollingCallSitePaths` lists the 29 current non-test
  low-duty polling call-site files.
- `low_duty_polling_call_site_count` now reports the actual unique path count.
- `expected_low_duty_polling_call_site_count` reports the locked expected
  count.
- `missing_low_duty_polling_call_site_count` and
  `missing_low_duty_polling_call_sites` report expected paths that disappeared.
- `unexpected_low_duty_polling_call_site_count` and
  `unexpected_low_duty_polling_call_sites` report new paths that must be
  reviewed intentionally.
- The existing check name `low-duty polling call-site inventory` now requires
  exact inventory equality instead of `>= 20`.

Go/no-go wiring:

- `frontend interval/refetch` now requires
  `source / low-duty polling call-site inventory`.
- A new direct polling surface can no longer pass public release merely because
  direct `setInterval` is absent.

Test wiring:

- `runtime-polling-contract.test.ts` now asserts the audit has an explicit
  inventory, drift fields, the drift failure message, and representative
  expected paths from app, dashboard, MCP view nodes, and MCP view tasks.
- `test-release-evidence-verifiers.ps1` now fails if the go/no-go
  idle-busy-loop candidate stops requiring the inventory check.

## Validation

Passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/audit-frontend-polling-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `low_duty_polling_call_site_count=29`
  - `expected_low_duty_polling_call_site_count=29`
  - `missing_low_duty_polling_call_site_count=0`
  - `unexpected_low_duty_polling_call_site_count=0`
  - `low_duty_polling_signal_gap_count=0`
  - `direct_interval_hit_count=0`
  - `direct_visibility_listener_hit_count=0`
- `npm run test:runtime-polling`
  - `17/17` passed
- `npm run typecheck`
  - passed
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-release-evidence-verifiers.ps1`
  - `ok=True`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`
  - expected `ok=false`
  - still reports 12 P2P/MUSU.PRO blockers
- `npm run test:p2p`
  - `112/112` passed
- `git diff --check`
  - passed

## Qualitative Code Audit

No high or medium issue was found.

Positive findings:

- The previous audit gap was real: a count threshold was not strong enough for
  a release gate that is supposed to control idle CPU regressions.
- Exact inventory is the right shape for this point in the release: adding a
  polling surface should be an intentional review event.
- Keeping the check name stable avoids churn in existing go/no-go result
  readers while strengthening the pass condition.
- The output now gives actionable drift fields instead of only pass/fail.

Low-severity residual risks:

- The inventory is intentionally strict. Legitimate new polling surfaces now
  require updating the expected list and explaining why the new surface is
  low-duty and abort-aware.
- This is source/audit hardening. It does not replace 60s runtime CPU evidence
  on one or two machines.
- Public release remains blocked by P2P/relay, second-machine, support mailbox,
  and Store evidence; this change only closes a frontend busy-loop gate gap.

## Current No-Go State

`show-musu-pro-p2p-env-status.ps1` still reports 12 blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

Release remains No-Go. The next release-critical work is still:

1. regenerate operator packs from the current committed HEAD;
2. run/import the second Windows machine package, CPU, matrix, and route
   evidence;
3. configure live MUSU.PRO runtime login and owner-scoped KV/Upstash storage;
4. implement real release `quic_relay_tunnel` runtime byte transit and proof;
5. record support mailbox and Store/Partner Center proof.

## Index Refresh

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2884`
- indexed symbols: `2790`
- duration: `15020 ms`
- wiki: `wiki/950`
