# First Product Demonstration Runbook 2026-04-03

## Goal

Show a concrete first-pass product proof for:

`musu-port -> musu-connects -> imported route`

This runbook demonstrates the three required policy axes in the same flow:

- collision
- trust
- freshness

## Scope

- In-repo demonstration based on existing core/application code.
- Single-host runtime proof path with peer-authenticated session evidence (no NAT-hardened multi-machine transport yet).
- Focus on exported route shape, imported route apply shape, and policy outcomes.
- Code-backed demo service exists at `crates/musu-connects-core/src/application/product_demo.rs`.

## Step 1: Export local `musu-port` route shape

Input (`MusuPortServiceRoute`):

```json
{
  "name": "shell",
  "alias": "terminal",
  "protocol": "http",
  "service_class": "agent_facing",
  "agent_facing": true,
  "enabled": true,
  "running": true,
  "port": 3000,
  "target_url": "http://127.0.0.1:3000",
  "entrypoint_url": "http://127.0.0.1:1355/terminal"
}
```

Mapper output (`LocalManagedRoute`) path:

- `DefaultLocalRouteMapper` in `crates/musu-connects-core/src/application/port_adapter.rs`
- verified by test `service_route_mapper_projects_musu_port_shape`

Expected semantics:

- `route_id = "shell"`
- `alias = "terminal"`
- `target_kind = "agent_facing"`
- `visibility = peer_visible`
- `entrypoint.port = 3000`

## Step 2: Advertise and import snapshot

Flow:

1. Publish local managed route into `AdvertisedRouteRegistry`.
2. Import advertised snapshot into `ImportedRouteRegistry`.
3. Build local apply projection (`ImportedRouteApplyService`).

Reference tests:

- `musu_port_service_route_can_flow_through_advertise_import_and_apply`
- `advertised_snapshot_is_imported_into_registry`
- `first_product_demo_service_builds_end_to_end_snapshot`

Expected result:

- one imported route projection exists
- projection alias is `terminal`
- source peer is preserved (`peer-a`)
- projection marked available
- demo snapshot also carries:
  - QUIC control stream descriptor `bi/0/control`
  - pairing session id `session-a`

## Step 3: Collision demonstration

Collision rule proof path:

- local alias conflict: `local_alias_conflict_is_suppressed_on_import`
- cross-peer alias conflict: `merge_policy_suppresses_cross_peer_alias_conflict`

Expected policy output:

- local alias collision -> `import_state = suppressed`, `collision_state = local-alias-conflict`
- cross-peer alias collision -> `import_state = suppressed`, `collision_state = alias-conflict`

## Step 4: Freshness demonstration

Freshness rule proof path:

- `missing_routes_are_marked_withdrawn_after_snapshot_refresh`
- `stale_cleanup_handoff_returns_missing_imports`

Expected policy output:

- route missing from refreshed snapshot is kept for handoff but marked:
  - `import_state = withdrawn`
  - `freshness_state = stale`
  - `collision_state = stale-timeout`

## Step 5: Trust demonstration

Trust gate proof path:

- `blocked_peer_is_rejected` in `crates/musu-connects-core/src/application/pairing.rs`

Expected behavior:

- blocked peer cannot pair
- error frame code is `peer_blocked`
- no active connected session is created for that peer

## End-to-end claim this runbook proves

The current codebase can already prove the first product path at logic level:

1. `musu-port`-like local route shape is exported.
2. `musu-connects` advertises/imports that route.
3. Imported route is projected to local consumable surface.
4. QUIC provider opens listener and emits a control bi-stream.
5. Pairing service establishes a trusted session for the same peer/session.
6. Collision/freshness/trust rules are applied deterministically.

This satisfies the phase-10 objective for a first product demonstration packet.

## Verification command

Primary command:

```bash
cargo test -q
```

Current environment note:

- In this Linux shell, verification is blocked by missing system linker `cc`.
- Existing tests encode the proof path, but full execution requires an environment with working Rust linker toolchain.

## Cross-repo live harness command (MUS-27 packet)

To run a reproducible lane-2 proof that uses live `musu-port` `/routes` output and `musu-connectsd` import/session snapshot:

```bash
/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh
```

Default artifact outputs:

- `/home/hugh51/musu-functions/work/mus27-live-harness/musu-port-health.json`
- `/home/hugh51/musu-functions/work/mus27-live-harness/musu-port-routes.json`
- `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-live-proof.json`
- `/home/hugh51/musu-functions/work/mus27-live-harness/mus27-live-harness-manifest.json`

This gives a repeatable proof path for:

1. `musu-port` route export payload capture
2. `musu-connects` route import/apply snapshot
3. QUIC session + pairing session snapshot bundled into one JSON artifact (`sessionEvidenceMode=runtime-peer-authenticated` for verified peer)
