# V30 마스터 플랜 — fleet 동적 주소 추상화 (2026-06-25)

## Context (왜)
사용자가 hugh-main을 재설치하니 이 머신 fleet에서 "안 잡힘". 실측 결과 **2개 진짜 버그**:
포트가 바뀌면 fleet이 따라가지 못함 + 재설치 노드가 mDNS 광고 안 함. 사용자 명시 요구(verbatim):
**"포트가 달라서 모르겠어요가 아니라. musu.pro 서버를 써서 연결을 하던지. 다른 포트 쓴다고
모르겠는대요? 동적 운영을 시키던지 추상화를 시켜"** + "mDNS 광고 안 됨 이것도 이유 찾고 제대로 고쳐".

즉 thesis = **node identity를 host:port에서 분리(node_name 안정 식별자), musu.pro 레지스트리를
진실원천으로 현재 주소를 동적 추종, 재설치 ghost 자동 prune, 재설치 후 mDNS 자동 광고.** 우회 금지,
근본 수정. W-4(2머신 relay E2E)의 전제 — 이게 안 고쳐지면 2머신 연결 자체가 안 됨.

## Phase 0 Researcher 결과 (실측, file:line 인용)

### 버그 1 — stale-addr (status가 레지스트리 안 봄)
| 사실 | 증거 |
|------|------|
| `musu status`는 라이브 레지스트리 안 봄, 디스크 캐시만 | `fleet.rs:344` `resolve_all_peers(musu_home)` → `:359` probe |
| `resolve_all_peers`는 `nodes.cache.json`+`manual_peers.toml`+`nodes.toml`만 읽음 | `discovery.rs:194-289`; `PeerSource::Registry`는 dead code(`:172-173`) |
| **`manual_peers.toml` append-only, prune 안 됨** → hugh-main 5개 stale 포트(:3032/:7203/:14385/:2957/:8001) | 실파일; `ManualPeerList::add` addr-exact dedup만(`discovery.rs:128-136`); refresh가 ADD만(`bridge/mod.rs:620-642`) |
| collapse가 "last_seen 최신"으로 고르나 manual 레코드는 `meta:None`→last_seen 없음→stale 선택 | `fleet.rs:160-194`; manual `meta:None`(`discovery.rs:226-231`); 버그 인코딩 테스트 `fleet.rs:549-562`(":2957 freshest port wins") |
| node identity가 host:port에 묶임; `node_id`가 UUID 아닌 name | `discovery.rs:162-168`; `bridge/mod.rs:612` `node_id: node.node_name.clone() // using name as id` |
| `musu nodes`는 라이브 레지스트리 직접 → 올바른 :8001 | `cli_commands.rs:688` `cloud.list_nodes()` → `cloud/mod.rs:1278` |

### 버그 2 — mDNS 미광고 (opt-in 게이트 기본 OFF)
| 사실 | 증거 |
|------|------|
| 광고가 `MUSU_ENABLE_MDNS` 게이트 뒤, 기본 OFF | `bridge/mod.rs:458-461`(게이트 read), `:469-483`(advertiser start vs disabled) |
| 설치 경로 어디서도 이 env 안 켬 | `src/install/**` grep: doctor 보고/테스트만, windows.rs MDNS 참조 0 |
| browse(discover)는 게이트 없이 무조건 → 비대칭 = 한쪽만 실패 | `main.rs:333-347` 무조건 browse |
| 포트는 `actual_port` 동적 → 문제 없음 | `bridge/mod.rs:468`; ServiceInfo `mdns.rs:170-178` |
| 비싼 실패모드(IPv6/Tailscale/가상NIC)는 이미 `new_musu_mdns_daemon`이 안전하게 거름 | `mdns.rs:126-150` |

## Workstream 분해

### WS-A. fleet status = 레지스트리 진실원천 + ghost prune (P0, 핵심)
**산출물**: `musu status`/cockpit fleet이 노드를 `node_name`으로 식별, 현재 주소를 레지스트리에서
동적 해결, 재설치 stale addr 자동 prune. **세부 플랜**: `docs/WSA_FLEET_REGISTRY_SOURCE_DETAIL_2026_06_25.md`.

