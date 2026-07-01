# Current Product Spec Audit Stop Point - 2026-07-01

**Wiki ID**: wiki/1229

This document records the stop point for the 2026-07-01 product-spec audit.
It is intentionally a NO-GO report, not a completion claim.

## Status

- Branch: `feat/v33-residual-finalize`
- Baseline HEAD before this report: `b346e93f2270ae38a960341f077e1584e7c76ad3`
- Clean go/no-go snapshot:
  `.local-build/go-no-go/latest.json`
- Snapshot time: `2026-07-01T19:08:29.8415898+09:00`
- `full_product_spec_ready`: `false`
- `ready_for_public_desktop_release`: `false`
- Blocker count: `10`

Current blocker areas:

1. `multi-device`
2. `private-mesh-packaged-release-proof`
3. `runtime-idle-cpu`
4. `runtime-cpu-scenario-matrix`
5. `store-public-metadata`
6. `store-release`
7. `p2p-control-plane`
8. `design-approval`
9. `relay-transport`
10. `v34-stale-self-heal`

## Qualitative Evaluation

The product is healthier than it was at the start of the day, but it is not
finished against the full product spec. The local `HUGH_SECOND` package is
rebuilt, reinstalled, and locally proven with current brain sidecar packaging.
The second-PC kit has also been regenerated from clean current source.

The remaining risk is not cosmetic. The system still lacks enough live
two-machine evidence to call the fleet path release-ready, and the public
`musu.pro` metadata path is blocked by DNS/TLS mismatch. A user can install and
exercise the current package locally, but the product cannot be represented as
public-release complete until the external routes and second physical PC proof
are green.

## System Design Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is still blocked by 10 release gates. | Clean go/no-go snapshot at `2026-07-01T19:08:29.8415898+09:00` reports `full_product_spec_ready=false` and `ready_for_public_desktop_release=false`. | Do not claim public desktop release readiness. | Keep this as the canonical stop point and drive the listed blockers one at a time. |
| NO-GO | `musu.pro` public metadata DNS/TLS does not match the verifier contract. | `.local-build/public-metadata-dns-repair/20260701-1929-musu-pro-public-metadata-dns-repair-vercel-inspect.json` shows current Cloudflare nameservers, apex A records `104.21.82.53` / `172.67.196.17`, expected apex `76.76.21.21`, apex AAAA records present, apex TLS failure, and Vercel edge apex TLS failure. | Hosted install/update metadata remains untrusted for release. | Apply the Cloudflare DNS repair with a real `CLOUDFLARE_API_TOKEN`, then rerun the public metadata verifier. |
| HIGH | Cloudflare repair was correctly fail-closed because no token was present. | `.local-build/public-metadata-dns-repair/20260701-1930-musu-pro-cloudflare-dns-apply-token-missing.json` reports `failure_kind=cloudflare_token_missing`, `will_mutate_external_dns=false`, `applied=false`, and `operation_count=0`. | No accidental external DNS mutation occurred, but the blocker remains. | Provide token only for the repair run; do not commit or print it. |
| HIGH | `hugh-main` still has a stale `running` task that blocks clean two-PC route proof. | Direct route evidence `.local-build/v34-route-evidence/20260701-191310/20260701-191310-HUGH_SECOND-to-hugh-main.route-evidence.json` reached `hugh-main` over LAN with `handshake_ms=7` but ended `remote_task_wait_timeout`. After cancellation attempts, task `9dba3497-c80c-417a-8e59-dcb4a2d869ea` still reported `running`. | The remote bridge can remain logically busy even when the operator cancelled known tasks; strict runtime CPU matrix and V34 self-heal proof cannot close honestly. | Restart/repair the bridge on `hugh-main`, or implement and prove stale-task cleanup. Then rerun fleet proof from both PCs. |
| HIGH | Remote task cancellation does not terminalize the DB row by itself. | `musu-rs/src/writer/cancel.rs:23` delegates to `state.task_runner.cancel`; `musu-rs/src/writer/runner.rs:325` only notifies a live cancellation handle. Boot orphan recovery at `musu-rs/src/writer/runner.rs:293` fixes `pending`/`running` rows only on bridge construction. | A wedged live bridge can preserve stale DB `running` state until restart or explicit cleanup. | Add a tested stale-task terminalization path, or make the operational next step a bridge restart before release proof capture. |
| MED | API docs advertise a restart endpoint that the router does not expose. | `docs/API.md:33` documents `POST /api/system/restart?service=all`, but `musu-rs/src/bridge/handlers/mod.rs:90` exposes `/api/system/update`, and no restart route is registered. | Operators may try a documented repair path that returns 404 during a real incident. | Either implement the restart endpoint with auth and audit evidence, or remove/replace the docs with the actual repair command. |
| MED | RPC exec is intentionally fail-closed unless allowlisted. | `musu-rs/src/bridge/handlers/rpc.rs:14` requires `MUSU_RPC_EXEC_ALLOWLIST`. | This is correct for security, but it means remote repair cannot rely on arbitrary exec. | Keep it fail-closed; use explicit repair endpoints or local operator commands. |

## Spec Updates

Product spec meaning as of this stop point:

- `brain_product_verified=true` on `HUGH_SECOND` means the brain sidecar package
  lane is healthy locally; it does not prove the full two-PC product.
- `runtime_cpu_second_pc_route_attempt_verified=true` means the failed route
  attempt metadata lane is preserved and auditable; it does not satisfy the
  strict successful post-route CPU scenario matrix.
- `online_nodes=2` and direct LAN reachability are necessary but insufficient
  for release readiness while the target node can retain stale `running` task
  state.
- `store-public-metadata` remains external-DNS blocked. The current Vercel
  project binding exists, but `musu.pro` DNS/TLS does not satisfy the public
  metadata verifier.

## Next Steps

1. On `hugh-main`, run the current second-PC kit or at minimum repair/restart
   the bridge, then rerun:
   `irm https://musu.pro/fleet-proof.ps1`.
2. Import the resulting `hugh-main` evidence into this repo and rerun
   go/no-go.
3. Rerun strict runtime CPU scenario matrix after the stale task is gone.
4. Run the Cloudflare DNS repair with a real token and then rerun the public
   metadata verifier.
5. Resolve design approval and Store release only after the runtime and public
   metadata blockers are green.
6. Decide whether V34 gets a code fix for stale task cleanup or an explicit
   release procedure requiring bridge restart before final proof capture.

## Indexing

Final indexing was refreshed as part of this stop point.

- Code/document index: `musu indexer sync --work-dir F:\workspace\musu-bee
  --name musu-bee` returned `indexed 3746 files (3952 symbols)`.
- Product brain refresh: primary refresh ingested and processed `10` code/docs
  sources into `C:\Users\empty\.musu\brain` tenant `local`, workspace `musu`;
  after this indexing section was written, a final docs-only refresh ingested
  and processed the `4` changed stop-point docs.
- Recall verification query:
  `wiki/1229 product spec audit stop point remote_task_wait_timeout stale
  running task store-public-metadata`.
- Recall result: the canonical
  `CURRENT_PRODUCT_SPEC_AUDIT_STOP_POINT_2026_07_01` source was returned in the
  top results.
