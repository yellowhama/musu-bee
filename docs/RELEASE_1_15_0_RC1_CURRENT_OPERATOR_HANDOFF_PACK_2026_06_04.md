# MUSU 1.15.0-rc.1 Current Operator Handoff Pack - 2026-06-04

## Context

After the post relay-drain primary evidence refresh, the current clean HEAD
regenerated the final operator gate packet and the single operator action pack.
This records the current local-first release roadmap state:

- MUSU.PRO is the web coordination/control-plane surface for remote user input,
  rendezvous, meeting-room style project coordination, and relay proof.
- Local MUSU programs still perform the actual work on each device.
- Second-PC installation/evidence is still required before the P2P mesh and
  two-machine runtime CPU gates can close.

## Generated Artifacts

- Source commit:
  `8adbfaf1da9c76ba18af81542dec370b8d28fd6f`
- Final operator gate packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-094858.zip`
- Final operator gate packet latest alias:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- Multi-device kit:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-094858\kits\musu-multidevice-1.15.0-rc.1-20260604-094858.zip`
- Operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940.zip`
- Operator action pack latest alias:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- Second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-094940.zip`
- Partner Center submission zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-094940.zip`
- Support mailbox verification id:
  `musu-store-support-1.15.0-rc.1-20260604-094858`

## Verification

- `prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell -Json` passed.
- `verify-final-operator-gate-packet.ps1` passed with `ok=true`,
  `fail_count=0`, and `kit_count=1`.
- `prepare-operator-action-pack.ps1 -Json` passed.
- `verify-operator-action-pack.ps1` passed with `ok=true` and
  `fail_count=0`.
- `show-final-release-handoff-status.ps1 -Json` generated
  `2026-06-04T09:54:31.2686360+09:00` and reported:
  - `packet.verified=true`
  - `action_pack.verified=true`
  - `ready_for_public_desktop_release=false`
  - `manifest_git.dirty=false`

## Handoff Status

Passing local gates:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `public_metadata_ok=true`

Still open:

- `multi_device_verified=false`
- runtime idle CPU evidence is `1/2` machines: `HUGH_SECOND`
- runtime CPU scenario matrix evidence is `1/2` machines: `HUGH_SECOND`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `p2p_control_plane_verified=false`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`
- `p2p_relay_payload_delivery_proof_valid_count=0`

## Remaining Blockers

Public desktop release remains No-Go until all of these are recorded:

- real second-PC multi-device evidence
- runtime idle CPU evidence on at least two machines
- runtime CPU scenario matrix evidence on at least two machines
- `musu@musu.pro` delivery verification
- Partner Center product-name reservation, app submission, Microsoft
  certification, and restricted capability approval evidence
- live `https://musu.pro` owner-scoped relay lease, relay transport descriptor,
  route evidence, payload transport proof, and delivery proof

## Next Operator Action

Copy the current second-PC transfer zip to a real second Windows PC, run the
included second-PC release check there, return the generated archive, and import
it on the primary machine. That is the next evidence step for the P2P mesh and
two-machine runtime CPU gates.
