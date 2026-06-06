# MUSU 1.15.0-rc.1 Next Steps After Current HEAD Qualitative Code Audit

Generated: 2026-06-06 18:15 KST

HEAD: `52d325d43b691c6e1b56404e34cfd2ba85257311`

## Objective

Move from one-machine packaged desktop readiness to public desktop release
readiness while preserving the product boundary:

- MUSU Desktop executes local work on each device.
- MUSU.PRO accepts remote input and coordinates rooms, presence, rendezvous,
  path selection, relay fallback, and evidence.
- MUSU.PRO does not become the executor or default data path.

## Required Sequence

1. Second machine installation and evidence
   - Install the current MSIX on the second Windows PC.
   - Run the second-PC release check from the current operator pack.
   - Include MSIX install, single-machine smoke, idle CPU, runtime matrix,
     route explain, route evidence, and process attribution.
   - Import the return archive with
     `scripts\windows\import-second-pc-return.ps1`.

2. Successful two-machine route proof
   - Prove a successful current-build route.
   - Include path-selection evidence and candidate address consistency.
   - Preserve priority: `lan -> tailscale -> direct_quic -> relay`.
   - Treat the existing failed HUGH-MAIN route attempt as CPU diagnostic only.

3. Live MUSU.PRO runtime login
   - Log in the packaged WindowsApps runtime:
     `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
   - Rerun live hosted P2P evidence against `https://musu.pro`.
   - Require logged-in status for relay status, transport, leases, and route
     evidence queries.

4. Production P2P storage
   - Configure KV/Upstash storage for relay lease, route, transport proof, and
     payload proof evidence.
   - Redeploy or reload MUSU.PRO.
   - Rerun `show-musu-pro-p2p-env-status.ps1 -Json`.

5. Release relay implementation
   - Implement actual local `quic_relay_tunnel` runtime payload movement.
   - Emit `quic_tls_1_3` transport proof bound to session, lease, source,
     target, tunnel, and relay URL.
   - Implement the distinct release payload endpoint.
   - Keep the preview store-forward queue non-release-grade.

6. External business gates
   - Verify support mailbox delivery for `musu@musu.pro`.
   - Complete Store/Partner Center evidence.
   - Rerun go/no-go without skipping public metadata.
   - Regenerate final operator packets only after all gates clear.

## Release-Blocking Fields

Do not mark public release ready until all are true:

- `multi_device_verified=true`
- `runtime_idle_cpu_verified=true` with two machines
- `runtime_cpu_scenario_matrix_verified=true` with two machines
- `p2p_control_plane_verified=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- `ready_for_public_desktop_release=true`

## Guardrails

- Do not treat `localhost:3001` as the packaged desktop runtime.
- Do not set `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` before real tunnel
  payload movement exists.
- Do not set `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true` before release payload
  proof exists.
- Do not allow `websocket_tunnel` or preview queue proof to satisfy
  release-grade relay transport.
- Do not accept relay route evidence without both relay transport proof and
  relay payload delivery proof.
