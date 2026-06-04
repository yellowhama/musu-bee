# MUSU 1.15.0-rc.1 Single-Machine Dashboard URL Discovery

Date: 2026-06-04
Branch: `harden-relay-fallback-payload-evidence`

## Summary

The single-machine release smoke no longer assumes the development dashboard
port `http://127.0.0.1:3000`. It now discovers the packaged dashboard URL from
the local runtime status reported by `musu up --json` or `musu doctor --json`.

This directly addresses the local `ERR_CONNECTION_REFUSED` failure mode where a
packaged MUSU runtime is healthy on `http://127.0.0.1:3001/app`, but release
tooling still probes the dev port `3000`.

## Product Split

The product roadmap remains local-executor first:

- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs execute the actual work on each device.
- A web-originated request is a work order/control envelope. It can carry user
  input, acceptance, routing, status, audit, and fallback instructions, but
  local files, app/browser/shell automation, and sensitive execution stay on
  the local machine.
- `localhost` dashboard URLs are local operator/dev surfaces. They are not a
  cloud dashboard, and they only work while the local runtime/dashboard is
  running on that machine.
- After web-assisted rendezvous, direct P2P mesh remains the preferred path.
  Relay remains fallback and must be proof-backed before release claims.

## Changes

- `scripts/windows/smoke-single-machine-beta.ps1`
  - removed the hardcoded `DashboardBaseUrl=http://127.0.0.1:3000` default
  - added `Resolve-DashboardBaseUrlCandidate`
  - reads `dashboard.reachable_url` from `musu up` first and `musu doctor`
    second
  - still accepts explicit `-DashboardBaseUrl` for manual/debug use
  - records `dashboard_base_url_source` and `dashboard_reachable_url` in
    evidence
- `scripts/windows/audit-desktop-release-readiness.ps1`
  - release-gates dashboard reachable URL discovery
  - release-gates removal of the dev-port default
- `scripts/windows/verify-single-machine-evidence.ps1`
  - requires `dashboard_base_url_source`
  - requires `dashboard_reachable_url`
  - requires the dashboard URL to come from runtime `dashboard.reachable_url`
  - rejects the old dev dashboard default `http://127.0.0.1:3000`
- `scripts/windows/record-single-machine-evidence.ps1`
  - records dashboard URL and URL source in the summary
  - can be rerun against the canonical evidence path without copying a file
    over itself
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
  - the repeatable smoke command no longer passes a hardcoded dashboard URL

## Evidence

Source and evidence commits:

- dashboard URL discovery source: `e2f77dd15211d67d3e156c16cb27f1bb7f2c4d94`
- auto-discovered smoke evidence: `9e28a6b2ea44b026992119e361fc37e05deadbef`
- status-only freshness allowlist correction:
  `918f81d47965b40ff4427a80cc9c4d72d27c4586`

Single-machine smoke passed without `-DashboardBaseUrl`:

- dashboard base URL: `http://127.0.0.1:3001`
- dashboard base URL source: `musu up.dashboard.reachable_url`
- bridge URL: `http://127.0.0.1:8573`
- dashboard task id: `42c7678d-22dd-4126-8ec2-1a1f4a3e15e8`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260604_130238`

Canonical evidence:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-130301-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-130301-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-130301-HUGH_SECOND.summary.md`

Validation:

- PowerShell parser checks passed for touched scripts
- `git diff --check` passed
- single-machine evidence verifier passed with `ok=true`, `fail_count=0`
- runtime CPU scenario matrix verifier passed with `ok=true`, `fail_count=0`
- desktop release audit now reports `single_machine_verified=true`

Clean go/no-go on `918f81d4`:

- `ready=false`
- `local=true`
- `single=true`
- `multi=false`
- `msix=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- `p2p=false`
- `support=false`
- `store=false`
- `dirty=false`
- blockers `6`
- blocker areas:
  `multi-device,runtime-idle-cpu,runtime-cpu-scenario-matrix,support-mailbox,store-release,p2p-control-plane`

## Release Meaning

This closes the one-machine dashboard-port confusion and makes the release
smoke follow the packaged runtime's actual local dashboard URL. It does not
complete second-PC validation or hosted `musu.pro` P2P proof.

Public release remains No-Go until the second Windows PC has the current MUSU
build installed and returns passing multi-device, CPU, runtime matrix, and
release-grade P2P/relay evidence, plus support mailbox and Store evidence.
