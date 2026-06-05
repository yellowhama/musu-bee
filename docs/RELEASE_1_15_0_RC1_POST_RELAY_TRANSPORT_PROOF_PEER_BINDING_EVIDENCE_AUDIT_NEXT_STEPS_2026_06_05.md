# MUSU 1.15.0-rc.1 Post Relay Transport Proof Peer Binding Evidence, Audit, And Next Steps

**Wiki ID**: wiki/744

Date: 2026-06-05
Scope: MUSU Desktop local runtime, hosted `musu.pro` P2P control plane, evidence refresh, qualitative audit, and next-step plan after relay transport proof peer binding.

## Product Spec Lock

MUSU Desktop is the local executor. It runs the agent runtime, local files/processes, browser/app automation, and peer communication on each machine.

MUSU.PRO is the remote input and coordination surface. It can accept work orders from another location, provide project/company rooms, show agent presence, broker rendezvous and path selection, issue relay fallback policy, and store evidence. It is not the default execution server and must not be the default payload data path.

For multi-device work, MUSU.PRO may make initial connection easier by giving each installed local program the right room, session, peer, and candidate-route context. After that, the preferred data path is P2P mesh: `lan`, `tailscale`, `direct_quic`, then `relay` only as fallback.

Relay release evidence must prove the whole chain:

- owner-scoped relay lease
- matching `session_id`
- matching `source_node_id`
- matching `target_node_id`
- release tunnel transport proof
- release transport kind
- payload transit proof
- payload delivery proof

The new peer-binding gate closes a proof-reuse gap: a valid-looking relay transport proof for one peer pair can no longer be reused to upgrade a different route evidence record.

## Evidence Refreshed

After the peer-binding source change, HUGH_SECOND packaged local-runtime evidence was rebuilt and refreshed.

- MSIX install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-200256-HUGH_SECOND.evidence.json`
- single-machine bridge-only smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-200449-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-201254-HUGH_SECOND.desktop-open.evidence.json`
- normal five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-201430-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- HUGH-MAIN targeted post-route CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-202107-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key local results:

- single-machine surface: `local-bridge-only`
- bridge: `http://127.0.0.1:11648`
- dashboard required: `false`
- CLI route checked: `true`
- idle CPU sample: `60.036s`, MUSU `0`, Node `0`, WebView2 `0.1`, hot `0`
- normal matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_201430`
- normal matrix route task: `f478b4b7-ac57-488c-93eb-0d046df4cabc`
- normal matrix max role CPU: MUSU `0`, Node `0`, WebView2 `0.18`
- targeted HUGH-MAIN command used `musu route --target HUGH-MAIN`
- targeted HUGH-MAIN route did not complete, but failure was allowed for this CPU-only attempt
- targeted post-route sample: `60.041s`, MUSU `0.05`, Node `0`, WebView2 `0.08`, hot `0`

The targeted HUGH-MAIN evidence is not passing multi-device proof. It only proves that the primary machine remains inside CPU budget after a targeted second-PC route attempt.

## Current Go/No-Go

Clean go/no-go after evidence commit `b001924a` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`

Remaining release blockers:

- real second-PC multi-device evidence has not been recorded
- runtime idle CPU evidence has not passed on at least two machines
- runtime CPU scenario matrix evidence has not passed on at least two machines
- `musu@musu.pro` delivery has not been operator-verified
- Partner Center / Microsoft Store evidence has not been recorded
- live `https://musu.pro` P2P control-plane evidence has not proven release-grade relay storage, transport, route evidence, payload transit, and delivery proof

## Code Audit

Audit finding: no high or medium correctness issue was found in the peer-binding change set.

Reasoning:

- `POST /api/v1/p2p/route-evidence` now requires inline relay transport proof to carry `source_node_id` and `target_node_id`.
- Inline proof mismatch produces explicit non-release blockers rather than silently upgrading route evidence.
- `release_grade=true` relay evidence queries revalidate stored/current transport proof against the route evidence source and target.
- Rust `RouteRelayTransportProof` serializes the same peer-binding fields, keeping local DTO output aligned with hosted proof shape.
- Current Rust route evidence still does not emit inline relay transport proof by default, so the stricter hosted schema does not break the local bridge's current direct-route path.

