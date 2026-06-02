# MUSU 1.15.0-rc.1 Busy-Loop and Process Attribution Audit

Date: 2026-06-03 05:37 KST
HEAD: `6f32d490f0aed0676dfe2fd6c9ef22aaeae580e4`

## Scope

This audit rechecks the operator-reported hardening concerns:

1. MUSU idle busy-loop / one-core CPU usage.
2. `musu.pro` as P2P registry, rendezvous, path-selection, and relay-control infrastructure.
3. Desktop hardening and optimization readiness before public release.
4. Machine-wide `node.exe` process count versus MUSU-owned process responsibility.

No runtime source patch was made in this pass. The current code already contains
the relevant mDNS, polling, and low-duty heartbeat hardening. This pass records
the current qualitative assessment and verification results.

## Code Audit Result

### mDNS / Tailscale

Current source keeps mDNS LAN discovery off unless `MUSU_ENABLE_MDNS=1`.
Within the mDNS daemon setup, IPv6, Tailscale, and common VPN/virtual adapters
are also disabled unless explicitly widened by these opt-ins:

- `MUSU_MDNS_ENABLE_IPV6=1`
- `MUSU_MDNS_ENABLE_TAILSCALE=1`
- `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`

The explicit discovery loop distinguishes ordinary receive timeouts from a
disconnected browse receiver. Timeout keeps the bounded discovery window alive;
disconnect exits immediately. That addresses the operator-observed
`mdns_sd::service_daemon`, `ff02::fb`, `os error 10065`, and
`sending on a closed channel` failure class for current source defaults.

Validation:

```powershell
cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::
```

Result: 3 passed, 0 failed.

### Frontend Polling and Reconnects

The frontend runtime polling contract still passes:

- major dashboard/panel polling paths use shared `useLowDutyPolling`
- low-duty polling clamps accidental tight intervals at 5s minimum
- hidden-tab backoff is present
- polling tasks use default timeout cancellation
- dashboard relay reconnect uses capped backoff
- chat SSE reconnect clears timers and ignores stale generations

Validation:

```powershell
cd musu-bee
npm run test:runtime-polling
```

Result: 11 passed, 0 failed.

`useFleetStore` was also inspected. Its `/api/bridge-tasks/events` `EventSource`
path suppresses duplicate `CONNECTING`/`OPEN` instances and closes/nulls the
stream on error; it does not contain a fixed reconnect timer. The remaining
`setTimeout` calls there are short UI state reset timers, not network retry
loops.

### Cloud Registration Loop

The bridge `musu.pro` registration loop is low-duty:

- default heartbeat interval is 300 seconds
- minimum interval is clamped to 60 seconds
- failures apply bounded exponential backoff and jitter
- mDNS auto-register is called inside that loop only when `MUSU_ENABLE_MDNS=1`

This is not a busy-loop pattern in current source.

## Live Process Attribution

Live process attribution was captured at 2026-06-03 05:35 KST:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-process-attribution.ps1 -Json
```

Evidence:

- `.local-build\process-ownership\musu-process-ownership-20260603-053549.json`

Result:

- `ok=false`
- MUSU runtime process count: `0`
- desktop shell process count: `0`
- machine-wide `node.exe`: `16`
- MUSU-owned `node.exe`: `0`
- machine-wide WebView2: `6`
- MUSU-owned WebView2: `0`
- orphan repo helpers: `0`
- bridge registry missing at `C:\Users\empty\.musu\services\bridge.json`

Interpretation:

This live sample is not release-pass evidence because MUSU was not running.
It is useful diagnostic evidence for the operator-reported "many Node.js
processes" concern: the observed `node.exe` count is machine-wide and not owned
by a live MUSU process tree. Release accountability remains MUSU-owned
descendants plus repo-related orphan helpers, not the raw machine-wide node
count.

The latest release-grade desktop-open CPU evidence remains:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-035458-HUGH_SECOND.desktop-open.evidence.json`

That 60s sample passed with:

- MUSU max one-core CPU: `0`
- Node max one-core CPU: `0.03`
- WebView2 max one-core CPU: `0.6`
- hot process count: `0`
- total working set: `500.44MB`

## Release Gate Status

Fresh go/no-go was run at 2026-06-03 05:37 KST:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Result:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `multi_device_verified=false`

Known blockers remain:

- second-PC route evidence is still not release-grade
- runtime idle CPU evidence is still only one machine out of two
- runtime CPU scenario matrix evidence is still only one machine out of two
- live `musu.pro` P2P control-plane evidence still lacks owner-scoped relay lease proof
- `musu@musu.pro` inbox delivery/forwarding proof is still required
- Microsoft Store / Partner Center evidence is still required

The latest failed multi-device evidence still points to remote
`192.168.1.192:8949`, route kind `lan`, failed HTTP request to
`/api/tasks/delegate`, no verified peer identity, missing release-grade
transport proof, and legacy `none_http_bearer` route encryption.

## P2P / `musu.pro` Product Spec Status

Current product spec remains:

- `musu.pro` is the hosted control-plane path for account-scoped registry,
  rendezvous, route evidence intake, and relay lease policy.
- Runtime forwarding now records route evidence and requests fail-closed relay
  leases after terminal direct-route failure when session/account material
  exists.
- Relay payload transport is not wired yet.
- Release-grade P2P still requires owner-scoped KV/Upstash storage, peer
  identity proof, and QUIC/TLS transport proof.

Current live blocker remains `p2p_relay_lease_kv_not_configured`, with required
hosted storage env still missing:

- `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL`
- `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`

## Qualitative Assessment

Local single-machine beta confidence is high. The current packaged desktop path
has passing smoke, desktop-open CPU, process ownership, desktop single-instance,
and runtime scenario matrix evidence on `HUGH_SECOND`.

Public desktop release is still not ready. The remaining failures are external
release gates, not local UI polish alone:

- real second-PC route/CPU/matrix recapture
- hosted P2P storage and owner-scope proof
- support mailbox evidence
- Store/Partner Center submission evidence

Hardening status is materially better than the original report. The current
source does not show an obvious fixed-delay busy-loop in the audited mDNS,
frontend polling, or cloud-registration paths. The remaining CPU concern should
be handled by repeating the release CPU/matrix capture on the second PC and by
separating machine-wide dev tools from MUSU-owned processes in every report.

## Next Actions

1. Provision KV/Upstash storage for `musu.pro` and rerun live P2P evidence.
2. Re-run the second-PC release check while `HUGH-MAIN` is reachable on
   `192.168.1.192:8949`.
3. Capture second-PC desktop-open CPU and runtime CPU scenario matrix evidence.
4. Capture `musu@musu.pro` inbox receive/forward proof.
5. Prepare Partner Center / Microsoft Store submission evidence.
6. Keep using process attribution before treating machine-wide Node/WebView2
   counts as MUSU release defects.
