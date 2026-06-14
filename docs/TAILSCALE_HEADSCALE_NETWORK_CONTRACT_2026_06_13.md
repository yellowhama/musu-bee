# MUSU Headscale Network Contract

Date: 2026-06-13

## Product Position

MUSU must not require a Tailscale.com account. "Install MUSU, then sign up for
Tailscale" is not an acceptable product path. MUSU's network contract is
local/LAN-first, then MUSU-managed or user-provided Headscale for cross-network
overlay, then MUSU relay/direct transport as those paths mature.

The correct MUSU promise is:

- MUSU can run over a plain LAN without Tailscale.
- MUSU can run over a Headscale-operated tailnet without a Tailscale.com
  account because MUSU owns the enrollment wrapper and points the compatible
  mesh client at a Headscale login server internally.
- MUSU may support Tailscale.com only as an explicit opt-in escape hatch for a
  user who already chose that external dependency. It must never be presented as
  required setup.
- MUSU must keep its own route evidence so the cockpit can distinguish LAN,
  Tailscale/Headscale overlay, direct public QUIC, and MUSU relay paths.

## Official Semantics MUSU Must Respect

- `tailscale ip -4` is the official way to read the current device's Tailscale
  IPv4 address. MUSU should prefer it over guessing from local interfaces.
- A `100.64.0.0/10` address is a tailnet IPv4 address, but seeing that range on
  an interface is not enough proof that the current process can reach a peer.
- `tailscale ping <hostname-or-ip>` verifies connectivity over Tailscale and
  gives more useful route/debug detail than ordinary OS ping.
- Tailscale Serve exposes a local service to the tailnet, and Funnel exposes it
  publicly. MUSU's current peer route does not require Serve; it directly
  connects to the bridge's `http://<tailnet-ip>:<port>` endpoint. Therefore the
  target bridge must be listening on a reachable interface/port and allowed by
  local firewall, Shields Up, and tailnet policy.
- `tailscale login/up --login-server=<url>` can point a compatible client at a
  Headscale control server instead of Tailscale's default control plane. For
  MUSU this is an upstream primitive and manual fallback, not the default user
  instruction.

## Headscale Boundary

Headscale describes itself as an open source, self-hosted implementation of the
Tailscale control server. Its stated design goal is a narrow-scope, single
tailnet suitable for personal projects, labs, or small open-source
organizations.

For MUSU, that means Headscale is not a footnote; it is the default cross-network
control-plane strategy until MUSU has its own fully native transport. MUSU
should present network modes as:

- `No overlay`: LAN-only mode, no Tailscale dependency, only works where
  machines can directly reach each other.
- `MUSU Headscale`: MUSU-managed or user-provided Headscale control plane,
  suitable for one owner/small team/single tailnet, no Tailscale.com account.
- `External Tailscale.com`: explicit opt-in only, external control-plane
  dependency, not required to use MUSU.

## MCP Agent Runbook

LLM/MCP agents must not send the user to Tailscale.com as the default answer.
When asked to connect machines across networks, they should:

1. Try local/LAN reachability first.
2. Check for an existing MUSU Headscale control URL.
3. If missing, provision or request the MUSU-owned Headscale endpoint.
4. Generate a MUSU device-add pass from the Headscale bundle helper or Cockpit
   Add PC flow.
5. Join each MUSU machine with
   `musu mesh join --device-add-pass <musu.device_add.v1.json>`.
6. Capture `tailscale ip -4` for every node.
7. Verify overlay reachability with `tailscale ping --timeout=5s --c=1 <target>`.
8. Verify MUSU reachability with `http://<target-tailnet-ip>:<port>/health`.
9. Run delegated task proof and require callback reconciliation.

Plain `tailscale login` is forbidden unless the user explicitly chooses the
external Tailscale.com escape hatch.

Raw `tailscale login/up --login-server` is also forbidden as the normal MUSU
instruction. It may appear only in low-level implementation/debug docs or when
an operator explicitly requests the manual fallback.

## Verification Contract

A MUSU route may claim `route_kind=tailscale` or `headscale-backed` only when
the evidence includes:

- a target endpoint in `100.64.0.0/10`;
- successful `tailscale ip -4` on the source machine;
- successful `tailscale ping --timeout=5s --c=1 <target>`;
- successful HTTP bridge health check at `http://<target-tailnet-ip>:<port>/health`;
- a completed delegated task callback to the source cockpit.

`tailscale ping` alone is insufficient because it proves overlay reachability,
not that the MUSU bridge service is listening or permitted through the target's
local firewall. Bridge `/health` alone is insufficient because it does not prove
the path is the Tailscale overlay.