Compatibility caveat:

- Older/manual clients that submit inline `musu.relay_transport_proof.v1` without `source_node_id` and `target_node_id` will be rejected as malformed. This is intentional for release evidence integrity.

Validation rerun on 2026-06-05:

```powershell
npm run test:p2p
npm run typecheck
cargo test --manifest-path .\musu-rs\Cargo.toml --lib route_evidence_serializes_relay_transport_proof_peer_binding_fields
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\write-release-go-no-go.ps1 -Json
git diff --check
```

Results:

- P2P tests passed: `85/85`
- TypeScript typecheck passed
- Rust peer-binding DTO test passed: `1/1`
- P2P store-forward relay contract audit passed: `ok=true`, `fail_count=0`
- P2P env status correctly remains `ok=false`
- clean go/no-go remains public release No-Go with six blockers
- whitespace check passed before the documentation update

One invalid command was also attempted from the repository root: `npm run test:p2p` failed with `ENOENT` because `package.json` lives in `musu-bee\`. The valid run above was executed from `F:\workspace\musu-bee\musu-bee`.

## Qualitative Assessment

Current quality is good for the one-machine local desktop contract and still incomplete for public multi-device release.

- Local desktop/runtime direction is now coherent: browser `localhost:3001/app` is optional developer/workspace UI, not the packaged program.
- Product boundary is cleaner: MUSU.PRO should collect remote input and coordinate agents; installed local MUSU programs do the actual work.
- Evidence integrity improved: relay route proof now binds lease, session, transport kind, payload/delivery proof, and peer pair.
- Store-forward relay queue fallback is useful as a preview/control-plane capability, but it is still non-release-grade and separated from release tunnel transport.
- Release risk remains concentrated in external proof, not local desktop smoke: second-PC current-build evidence, hosted KV/Upstash, real release relay tunnel, support mailbox, and Store proof.

Pragmatic rating:

- local single-machine desktop beta: strong
- release evidence discipline: strong
- hosted P2P control-plane readiness: not ready
- public Windows desktop release: No-Go
- multi-device product proof: not proven on the current build

## Next Steps

1. Install the current MUSU build on HUGH-MAIN or another second Windows PC.
2. Run the second-PC release check and import the returned evidence.
3. Record real multi-device route evidence, not just targeted CPU attempt evidence.
4. Record second-PC desktop-open idle CPU and five-state runtime CPU matrix evidence.
5. Provision production KV/Upstash for hosted P2P proof stores.
6. Replace the fail-closed relay connect/payload placeholders with real release tunnel transport before setting release transport markers.
7. Record owner-scoped `musu.pro` release-grade relay route evidence with transport and delivery proof.
8. Verify `musu@musu.pro` support mailbox delivery.
9. Record Partner Center product reservation, app submission, Microsoft certification, and restricted capability approval evidence.
10. Re-run final go/no-go from clean HEAD.

## Indexing

Indexing was refreshed after this report and related wiki/spec updates:

```powershell
bun run C:\Users\empty\.agents\skills\gstack\bin\gstack-gbrain-sync.ts --quiet
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Results:

- gbrain detect passed with CLI `gbrain 0.37.9.0`, engine `pglite`, doctor OK, and local status OK.
- gbrain sync code stage passed: source `gstack-code-musu-bee-8815b622`, `page_count=148`.
- gbrain sync memory stage passed: `573 written`, `0 failed`.
- gbrain brain-sync stage returned a non-green state (`gstack-brain-sync exited undefined`), while the local error log marked the stage outcome as OK. Treat this as `DONE_WITH_CONCERNS`.
- gbrain capability/search guidance was not added to `AGENTS.md` because the Windows `gbrain put` probe hit `/dev/stdin` ENOENT and `gbrain search` / `gbrain code-def RouteRelayTransportProof` returned no hits despite the source page count.
- MUSU local code/doc indexer passed on the final run: `2404 files`, `2690 symbols`, `13070 ms`.

Operational note: for this repo on Windows, the project-local `musu indexer sync` remains the reliable code/docs index evidence. gbrain source registration is present but semantic/symbol search should not be treated as verified until a future capability check succeeds.
