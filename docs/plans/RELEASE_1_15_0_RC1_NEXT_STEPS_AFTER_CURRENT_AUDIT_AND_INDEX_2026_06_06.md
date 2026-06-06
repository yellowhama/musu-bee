# MUSU 1.15.0-rc.1 Next Steps After Current Audit and Index

Generated: 2026-06-06 17:50 KST

HEAD: `c879a849f403aadefdd071a012aaa4cd304cbf24`

## Goal

Move from one-machine packaged desktop readiness to public desktop release
readiness without weakening the local-executor and MUSU.PRO control-plane
boundary.

## Execution Order

1. Second PC current-build install and return archive
   - Install the current MSIX on the second Windows PC.
   - Run the second-PC release check from the current operator pack.
   - Include MSIX install, single-machine smoke, desktop-open idle CPU, runtime
     CPU matrix, route explain, and route evidence.
   - Import with `scripts\windows\import-second-pc-return.ps1`.

2. Two-machine route proof
   - Prove successful route execution, not only an allowed failed route attempt.
   - Require path-selection evidence and candidate address consistency.
   - Prefer direct `lan`, then `tailscale`, then `direct_quic`.
   - Use relay only after direct paths are proven unavailable.

3. Hosted P2P production environment
   - Log in the packaged runtime with the WindowsApps alias.
   - Configure production KV/Upstash relay lease storage.
   - Redeploy or reload `https://musu.pro`.
   - Rerun `record-p2p-control-plane-evidence.ps1 -BaseUrl https://musu.pro`.

4. Release relay tunnel implementation
   - Implement a real `quic_relay_tunnel` local runtime.
   - Implement the distinct release relay payload endpoint.
   - Keep the preview store-forward queue non-release-grade.
   - Emit release-bound `musu.relay_transport_proof.v1`.
   - Emit release-bound `musu.relay_payload_delivery_proof.v1`.

5. External business gates
   - Verify `musu@musu.pro` support mailbox delivery.
   - Complete Store/Partner Center release evidence.
   - Rerun go/no-go without skipping public metadata.
   - Regenerate the final operator packet only after all blockers clear.

## Non-Negotiable Boundaries

- MUSU Desktop executes local work.
- MUSU.PRO accepts remote user input and coordinates rooms, presence,
  rendezvous, path selection, relay fallback, and evidence.
- MUSU.PRO must not become the default executor.
- Hosted relay must not become the default data path.
- `localhost:3001` is optional developer/operator dashboard behavior, not the
  packaged desktop runtime contract.

## Current Quality Bar

Do not mark public release ready until all of these are true:

- `multi_device_verified=true`
- `runtime_idle_cpu_verified=true` with two machines
- `runtime_cpu_scenario_matrix_verified=true` with two machines
- `p2p_control_plane_verified=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- `ready_for_public_desktop_release=true`
