# MUSU 1.15.0-rc.1 Post P2P Storage Env Alias Primary Evidence

Recorded: 2026-06-03 01:12 KST
Source commit: `fbd01746c3741f79c31afdce493851934ddf6fa4`
Evidence base commit: `de243e567395bb2eea6f35320a3583f3b3188dc9`

## Scope

This report records the packaged primary evidence refresh after hosted P2P
storage env alias hardening. The source change lets `musu.pro` P2P storage use
either Vercel KV names or Upstash Redis REST names, but it does not change the
payload data-path contract or close the live P2P gate by itself.

The refresh also rechecks the operator's runtime hardening concern: the current
packaged desktop path does not reproduce an idle busy-loop on `HUGH_SECOND`
under desktop-open or the four-state CPU matrix.

## Evidence

The local-sideload MSIX workflow rebuilt and installed
`musu_1.15.0.0_x64_local-sideload-manual.msix` as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-005257-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-005000-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-005010-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-010000-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-010315-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Validation passed:

- `verify-single-machine-evidence.ps1` with `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1` with `ok=true`, `fail_count=0`
- `write-release-go-no-go.ps1 -Json` still reports public No-Go because the
  remaining gates are external/proof gates.

## Result

Primary packaged evidence is restored after the P2P storage alias source
change.

- single-machine smoke passed through dashboard task
  `a0245ad5-e299-4015-8f40-75a73bbe5815`, bridge
  `http://127.0.0.1:2467`, output
  `MUSU_RELEASE_SMOKE_OK_20260603_005237`, and CLI route smoke.
- repeated desktop activation passed: repeat count `3`, before desktop shell
  `0`, after desktop shell `1`, new desktop shell `1`, final desktop PID
  `9044`.
- process ownership passed: runtime `1`, desktop shell `1`, MUSU-owned Node
  `0`, MUSU-owned WebView2 `6`, machine-wide Node `16`, machine-wide WebView2
  `12`, orphan repo helpers `0`, bridge PID `10436`, bridge
  `127.0.0.1:2467`, and bridge health HTTP `200`.
- desktop-open CPU passed from clean git state: 60.048s, MUSU `0`, Node `0`,
  WebView2 `0.1`, working set `363.87MB`, private memory `186.34MB`, hot
  process count `0`.
- runtime CPU matrix passed from clean git state with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`.
  `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all
  stayed below the 5 percent one-core CPU budget with no hot processes and no
  resource budget violations.

The observed machine-wide Node count is not MUSU ownership. Process ownership
and CPU attribution continue to separate unrelated machine-wide Node processes
from MUSU-owned helpers. MUSU-owned Node was `0`; the matrix includes one
repo/dashboard Node because the production dashboard server is intentionally
running for that scenario.

## Qualitative Assessment

Local desktop completeness remains strong for controlled RC iteration, but not
for public release.

Strengths:

- packaged desktop repeated activation remains single-instance;
- desktop activation starts and keeps the packaged bridge runtime alive;
- desktop-open and post-route CPU are quiet on the primary machine;
- Node/WebView2 attribution distinguishes MUSU-owned helpers from unrelated
  machine-wide processes;
- hosted P2P storage provisioning is less brittle because both KV and Upstash
  REST env names are accepted.

Remaining weaknesses:

- this is one-machine evidence, not two-machine release proof;
- live `musu.pro` still lacks durable KV/Upstash credentials and owner-scoped
  relay lease evidence;
- route transport is still not release-grade QUIC/TLS proof;
- `musu@musu.pro` receive/forward mailbox evidence is still missing;
- Microsoft Store / Partner Center submission evidence is still missing.

## Code Audit

No new critical local desktop issue was found in this evidence pass.

The current source audit boundary is:

- `p2pKvEnv.ts` maps `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` into `KV_REST_API_URL` /
  `KV_REST_API_TOKEN` before `@vercel/kv` loads.
- Route evidence, rendezvous, and relay lease stores now share the same storage
  env normalization path.
- The deploy workflow and P2P env configurator/status scripts understand both
  env name families without printing secret values.
- This improves production wiring but does not prove live storage, owner scope,
  relay transport, peer identity, or encryption.

Known risk that remains intentionally fail-closed:

- second-PC CPU/matrix/route evidence is still required;
- live relay lease evidence still fails until storage credentials are deployed;
- current route proof cannot claim release-grade encryption until transport
  proof exists;
- release checks should keep using the explicit WindowsApps alias because the
  developer shell may shadow `musu.exe` with a Cargo-built binary.

## Product Spec Updates

Current product contract remains:

- `musu.pro` is the account, rendezvous, relay lease, evidence, and
  control-plane surface.
- `musu.pro` is not the default payload data path.
- Hosted P2P storage can be provisioned with either Vercel KV env names or
  Upstash Redis REST env names.
- Store/public copy may claim local desktop orchestration and assisted
  control-plane wiring only where evidence exists. It must not claim universal
  NAT traversal, verified peer identity, or QUIC/TLS P2P payload transport
  until the second-PC and P2P control-plane gates pass.

## Next Roadmap

1. Provision production P2P storage on `musu.pro` using either
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` or
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, redeploy, then rerun
   `record-p2p-control-plane-evidence.ps1` without unverified allowances.
2. Bring the second PC online or import a fresh return zip, then capture
   two-machine CPU, matrix, and release-grade route proof.
3. Implement or prove release-grade route transport: peer identity, handshake
   timing, encryption proof, route kind, and payload transit truth.
4. Capture `musu@musu.pro` receive/forward evidence and record it through the
   support mailbox verifier.
5. Prepare Partner Center / Store submission evidence only after local package,
   two-machine route, P2P control plane, support mailbox, and current public
   metadata evidence are all passing.

## Current Verdict

Public release remains No-Go.

Local packaged evidence is good on the primary machine. Release readiness is
still blocked on external/proof gates: second-PC CPU/matrix/route,
production `musu.pro` owner-scoped P2P control plane, support mailbox, and
Store evidence.
