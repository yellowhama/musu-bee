# WS-A 세부 플랜 — fleet status 레지스트리 진실원천 + ghost prune

> 마스터: `V30_FLEET_DYNAMIC_ADDR_MASTER_PLAN_2026_06_25.md`. musu-rs 클라이언트만. 서버 무변경.
> 검증 `cargo test --lib` + 실측. 사용자 thesis: node_name 안정 식별자 + 레지스트리 현재 주소 동적 추종.

## 문제 (실측 확정)
`resolve_all_peers`(`discovery.rs:194-288`)가 3소스(cache/manual/nodes.toml)를 **addr-키 dedup**으로
합침 → 같은 node_name의 stale 포트가 다 살아남음(hugh-main 5개). cache는 레지스트리 스냅샷이라
권위지만, manual/nodes.toml의 same-name stale addr를 막지 않음. collapse가 last_seen으로 고르나
manual은 `meta:None`(last_seen 없음) → stale 선택. `node_id`도 name일 뿐 안정 id 역할 못 함.

## 설계 핵심 (사용자 thesis 반영)
**레지스트리 스냅샷(cache)에 존재하는 node_name = 권위. 그 node_name에 대해 cache addr만 신뢰.
manual/nodes.toml은 cache에 없는(레지스트리 미등록) node_name에 대해서만 보조 소스.**
재설치 ghost는 같은 node_name이 cache에 새 addr로 있으니 manual stale addr가 자동 배제됨.

## 구현

### A-1. `resolve_all_peers` name-aware 권위화 (`discovery.rs:194-288`)
- cache(Source 1)를 먼저 처리하며 **등록된 node_name 집합 `registry_names` 수집**(addr도 함께).
- manual(Source 2)/nodes.toml(Source 3): 해당 레코드의 name이 **`registry_names`에 이미 있으면
  skip**(레지스트리가 그 노드의 현재 addr 권위를 가짐). 없으면(레지스트리 미등록 LAN-only 노드)
  기존대로 추가. → same-name stale 포트 자동 배제.
- ⚠️ name 없는 manual 레코드(legacy)는? name=None이면 registry_names 매칭 불가 → 보수적으로 유지
  (LAN-only ad-hoc). Critic 판단: name 없는 manual은 드물고 ad-hoc이니 유지가 안전.

## 구현 (이어서)

### A-2. heartbeat refresh가 cache/manual prune (`bridge/mod.rs:611-642`)
- `cloud.list_nodes()` 결과로 cache 재작성 시(이미 함), **manual_peers.toml에서 list_nodes에 있는
  node_name과 같은 이름의 addr 제거**(레지스트리가 그 노드 관리 → manual 잔재 불요).
- cache 자체는 list_nodes로 전량 교체되므로 stale cache addr는 이미 사라짐(확인). manual만 reconcile.
- ⚠️ 정상 노드 보존(OQ-2): 레지스트리에 **있으나** 오프라인(last_seen 오래됨)인 노드는 cache에 남음
  → prune 대상 아님. prune은 "레지스트리에 그 name이 있고 manual에 같은 name의 다른 addr가 있을 때
  manual 쪽만" 제거. 레지스트리에서 사라진 노드(언인스톨)는 cache에서 자연 소멸.

### A-3. collapse 휴리스틱 정정 (`fleet.rs:160-194` + 테스트 `:549-562`)
- A-1으로 same-name 중복이 resolve 단계에서 대부분 제거되면 collapse 부담 감소. 단 cache+nodes.toml에
  같은 name이 다른 addr로 남을 여지 있으면, collapse를 **last_seen 우선 + tie 시 cache(레지스트리)
  source 우선**으로. stamp 없는 레코드(manual)는 후순위(이미 A-1서 걸러짐).
- 버그 인코딩 테스트 `fleet.rs:549-562`("freshest stale port :2957 wins") → 새 의미(레지스트리 addr
  우선, stale 배제)로 정정. 무당짓 금지: 테스트가 새 올바른 동작을 단언하게.

### A-4. identity 명확화 (`bridge/mod.rs:612`)
- `node_id: node.node_name.clone() // using name as id` → 주석 정정 + node_name이 안정 식별자임을
  명시. UUID 도입은 YAGNI(레지스트리가 node_name 유니크 보장하면 충분 — Critic 확인). addr는
  레지스트리發 가변 속성으로 취급.

### A-5. routing 경로 확인 (`bridge::router::select_peer_for_route`, `discovery.rs:191` 참조)
- 라우팅도 `resolve_all_peers` 쓰면 A-1 수정이 자동 적용됨(display+routing 동시 해결). 별도 stale
  소스 쓰면 거기도 같은 권위화 필요. **Builder 첫 작업 = 이 함수가 resolve_all_peers 쓰는지 실측.**

## 테스트 (discovery.rs / fleet.rs)
- `resolve_drops_manual_when_name_in_registry`: cache에 hugh-main:8001 + manual에 hugh-main:2957 →
  resolve 결과에 :8001만, :2957 없음.
- `resolve_keeps_manual_when_name_absent_from_registry`: cache에 없는 lan-only:9999 manual → 유지.
- `prune_removes_stale_same_name_from_manual`: refresh 후 manual에서 레지스트리 name의 잔재 addr 제거.
- `prune_keeps_offline_registered_node`: 레지스트리에 있으나 오프라인 노드 보존.
- 기존 `fleet.rs:549-562` 정정(stale port 우선 → 레지스트리 addr 우선).

