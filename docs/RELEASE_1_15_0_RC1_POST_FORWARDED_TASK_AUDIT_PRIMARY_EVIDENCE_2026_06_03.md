# MUSU 1.15.0-rc.1 Post Forwarded-Task Audit Primary Evidence

Recorded: 2026-06-03 00:25 KST  
Source commit: `c25c109ee579dbe042f8706b9af4f0e56fd941ca`

## Scope

This report records the packaged primary evidence refresh after the Rust bridge
forwarded-task audit hardening. The source change adds target-side audit rows
when `/api/tasks/forward` accepts and spawns forwarded cross-machine work.

The refresh answers the operator's current desktop hardening concern: the
current packaged app does not reproduce a busy-loop pattern on `HUGH_SECOND`
under single-machine, desktop-open, dashboard-open, or post-route CPU evidence.

## Evidence

The local-sideload MSIX workflow rebuilt and installed
`musu_1.15.0.0_x64_local-sideload-manual.msix` as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-001225-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-000306-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-000306-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-001200-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-001416-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Validation passed:

- `verify-single-machine-evidence.ps1` with `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1` with `ok=true`, `fail_count=0`

## Result

Primary packaged evidence is restored for source commit `c25c109e`.

- single-machine smoke passed through dashboard task
  `17241539-c53f-4bd1-b605-89546902f89f`, bridge
  `http://127.0.0.1:8738`, output
  `MUSU_RELEASE_SMOKE_OK_20260603_001203`, and CLI route smoke.
- repeated desktop activation passed: repeat count `3`, before desktop shell
  `0`, after desktop shell `1`, new desktop shell `1`, final desktop PID
  `37424`.
- process ownership passed: runtime `1`, desktop shell `1`, MUSU-owned Node
  `0`, MUSU-owned WebView2 `6`, machine-wide Node `19`, machine-wide WebView2
  `12`, orphan repo helpers `0`, bridge PID `35804`, and bridge health HTTP
  `200`.
- desktop-open CPU passed: 60.059s, MUSU `0.03`, Node `0`, WebView2 `0.08`,
  working set `454.06MB`, private memory `265.8MB`, hot process count `0`.
- runtime CPU matrix passed from clean git state with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_001416`.
  `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` all
  stayed below the 5 percent one-core CPU budget with no hot processes and no
  resource budget violations.

The observed machine-wide Node count is not treated as MUSU ownership. The
process audit separated unrelated machine-wide Node processes from MUSU-owned
helpers; MUSU-owned Node was `0` in process ownership and desktop-open idle CPU
evidence. The runtime matrix had one repo/dashboard Node for the production
dashboard test server, which is expected for that scenario and is stopped after
verification.

## Qualitative Assessment

Current local desktop completeness is strong enough for controlled RC
iteration, but not for public desktop release.

Strengths:

- packaged desktop repeated activation is single-instance;
- installed runtime and desktop paths are under the MSIX package, not the
  developer alias;
- desktop-open and post-route CPU are quiet;
- process evidence distinguishes MUSU-owned helpers from unrelated Node.js and
  WebView2 processes;
- target-side forwarded-task receipt now writes bounded audit evidence without
  leaking prompt/cwd/callback/model metadata.

Remaining weaknesses:

- this is one-machine evidence, not two-machine release proof;
- `musu.pro` still lacks live KV-backed owner-scoped relay lease evidence;
- route transport is still not release-grade QUIC/TLS proof;
- `musu@musu.pro` receive/forward mailbox evidence is still missing;
- Microsoft Store / Partner Center submission evidence is still missing.

## Code Audit

No new critical local desktop issue was found in this evidence pass.

The current source audit boundary is:

- Rust bridge `/api/tasks/forward` target receipt now writes an `audit_log` row
  using `ConnectInfo` peer IP, `cross_machine=true`, status `202`, company id,
  task/source/rendezvous identifiers, and bounded note text.
- The audit note excludes prompt text, cwd, callback URL, model, and adapter
  metadata; this is the right forensic/privacy tradeoff for forwarded work.
- The change improves P2P command forensics but does not prove route identity,
  encryption, or payload transit.
- Current packaged evidence shows no idle busy-loop on the primary machine.

Known risk that remains intentionally fail-closed:

- second-PC CPU/matrix/route evidence is still required;
- relay route evidence still needs issued lease proof and live owner scope;
- current route proof cannot claim release-grade encryption until transport
  proof exists;
- the local developer shell still shadows the WindowsApps alias with
  `C:\Users\empty\.cargo\bin\musu.exe`; release checks should keep using the
  explicit WindowsApps alias or a clean operator shell.

## Product Spec Updates

Current product contract remains:

- `musu.pro` is the account, rendezvous, relay lease, evidence, and
  control-plane surface.
- `musu.pro` is not the default payload data path.
- Forwarded cross-machine task acceptance is now auditable on the target
  bridge, but auditability is not the same as release-grade route transport.
- Store/public copy may claim local desktop orchestration and audited
  forwarded-task receipt only where evidence exists; it must not claim
  universal NAT traversal, verified peer identity, or QUIC/TLS P2P payload
  transport until the second-PC and P2P control-plane gates pass.

## Next Roadmap

1. Configure production P2P KV/Redis on `musu.pro`, set `KV_REST_API_URL` and
   `KV_REST_API_TOKEN`, redeploy, then rerun
   `record-p2p-control-plane-evidence.ps1` without unverified allowances.
2. Bring the second PC online or import a fresh return zip, then capture
   two-machine CPU, matrix, and route proof from both machines.
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
