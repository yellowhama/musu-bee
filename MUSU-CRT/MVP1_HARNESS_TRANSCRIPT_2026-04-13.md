# MUS-1827 MVP-1 Harness Transcript (No Model)

Run date (UTC): 2026-04-12T23:56Z

## Command Snippet

```bash
cd /home/hugh51/musu-functions/MUSU-CRT
out_dir=../work/mus1827-mvp1-ctoreplay
mkdir -p "$out_dir"
set -o pipefail
../scripts/mvp1_demo.sh --mode fixture "$out_dir" | tee "$out_dir/mvp1-demo-transcript.txt"
echo "exit_code=$?"
```

## Deterministic Smoke Check

```bash
bash /home/hugh51/musu-functions/scripts/test-mvp1-demo-fixture-smoke.sh \
  /home/hugh51/musu-functions/work/mus1827-mvp1-fixture-smoke
```

## Replay Evidence (Clean Path, Fixture Mode)

- Replay out dir: `/home/hugh51/musu-functions/work/mus1827-mvp1-ctoreplay`
- Replay exit code: `0`
- Replay summary: `/home/hugh51/musu-functions/work/mus1827-mvp1-ctoreplay/mvp1-demo-summary.json`
- Replay transcript: `/home/hugh51/musu-functions/work/mus1827-mvp1-ctoreplay/mvp1-demo-transcript.txt`

```text
[MVP1] forward_decision: forward_to_5070Ti (trust_gate_reason=peer-allowed, import_decision_reason=clean)
[MVP1] round_trip_ms: 260
[MVP1] result: stub-result: 5070Ti accepted 'analyze image' and returned canned analysis
exit_code=0
```

## Acceptance Markers

- Forward decision: `forward_to_5070Ti`
- Round-trip time: `30707 ms`
- Stub response (no heavy model): `stub-result: 5070Ti accepted 'analyze image' and returned canned analysis`

## Artifact Paths

- Summary JSON: `/home/hugh51/musu-functions/work/mus1827-mvp1/mvp1-demo-summary.json`
- Proof JSON: `/home/hugh51/musu-functions/work/mus1827-mvp1/musu-connects-live-proof.json`
- Transcript TXT: `/home/hugh51/musu-functions/work/mus1827-mvp1/mvp1-demo-transcript.txt`
- Harness log: `/home/hugh51/musu-functions/work/mus1827-mvp1/mvp1-demo-run.log`

## Raw Transcript

```text
proof written: ../work/mus1827-mvp1/musu-connects-live-proof.json
selected service: demo-api
projected routes: 1
suppressed routes: 0
trust level: trusted
discovery state: verified
trust gate reason: peer-allowed
import decision reason: clean
transport evidence kind: runtime-musu-port-http-route-plane-v1
session evidence mode: runtime-peer-authenticated
session remote addr source: quic-session-event.remote_addr
pairing session: session-a
[OK] MUS-27 live harness artifacts generated
  - scenario: verified-peer
  - trust:    trusted / verified
  - health:   ../work/mus1827-mvp1/musu-port-health.json
  - routes:   ../work/mus1827-mvp1/musu-port-routes.json
  - proof:    ../work/mus1827-mvp1/musu-connects-live-proof.json
  - runtime:  ../work/mus1827-mvp1/musu-connects-runtime-transport-evidence.json
  - manifest: ../work/mus1827-mvp1/mus27-live-harness-manifest.json

[MVP1] message: analyze image
[MVP1] target: 5070Ti (peer-5070ti)
[MVP1] mode: live-mus27
[MVP1] selected_service: demo-api
[MVP1] forward_decision: forward_to_5070Ti (trust_gate_reason=peer-allowed, import_decision_reason=clean)
[MVP1] round_trip_ms: 30707
[MVP1] result: stub-result: 5070Ti accepted 'analyze image' and returned canned analysis
[MVP1] session_id: session-a
[MVP1] remote_addr: peer-5070ti.mesh.internal:4433
[MVP1] transport_evidence_kind: runtime-musu-port-http-route-plane-v1
[MVP1] summary: ../work/mus1827-mvp1/mvp1-demo-summary.json
[MVP1] proof:   ../work/mus1827-mvp1/musu-connects-live-proof.json
[MVP1] log:     ../work/mus1827-mvp1/mvp1-demo-run.log
```