- **A-1. status가 레지스트리 현재 주소 추종** (`fleet.rs:344` + `resolve_all_peers`): probe 전,
  각 노드를 `node_name`으로 라이브(또는 방금 refresh된 `nodes.cache.json`) 레지스트리 주소로 해결.
  레지스트리에 없는 same-name addr는 probe에서 제외.
- **A-2. heartbeat refresh가 manual_peers/cache prune** (`bridge/mod.rs:611-642`): `list_nodes()`
  결과에 없는 same-name addr를 `manual_peers.toml`+cache에서 제거(append-only → reconcile).
- **A-3. collapse 휴리스틱 교체** (`fleet.rs:160-194` + 테스트 `:549-562`): stamp-heuristic 제거,
  node_name 키 + 레지스트리 권위 주소. 버그 인코딩 테스트("freshest stale port wins") 정정.
- **A-4. identity 분리**: host:port를 identity로 쓰지 말고 node_name=안정 id, addr=레지스트리發
  가변 속성. `node_id` mislabel(`bridge/mod.rs:612`) 정리.
- ⚠️ **routing 경로도 확인**: `bridge::router::select_peer_for_route`(`discovery.rs:191`)도 stale
  manual addr 소비하는지 — display만 패치하면 라우팅이 여전히 죽은 포트로 갈 수 있음(Researcher OQ-3).

### WS-B. mDNS 광고 무조건화 (P0, 독립)
**산출물**: 재설치 노드가 zero-config로 LAN mDNS 광고. **세부**: WS-A 세부에 포함 또는 별도 짧은 노트.
- **B-1. advertiser 게이트 제거** (`bridge/mod.rs:469-483`): `if mdns_enabled {...} else {None}` 래퍼
  제거 → `start_advertiser` 무조건 호출. 광고는 cheap + 안전 daemon(`mdns.rs:123`) 경유.
- **B-2. (선택) 무거운 주기 browse 루프**(`bridge/mod.rs:516-529`)는 idle-CPU 우려 시 게이트 유지
  가능 — 단 **광고는 항상**. browse와 대칭(둘 다 ungated)이 가장 단순(Researcher 권장).

## 진행 순서 (/loop, agent-team)
1. **WS-A 세부 플랜** → Critic(system-architect: 레지스트리 단일 진실원천 전환의 라우팅 파급 +
   prune이 정상 노드 안 지우는지 + cloud 호출 실패 시 fallback) → Builder → Auditor(quality-engineer:
   identity 불변식 + prune 안전 + routing 경로 + 버그 테스트 정정) → cargo test → PR.
2. **WS-B** Builder(게이트 제거, 작음) → 같은 PR 또는 별도.
3. rc 빌드 + 양쪽 설치 후 사용자 2머신 E2E(W-4).
4. Scribe: closure + 메모리 + musubrain.

🔒 게이트: main push=Const VII 배치 승인. production 서버 배포 없음(전부 musu-rs 클라이언트).
레지스트리는 읽기(list_nodes) — 서버 코드 무변경. design-gate 무관(Rust).

## 검증 (무당짓 금지)
- `cargo test --lib` green + prune/collapse 신규 테스트(stale addr 제거, 정상 노드 보존).
- **실측**: hugh-main 재설치 시뮬(또는 실제) 후 `musu status`가 :8001 추종, stale :2957 사라짐.
- mDNS: 재설치 노드가 `MUSU_ENABLE_MDNS` 없이 광고 → 다른 머신 `discover`가 찾음.
- 라우팅: `route --explain`이 현재 주소(:8001)로 plan.

## LOC 추정 (×2)
- WS-A: ~200 (레지스트리 해결 + prune reconcile + collapse 교체 + identity + 테스트).
- WS-B: ~15 (게이트 제거).

## 열린 질문 (Critic/구현 중 해소)
1. status가 매 호출 `cloud.list_nodes()`(네트워크) vs 방금 refresh된 cache 사용? (cache 신선도 보장 +
   cloud 실패 시 cache fallback — Critic 판단).
2. prune이 일시적 오프라인 정상 노드를 지우면 안 됨 — 레지스트리에 있으나 last_seen 오래된 건 보존,
   레지스트리에 **없는** addr만 제거(reinstall ghost).
3. routing 경로(select_peer_for_route)도 같은 레지스트리 해결 써야 하는지(display만 vs 전체).
