# W-6 세부 플랜 — relay 통합 테스트 (2-bridge 왕복 회귀 가드)

> 마스터: `CONNECTION_COMPLETION_MASTER_PLAN_2026_06_20.md` · 세션 플랜: `~/.claude/plans/cosmic-honking-cake.md`
> 브랜치: `feat/relay-reverse-callback` (W-1 `2390cef7` + W-2 `e39ceeb5` + W-5 `a1dc9842` 위)

## 목표

W-1(역방향 relay callback) + W-2(sender 상태 정합)가 **실제로** 동작함을 hermetic하게 증명하고 회귀를 막는다. forward task → relay KV → drain → 실행 → 역방향 callback 전 구간을, **direct peer 경로가 전혀 없는 상태**에서 relay만으로 왕복시킨다("Tailscale 없이 relay만으로 도는가" = 제품 핵심 명제).

## 아키텍처: (A) 2 실제 bridge child + wiremock mock-cloud (사용자 승인)

- 실제 `musu bridge` child 2개(sender/receiver) — 기존 `tests/r2_smoke.rs` 관용 그대로(실 바이너리 부팅 + poller + runner + adapter 전 경로 충실).
- relay hop은 HTTP 불가피 → wiremock mock-cloud(이미 dev-dep `Cargo.toml:159 wiremock=0.6`)가 musu.pro 대역. `MUSU_CLOUD_BASE_URL` 단일 override로 forward·drain·callback 모두 mock으로.
- 결정적 실행: `adapter_type="echo"`(`runner.rs:1293` → `"echo: {prompt}"`). 네트워크/AI 불필요, output 정확 검증 가능.

## 확정 사실 (코드 실측)

- spawn 헬퍼: `tests/r2_smoke.rs:54 spawn_bridge()`(env!("CARGO_BIN_EXE_musu") + .arg("bridge")), `:40 pick_port()`, `:79 wait_for_ready()`(/health 폴).
- 로그인: `MUSU_TOKEN=...` env로 충분(`cloud/token.rs` env 우선, 파일 불필요).
- forward 경로: `forward.rs:984 forward_to_peer_with_retry` → rendezvous 먼저(`rendezvous.rs` prepare) → direct candidate 시도 → 전멸 시 `request_relay_lease_after_direct_failure` → FORWARDED_TASK envelope submit.
- drain: `relay_payload.rs:666 drain_relay_payloads_for_local_target` → `:537 accept_relay_payload_by_kind` → forwarded면 `accept_forwarded_task`(forward.rs:728) → runner 실행 → `runner.rs:361 fire_callback`(direct 3회 실패) → `forward.rs:388 queue_callback_via_relay`(역 lease + TASK_CALLBACK envelope).
- poller: `relay_payload.rs:424 start_relay_payload_poller_if_enabled`(`MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1` + interval env).
- mock JSON 계약: `cloud/mod.rs` — rendezvous(`P2pRendezvousSession ~:490`), lease(`P2pRelayLeaseResponse ~:547`, `P2pRelayLease ~:531`), payload(`P2pRelayPayloadResponse ~:839`, claim `P2pRelayPayloadClaimResponse ~:918`, delivery `P2pRelayPayloadDeliveryResponse ~:945` + `RouteRelayPayloadDeliveryProof ~:697`). RouteKind snake_case(`"lan"`/`"relay"`/`"failed"` ~:188).

## 구현 — `tests/w6_relay_roundtrip.rs` (신규)

