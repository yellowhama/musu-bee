# 1.15.0-rc.1 Second-PC Route Preflight

Date: 2026-06-07 17:25 KST

## Scope

Added a primary-side second-PC route preflight helper:

- `scripts\windows\test-second-pc-route-preflight.ps1`

The helper consumes a returned second-PC handoff JSON or return zip, resolves
`suggested_remote_addrs`, selects `remote_name` / `route_target`, runs local
MUSU readiness checks, registers the target peer with `musu peer add`, verifies
`musu peer list`, and runs `musu route --explain --target <SECOND_PC_NAME>`.

This is not multi-device proof. It is an operator preflight that catches
missing peer registration, self/local targets, and bad returned handoff data
before spending a 60s post-route CPU matrix or running final multi-device
smoke.

## Changed

New script:

- `scripts\windows\test-second-pc-route-preflight.ps1`

Updated package/verification surfaces:

- `scripts\windows\prepare-multidevice-test-kit.ps1`
- `scripts\windows\prepare-final-operator-gate-packet.ps1`
- `scripts\windows\prepare-operator-action-pack.ps1`
- `scripts\windows\verify-final-operator-gate-packet.ps1`
- `scripts\windows\verify-operator-action-pack.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `scripts\windows\audit-desktop-release-readiness.ps1`
- freshness/status-only allowlists in:
  - `scripts\windows\write-release-go-no-go.ps1`
  - `scripts\windows\verify-single-machine-evidence.ps1`
  - `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

## Preflight Output

The script writes:

```text
.local-build\second-pc-route-preflight\*.second-pc-route-preflight.json
```

Schema:

```text
musu.second_pc_route_preflight.v1
```

The evidence includes:

- selected `handoff_path`
- selected `remote_addr`
- selected `remote_name`
- selected `route_target`
- command log for `musu up`, `musu doctor`, `musu peer add`,
  `musu peer list`, and route explain
- checks for version, handoff shape, non-local target, peer registration, and
  route explain
- next commands:
  - `measure-musu-runtime-cpu-scenarios.ps1 -RouteTarget ...`
  - `smoke-multidevice-beta.ps1 -RemoteAddr ... -RemoteName ... -RouteTarget ...`
  - `record-route-reachability-diagnostic.ps1 -Target ...`

## Command

Primary-side command after receiving the second-PC return zip:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-second-pc-route-preflight.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -Json
```

Fallback using a handoff JSON directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-second-pc-route-preflight.ps1 -HandoffPath .local-build\second-pc-handoff\<HANDOFF_JSON> -Json
```

## Smoke Result

Local synthetic smoke used a fake non-local handoff with
`203.0.113.2:8949`, `SECOND-PC`, `-SkipPeerAdd`, and `-SkipRouteExplain`.

Result:

- exit code `1`
- schema `musu.second_pc_route_preflight.v1`
- `ok=false`
- evidence file written
- `target peer listed=fail`

That is the expected failure mode for a fake target when local peer state is not
modified. It proves the helper writes structured evidence instead of failing
with an opaque route command error.

## Release Meaning

The latest failure mode in local CPU diagnostics was:

```text
peer 'PRIMARY-PC' not found
```

This preflight makes that state explicit before targeted post-route CPU
sampling. It does not close the release gates by itself. Public release still
requires real second-PC runtime CPU/matrix evidence, successful multi-device
route proof, hosted MUSU.PRO route/relay proof, support mailbox proof, and
Store proof.
