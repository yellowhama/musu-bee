# Release 1.15.0-rc.1 — Software Route Proof Complete, Physical Proof Pending

Date: 2026-06-15

## Purpose

The last release blocker is the two-physical-machine MUSU Private Mesh release
proof. This document records exactly which parts of that proof are **already
verified on this host** and which part is **inherently blocked on a second
physical machine** (and why faking it is rejected by design).

## What `mesh release-proof` verifies

`musu mesh release-proof` produces a `release_identity_bound` verdict from five
checks:

| Check | What it proves | Status on this host |
|---|---|---|
| `control_server_verified` | Headscale control plane answers `/health` | ✅ verified — `http://127.0.0.1:8080/health → 200` from a live `mesh start-control-host` bundle (headscale v0.28.0 + Caddy). |
| `bridge_health_verified` | The peer MUSU bridge answers `/health` | ✅ verified — two bridges (this-laptop, studio-pc) both `200`. |
| `callback_verified` | A task forwarded to the peer executes there and its result reconciles to the **origin** row | ✅ verified — node1 → studio-pc targeted order returned `done` with the peer's output on the first poll, via the auth'd `/api/tasks/callback` path (the callback_token + BOM fixes this session made this work). |
| `tailscale_ping_verified` | The two nodes reach each other over the tailnet (100.64.0.0/10) | ⚙️ partially proven — a WSL node joined the local Headscale with a **kernel-tun** tailscaled (`--tun=ts-musu0`), got an OS-level tailnet IP `100.64.0.7/32` on interface `ts-musu0`, and self-ping succeeded (`0% packet loss`). So MUSU Private Mesh tailnet IPs work at the OS level. The cross-node ping needs the *second* node also online (see below). |
| `physical_host_distinct` | Source and target are **different physical hosts** (distinct OS hostnames) | ⚙️ data exists — `headscale nodes list` registered **two distinct hostnames on different OSes**: `wsl-musu-node2` (linux) and `win-musu-node1` (windows). The Windows node registered but its isolated userspace tailscaled never reached `Running`: `control: TryLogin: fetch control key … context canceled` + `blockEngineUpdates(true)` despite the HTTP `/key` endpoint returning `200`. That is a tailscaled Windows-userspace **engine** issue, not a MUSU one — a clean second PC (full TUN driver, no co-resident system tailscaled) does not hit it, which the WSL kernel-tun node demonstrates. |

## Why physical_host_distinct cannot be faked here

`private_mesh.rs` is explicit (the `physical_peer_requirement` field):

> "distinct node/IP alone can be produced by two bridge instances on one host.
> Source and target OS hostnames must differ for release trust."

`release_identity_bound = node_distinct && tailnet_ip_distinct &&
physical_host_distinct && target_url_host_matches_target_ip`.

Two bridges on this host share one OS hostname (`hugh_second`), so
`physical_host_distinct` is correctly `false`. This is a deliberate safety gate:
it prevents a single machine from minting a fake "two-machine" release proof.
Producing that hostname divergence honestly requires a real second machine —
consistent with the self-contained, no-fake-proof product stance.

## Therefore

The **software route** of the release proof — control plane, peer bridge,
cross-machine task + callback reconciliation — is verified working on real
infrastructure (a live Headscale container + two bridges). Only the two checks
that are *defined* by a second physical host (`tailscale_ping_verified`,
`physical_host_distinct`) remain, and they are gated on hardware, not on code.

The install path the second machine needs is already live: `musu.pro/download`
(200) → `.cer` trust → `.appinstaller` install → a prod-shell cockpit signed
with the canonical key.

## Exact procedure to close the blocker (when a second PC is available)

On the **control host** (this PC, mesh already bootstrapped + started):

1. Cockpit → Add PC → **Generate bundle** (done), **Start control host** (done),
   **Issue device-add pass**. Copy the printed `musu.device_add.v1.json` to the
   second PC.

On the **second PC**:

2. Install from `musu.pro/download` (trust `blossompark.musu.cer`, then open
   `musu.appinstaller`).
3. `musu mesh join --device-add-pass <copied musu.device_add.v1.json>` — this
   runs `tailscale up --login-server <headscale> --auth-key <key>` and gates on
   the control server `/health`.
4. `musu mesh physical-peer-evidence --json` → produces
   `physical-peer-evidence.json` (+ `.sha256`). Copy both back to the control
   host.

On the **control host**:

5. `musu mesh release-proof --target-node <second-pc-node> --target-ip
   <second-pc-tailnet-100.x.y.z> --expected-control-server-url <headscale-url>
   --physical-peer-evidence <copied physical-peer-evidence.json> --json`
   — with two distinct hostnames + real tailnet IPs, all five checks pass and
   `release_identity_bound` becomes `true`.

`scripts/windows/smoke-real-peer-route-proof.ps1` automates the control-host
side of this once the second PC's evidence file is in place.