## 2026-06-13 Deep Review Contract Update

MUSU's product language must distinguish three different things that are easy to
collapse accidentally:

- `Tailscale client`: the compatible local client/daemon MUSU can use today.
- `Tailscale.com service`: the hosted coordination server and account system
  MUSU must not require by default.
- `Headscale`: the self-hosted coordination server MUSU uses for the default
  Private Mesh path.

The product can say "compatible mesh client" or "Tailscale-compatible client" in
operator docs. The product must not say "sign up for Tailscale" in the default
path.

S-grade proof requires two layers:

- Control-plane proof: `musu mesh join --device-add-pass` consumed a MUSU
  device-add pass, verified public `<login-server>/health`, persisted local
  config as `musu_headscale`, and the cockpit labels the route as
  `Private Mesh`.
- Work-loop proof: source and target exchange a delegated MUSU order over the
  tailnet route, target bridge health passes, callback authenticates to the
  source, and the saved release verifier returns `ok=true`.

Current implementation boundary:

- The cockpit may copy a target-bound native
  `musu mesh release-proof --target-node ... --target-ip ...` command and may
  run that native proof through Tauri IPC for MUSU Private Mesh peers.
- The product still must not claim full release-grade network proof until that
  Cockpit IPC path is verified in a packaged desktop build on two physical
  machines joined through the MUSU Headscale control plane.
- Repo-relative PowerShell runners remain useful for Windows operator evidence
  replay, but they are no longer the product contract for new Cockpit copy.

## Changes Applied

- `musu-rs/src/peer/tailscale.rs` now prefers `tailscale ip -4`, then falls
  back to interface scanning for `100.64.0.0/10`.
- `scripts/windows/smoke-real-peer-route-proof.ps1` now performs Tailscale
  preflight when `-TailscaleIp` or `-ExpectedRouteKind tailscale` is supplied:
  it records local `tailscale ip -4`, `tailscale ping`, best-effort
  `tailscale whois --json`, and target bridge `/health`.
- The smoke script supports `-TailscaleBridgePort` when the target bridge is not
  on the default `8070`.
- `musu-bee/src/prompts/musu-system-prompt-v1.md` now instructs MUSU agents not
  to require Tailscale.com signup and to use the MUSU-owned bootstrap,
  device-add pass, join, verify, and release-proof commands for Headscale-backed
  Private Mesh setup.
- `musu-rs` now exposes `musu mesh status --json` and
  `musu mesh doctor --json` as the first MUSU-owned Private Mesh diagnostic
  surface. These commands classify the local machine as LAN, MUSU Headscale
  Private Mesh, or explicit external tailnet before agents claim mesh readiness.
- `musu-rs` exposes `musu mesh join --device-add-pass
  <musu.device_add.v1.json>` as the product enrollment path, with
  `musu mesh join --login-server <url> [--authkey <key>]` retained only as an
  advanced/manual fallback. Join persists `~/.musu/private_mesh.toml` and may
  call the compatible mesh client with `tailscale up --login-server` internally,
  but agents and UI must not present raw login/authkey tuples as the default
  path. Verify proves overlay ping plus target bridge `/health`; delegated
  callback proof is still required before release claims.
- `musu-rs` exposes native `musu mesh release-proof --target-node ... --target-ip
  ... --expected-control-server-url ... --json`, and the desktop Cockpit exposes
  a `Run proof` Tauri IPC action that executes it with the fleet row's fixed
  target tuple.

## Sources

- Tailscale CLI reference for `ip`, `login --login-server`, `ping`, and
  `serve`:
  https://tailscale.com/docs/reference/tailscale-cli
- Tailscale 100.x.y.z address reference:
  https://tailscale.com/docs/concepts/tailscale-ip-addresses
- Tailscale DERP relay reference:
  https://tailscale.com/docs/reference/derp-servers
- Headscale repository and design goal:
  https://github.com/juanfont/headscale

## Local Official Documentation Snapshot

The following official documentation has been downloaded for product decisions:

- Tailscale docs sitemap snapshot: `docs/vendor/official-network-docs/tailscale-docs/manifest.json`
  with 575 pages and 0 failed downloads.
- Headscale official repo/docs snapshot:
  `docs/vendor/official-network-docs/headscale/` at
  `21058d11424d5121dbc1eeb3ba0a39d2f462bfcc`.
- Alternative network candidates and site docs manifest:
  `docs/MUSU_PRIVATE_MESH_OPEN_SOURCE_DOCS_MANIFEST_2026_06_13.md`.