## 검증
- `cargo test --lib` green(신규 4 + 정정 1 + 기존 fleet/discovery).
- 실측: 이 머신 `musu status`가 hugh-main :8001 추종, manual_peers.toml의 :2957 등 stale 사라짐.
- routing: `route --explain --target hugh-main`이 :8001로 plan.

## 게이트
- 🔒 main push=Const VII. production 배포 0. design-gate 무관(Rust). Critic=system-architect,
  Auditor=quality-engineer.

## 열린 질문 → Critic
1. status가 매번 cloud.list_nodes()(네트워크 동기) vs cache 신선도 의존? cache는 heartbeat가 주기
   refresh하니 cache 사용 + cloud 실패 시 graceful(현 동작 유지)이 단순. live fetch는 status 지연.
2. prune 안전: 레지스트리 미등록이지만 사용자가 수동 추가한 LAN-only peer를 prune이 지우면 안 됨
   → prune은 "레지스트리 name과 동일 name의 다른 addr"만, name 자체가 레지스트리에 없으면 손 안 댐.
3. routing이 resolve_all_peers 공유하는지 실측 결과에 따라 A-5 범위 확정.

---

## Critic Findings (resolved) — system-architect, 2026-06-25
권위 모델 원칙은 sound, 단 3 HIGH 차단. Builder는 이 표를 PRIOR ARTIFACT로 읽고 반영.

| # | Sev | Claim | Resolution (Builder 지침) |
|---|-----|-------|--------------------------|
| H-1 | 🔴 | 라우팅 tie-break = lexicographic addr(`router.rs:129-135`)라 죽은 포트 선택 가능. **display만 고치면 실제 연결 여전히 실패**(사용자 진짜 목표). 단 `select_peer_for_route`도 `resolve_all_peers` 공유(`router.rs:314`). | **Option (a) 채택**: `resolve_all_peers`에서 same-name non-registry addr drop(A-1) → hugh-main이 단일 cache addr :8001로 해결 → 라우팅 자동 수정. `peer_sort_key` 변경 불요. **`discovery.rs:188-193` 주석(다중 same-name 유지) false 됨 → 정정**. proxy.rs/ws_proxy.rs/file_proxy.rs는 name당 1개 good addr만 필요 → 안전(Builder 확인). |
| H-2 | 🔴 | prune이 빈/부분 레지스트리 성공(서버장애 200+0개)에 모든 manual peer 삭제. cache도 이미 빈결과에 비워짐. | **prune 락다운**: (1) `Ok(siblings)` arm + **`!siblings.is_empty()`** 일 때만. (2) manual 레코드는 **그 name이 siblings에 있고 addr가 다를 때만**(진짜 reinstall ghost) 제거. name이 레지스트리에 **없으면 손 안 댐**(LAN-only). name+same-addr=no-op. (3) save 직전 재load + retain(RMW race 축소). 테스트 `prune_noop_on_empty_registry` 추가. |
| H-3 | 🔴 | "node_name 유니크"가 검증 안 된 가정. 두 머신 같은 이름이면 엉뚱한 머신 라우팅(틀린 포트보다 나쁨). | **Builder 첫 작업**: `cloud/mod.rs` register 핸들러/DB 제약으로 서버 name uniqueness 확인(OQ-1). 강제하면 name=id OK. **안 하면 기존 `CachedNode.node_id`(`discovery.rs:34`)로 dedup, name은 display만**. 가정으로 진행 금지. |
| M-1 | 🟡 | heartbeat prune ↔ `peer add` RMW race(파일락 없음). | save 직전 재load + retain으로 윈도우 축소. 락파일 YAGNI(5분 루프/단일사용자). |
| M-2 | 🟡 | collapse는 이미 last_seen 최신 선택; 버그는 manual에 last_seen **조작**(테스트 `:549-562`가 :2957에 가짜 last_seen 부여). 실제론 manual=`meta:None`. | 테스트 정정 시 **실제 shape**: cache 레코드(last_heartbeat 有) + manual(meta:None) → cache addr 우선·stale manual 배제. **`resolve_all_peers` 레이어**에서 단언(A-1이 배제하는 곳). 포트만 뒤집지 말 것. |
| M-3 | 🟡 | name=None manual(`peer add <addr>` no-name)은 reinstall ghost여도 A-1이 보존 → 같은 증상 재발(작은 누출). | name=None manual 유지하되 **probe 실패 N회 후 prunable** 또는 "사용자 책임" 문서화. regression 오인 방지 위해 명시. |
| L-1 | 🟢 | 3-surface(CLI/cockpit/web) 다 `fleet_status`→`resolve_all_peers` 경유 → A-1 수정이 by-construction 일관. | web route가 독자 `list_nodes` 우회 안 하는지 확인. `musu nodes`(`cli_commands.rs:688`)는 별개 명령이라 OK. |
| INFO | ✅ | cache(live 아님) 선택 옳음 — status는 hot path. staleness 윈도우 ≤5분(heartbeat 300s). | cache 유지. closure에 "≤5분 동기 지연" 명시(현 never-update보다 우월). |

**OQ 해소(orchestrator):**
1. cache 사용(live fetch 아님) — status hot path, ≤5분 지연 수용. cloud 실패 graceful 유지.
2. prune predicate = "name이 레지스트리에 present + addr 다름" only. empty/absent → 손 안 댐.
3. routing = Option(a)로 resolve_all_peers 통해 자동 수정. select_peer_for_route 직접수정 불요.
   **단 H-3(name uniqueness) 먼저 확인 후 진행.**