### mod mock_cloud
- `MockServer::start()`(wiremock, 랜덤 포트, `.uri()` → MUSU_CLOUD_BASE_URL).
- `Arc<Mutex<MockCloudState{ payloads: Vec<StoredPayload>, seq: u64 }>>`.
- `StoredPayload{ payload_id, session_id, lease_id, source_node_id, target_node_id, tunnel_id, payload_kind, payload_base64, payload_sha256, payload_bytes, status, claimed_by, claimed_at, delivered_at }`.
- 엔드포인트:
  - `POST /api/v1/p2p/rendezvous` → 고정 session_id + target=단일 죽은 `lan` candidate `127.0.0.1:1`(direct 결정적 실패). `/candidates` echo, `GET {id}` echo, `/close` 200.
  - `POST /api/v1/p2p/relay/lease` → lease_issued + route_kind:"relay" + 유니크 lease_id.
  - `POST /api/v1/p2p/relay/payload`(submit) → push(status="queued", payload_id="pl-<seq>"), resp ok/accepted/stored=true + echoed payload.
  - `PATCH /api/v1/p2p/relay/payload` → **body shape 분기**: claim(claimant_node_id/limit) = target의 queued→claimed + payload_base64 채움 + claimed_by/claimed_at; delivery(payload_id만) = delivered + delivery_proof(sha256/bytes/claimed_by/claimed_at/created_at/delivered_at 일치).
  - catch-all 200: `/relay/transport-proof`, route-evidence submit(best-effort).
- helper: `queued_payload_kinds()`, `delivered_count()`, `seed_callback(...)`(테스트2용).

### 헬퍼 (r2_smoke 미러)
- `BridgeProc`(Drop=kill), `pick_port()`, `wait_for_ready()`, `tempdir` per-bridge.
- `spawn_bridge_for_relay(node_name, port, db, musu_home, mock_base, token, dead_peer_addr)`.
- 양 child env: `MUSU_CLOUD_BASE_URL=<mock>`, `MUSU_TOKEN=test-token`, `MUSU_NODE_NAME={sender|receiver}-node`, `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1` + 짧은 interval, `MUSU_ENV=development`, `MUSU_DISABLE_RATE_LIMIT=1`, `MUSU_BRIDGE_TOKEN`, `BRIDGE_PORT`, `MUSU_BRIDGE_DB_PATH`.

### 테스트 2개
1. `w6_forward_via_relay_and_reverse_callback_roundtrip`:
   - mock 부팅 → receiver(poller on) → sender(poller on, dead forward target) → 둘 다 wait_for_ready.
   - sender에 task POST(forward 경로 진입; `adapter_type="echo"`). 확인: 진입 route = `run.rs:196`/`tasks.rs` forward path.
   - bounded poll(~25s).
   - **assert**: sender route_executions 행 pending→done; output == `echo: <prompt>`; `forwarded_to_node=="receiver-node"`; `remote_task_id` 채워짐; mock에 forwarded_task + task_callback 2 payload enqueue→delivered.
2. `w6_forged_callback_wrong_source_node_is_rejected`(W-1 S-1/S-2):
   - mock KV에 `node != source_node_id`(S-2) 또는 미바인딩 node(S-1) callback 사전 주입.
   - **assert**: sender 행 pending 유지(≥2 poller cycle 후).

### 사전 sanity sub-test (리스크 4 대비)
- 본 e2e 전에 mock의 rendezvous JSON을 실제 `P2pRendezvousSession`으로 decode 성공 확인(틀리면 relay 큐 silent skip = 헛검증).

## 실행
```powershell
$env:RUST_MIN_STACK="8388608"; $env:CARGO_BUILD_JOBS="2"
cargo test --test w6_relay_roundtrip -- --nocapture --test-threads=1
```
예산 ~25s(direct backoff ~7s + poller). 전체 회귀: `cargo test --lib`.

## 리스크 & 대응
1. PATCH claim/delivery 같은 path+method → body 분기 필수(claimant_node_id 유무).
2. timing(backoff+poller) → interval ~1s, 예산 ~25s.
3. ~~offline adapter~~ 해소: echo 어댑터 실재(`runner.rs:1293`).
4. rendezvous JSON 정확성 → 사전 decode sanity sub-test.
5. C-1 binding race(callback이 binding 전 도착 → retriable) → ≥2 poller cycle 허용.
6. Windows 포트 race → r2_smoke pick_port 관용 수용.

## 검증 (무당짓 금지)
- `cargo test --test w6_relay_roundtrip` 2 테스트 green.
- 전체 `cargo test --lib` 회귀 0.
- GATE2: rust-reviewer Critic → 수정 → Auditor.
