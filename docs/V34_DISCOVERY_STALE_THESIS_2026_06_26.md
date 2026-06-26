# V34 발견/stale 아키텍처 재설계 — Thesis (확정, 2026-06-26)

> Phase -1 전략게이트(business-panel 4인 debate) 통과 + 사용자 결정 반영. 마스터 플랜의 입력.
> **다음 단계: 이 thesis로 마스터 플랜 작성(plan mode + Phase 0 Researcher).** 새 세션 권장(신선 컨텍스트).

## 왜 (문제, 실측)
사용자가 겪은 두 증상이 **한 뿌리** — "노드 identity와 그 주소를 어떻게 다루느냐":
1. **메인컴에 다른 PC 안 뜸**: 노드가 자기 LAN IP를 스스로 1개 골라(`preferred_advertise_host().next()`,
   정렬 없음) self-report → 클린 재설치/멀티NIC/Tailscale에서 루프백(127.0.0.1)/오버레이(10.x) 같은
   도달불가 주소 광고 → 상대가 발견·연결 못 함. observed-address 학습 0, relay 실시간 fallback 0.
2. **유령 노드/포트변경/토큰충돌**: 업데이트·재설치 시 stale 상태가 레지스트리/로컬에 잔존, 자동 prune 약함.

실측 버그(2026-06-26): hugh-main이 `127.0.0.1:13397`(루프백)로 등록, hugh_second는 레지스트리에서
누락(register 멈춤) → 양방향 발견 깨짐. 유령 `4060`/`5070`(옛 Tailscale IP:8070)이 prune 안 됨.

### 2026-06-26 audit hotfix status
V33 branch에 즉시 안전장치를 추가했다: cached registry `last_heartbeat`는 registry `last_seen`만 보존하고
`Utc::now()` fabrication을 금지, remote `public_url` loopback/wildcard는 server registry write/list path에서
reject/filter하고 resolver/cache에서도 제외, relay-display는
`online_nodes`/work-targetable에서 제외, doctor/nodes는 cloud `public_url` loopback 경고를 낸다. hugh_second는
WindowsApps MSIX까지 재설치되어 이 hotfix가 live다.

### 2026-06-27 V34 first bonding status
V34의 근본 설계 중 **후보-집합(additive candidate set)** 이 fleet registry heartbeat와 local cache resolver에
처음 연결됐다. Bridge heartbeat는 `meta.candidate_endpoints`에 advertised bridge URL 기반 LAN/direct 후보,
모든 usable LAN interface 후보, Tailscale/private-mesh 후보를 함께 실어 보낸다. `nodes.cache.json` resolver는
이 후보들을 같은 stable `node_name`의 여러 `ResolvedPeer` route 후보로 펼치며, relay/failed/loopback/wildcard 후보는 route 후보에서
제외한다. 즉 `public_url` 단일 self-report만 믿던 구조에서 벗어나기 시작했다. 당시 남은 큰 결합점은
server-side observed source IP additive 후보, 모든 LAN IP 후보, real race probe, TTL prune이었다.

### 2026-06-27 V34 observed-source bonding status
Server registry `POST /api/v1/nodes/register`도 additive 후보 모델에 합류했다. 요청 헤더의
`x-forwarded-for`/`x-real-ip`/`cf-connecting-ip`/`true-client-ip`/`fly-client-ip`에서 첫 usable IP를 뽑아
`meta.candidate_endpoints`에 `kind: "observed_source_ip"` 후보로 **추가**한다. 이 값은 `public_url`을
대체하지 않고, loopback/wildcard면 버린다. 즉 서버 관찰값은 "진실"이 아니라 race/probe 대상 후보 하나다.
당시 남은 핵심은 같은 `node_name` 후보의 bounded race/probe, TTL prune/reconcile이었다.

### 2026-06-27 V34 route-preflight bonding status
Forward path도 additive 후보 모델에 합류했다. `prepare_forward_rendezvous`가 돌려준 target
`candidate_endpoints`와 기존 selected peer를 `route_candidates`로 합친 뒤, task POST 전에 read-only
`/api/fleet/node-status` preflight를 짧게 병렬 실행한다. 성공한 후보를 앞으로 당기되, 실제
`/api/tasks/forward` POST는 하나씩만 시도한다. 따라서 stale 첫 후보 때문에 10초 POST timeout/retry를 먼저
맞는 지연은 줄고, 같은 task가 여러 후보에서 중복 실행되는 위험은 만들지 않는다. 당시 남은 핵심은 TTL
prune/reconcile과 두 물리 머신에서의 E2E 증명이었다.

### 2026-06-27 V34 registry presence-TTL bonding status
Server registry `GET /api/v1/nodes`도 stale-prune 모델에 합류했다. `expires_at` / `MUSU_NODE_REGISTRY_TTL_SEC`
는 7-day storage retention으로 유지하고, current presence 목록은 `last_seen` 기준
`MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC`(default 15분, floor 60초, ceil 24h)로 한 번 더 필터한다. 즉
cloud row를 오래 보관할 수는 있지만, heartbeat TTL을 넘긴 row는 Rust client discovery/current fleet
presence로 내려가지 않는다. 숨겨진 stale row는 `deleteNodeByName` / `DELETE /api/v1/nodes/[nodeName]`로
계속 operator cleanup 가능하다. 남은 핵심은 production deploy와 boot/local reconcile E2E 증명이다.

이 hotfix는 **거짓 online/targetable 방지**와 진단 정직성 보강이다. 아래 V34 thesis(후보-집합 race,
observed-IP additive, TTL prune, mDNS 1순위)는 여전히 근본 설계 과제다. 현재 hugh-main은 아직
`127.0.0.1:13397` stale cloud entry와 LAN timeout 상태라 main PC에서 재시작/재설치가 필요하다.

## 리서치 3건 결론 (3 deep-research + 코드 실측)
- **견고한 P2P 제품(Tailscale/Syncthing/ZeroTier)은 self-report를 검증 불가로 보고 observed-source-address를
  진실로 씀.** musu는 4요소(multi-candidate / receiver 검증 / relay fallback / observed-addr 학습) 전부 0.
- **자동 stale prune은 Netmaker만 제대로 구현**(나머지 orphan 누적). musu가 observed-addr + TTL prune
  합치면 동급 최상위.
- musu 코드 fragility 7지점 확정(services.rs:338 `.next()`, cloud/mod.rs:104 단일 public_url,
  CandidateEndpoint dead_code, nodes.rs:287 self-report만, rendezvous.rs:180 relay polling 미구현 등).
- **musu는 이미 절반 이상 완성**: node_name 안정 식별자+레지스트리 진실원천(V30), mDNS 발견(V27
  peer/mdns.rs start_advertiser+discover_peers), cached registry 7-day TTL(discovery.rs nodes.cache.json),
  registry heartbeat의 `meta.candidate_endpoints`, server-observed `observed_source_ip` additive 후보,
  모든 usable LAN interface 후보 publish, cache resolver 후보 확장, forward-time read-only route
  preflight reorder, server-side heartbeat presence TTL filter. ✅ 코드 확인.

## Phase -1 전략게이트 판정: 🟡 YELLOW → reshape 수용
**Taleb HIGH (F2, 결정적):** thesis 원안 "서버가 src IP를 **진실(truth)**로 박는다"는 **로컬 능력을 원격
단일장애점으로** 만듦 — 같은 LAN 두 PC가 인터넷 끊기면 1m 옆인데도 못 찾음(self-contained 위반).
Syncthing/Tailscale도 observed-addr 쓰지만 **LAN 독립 발견(mDNS)을 동시 유지**. 리서치 요약이 그 절반을 빠뜨림.

**Kim&Mauborgne (F5):** 진짜 차별점(blue ocean)은 observed-IP(table stakes)가 아니라 **"재설치 후 fleet
자가치유"(TTL prune+reconcile)**. prune이 진짜 해자(시스템 구조의 missing balancing loop).

**Drucker (F6):** ICE/STUN/full-relay는 현 scale(단일소유자/소수PC) YAGNI — V34 scope 밖 명시. V30 upsert 재작성 금지.

### 사용자 결정 (2026-06-26)
- ✅ **F2 reshape 수용**: observed-IP를 "진실"이 아니라 **"후보 중 하나(additive)"**로 강등 + LAN/mDNS
  direct 경로를 코디네이터 독립으로 유지.
- ✅ **scope: 발견 + stale 둘 다 co-equal headline**.

## 확정 thesis (reshape 반영)
"노드 self-advertise(단일 주소 self-report)를 버리고 **후보-집합 + 다중 진실원천** 모델로:
- 노드는 **후보 주소 집합**(모든 LAN IP들 + listen 포트, mDNS 광고)을 등록 — 단일 IP 자기선택 폐기.
- **서버(musu.pro)는 register 요청의 observed-source-IP를 후보로 하나 더 추가**(진실이 아니라 additive).
- **연결 측이 후보 집합을 race**해서 첫 reachable 채택(사전검증을 거는 쪽으로).
- **mDNS/LAN-direct를 코디네이터 독립 1순위 경로로 격상** — musu.pro 없이도 같은 LAN PC끼리 발견·연결.
- cached last-known-good(7-day)로 오프라인 join 시도.
- **서버측 heartbeat TTL prune**(Netmaker 패턴, grace 수분~십수분)으로 죽은 노드 자동 만료 +
  **reconcile-on-boot** 로컬 정리(manual_peers/nodes.cache를 서버 진실원천과 대조).
- node_name 안정 식별자 upsert는 **V30 그대로 유지**(재작성 금지)."

### Scope 울타리 (Drucker F6)
- ❌ ICE/STUN 풀스택 자체 운영 (현 scale YAGNI)
- ❌ full WAN relay transport 풀구현 (별도, relay는 KV store-and-forward 유지)
- ❌ V30 node_name upsert 재작성
- ✅ 후보-집합 race + observed-IP additive + mDNS 1순위 + TTL prune + reconcile만

## §0 Strategic Gate Findings (마스터 플랜 Findings 테이블로 이월)
| # | Expert | Sev | Claim | Resolution |
|---|--------|-----|-------|-----------|
| F1 | Christensen | HIGH | self-advertise 실패가 onboarding 순간(클린재설치/멀티NIC/VPN)에 집중 — 저확률 엣지 아님 | 성공지표 = "신규/멀티NIC 머신 첫 실행 cross-PC 발견", aggregate uptime 아님 |
| F2 | Taleb | HIGH | "서버=주소 진실" = 로컬 능력의 원격 SPOF, 같은LAN 오프라인 연결 실패 | observed-IP additive로, LAN/mDNS direct 코디네이터 독립 유지. **사용자 수용.** Phase 1.5 Critic이 additive 유지 확인 필수 |
| F3 | Taleb | MED | musu.pro 다운 시 전 신규 join 차단(blast radius) | 로컬 후보+cached last-known-good로 musu.pro 일시 불가 시도 join 진행 |
| F4 | Kim&M | MED | Tailscale 전면위임(seed-3)은 red ocean + onboarding tax(NoState) | 전면위임 거부, observed-IP 프리미티브만 차용 |
| F5 | Kim&M | MED | blue ocean = stale-prune/self-heal, observed-IP는 table stakes | TTL prune+reconcile을 co-equal headline로. **사용자 수용.** |
| F6 | Drucker | MED | STUN/ICE/full-relay scope creep + V30 upsert 재작성 리스크 | scope 울타리(위) 명시 |

## Phase 0 Researcher 범위 (마스터 플랜 착수 시)
패널 HANDOFF: Researcher를 **두 축 동등 깊이**로 — (a) 후보-주소 racing + Syncthing/Tailscale/ZeroTier의
**LAN 독립성 보존** 방식(observed-IP만이 아니라), (b) TTL-prune/reconcile 패턴(Netmaker + 기타).

## 다음 행동
1. hugh-main에서 최신 WindowsApps/MSIX runtime 재시작 또는 재설치 → cloud public_url이 LAN/private-mesh URL로
   다시 publish되는지 `musu nodes --json`으로 확인.
2. forward-time route preflight를 두 물리 머신에서 검증한다: stale 첫 후보가 있어도 reachable LAN 후보가
   먼저 선택되고, task POST가 중복 실행되지 않아야 한다.
3. production deploy 후 서버측 heartbeat presence TTL이 `hugh-main` stale row를 숨기는지 확인하고,
   boot reconcile로 local cache/manual peer 정리를 증명한다.
4. (사용자/다음 세션) 이 thesis로 **V34 마스터 플랜 작성** — plan mode, agent-team, Phase 0 Researcher 2축.
5. 임시 복구(원하면): hugh-main 재시작 → LAN IP 재등록 시도(땜질). 근본은 V34.

관련: `NEXT_STEPS_V34_2026_06_26.md`(N-4 relay transport와 연결), 리서치 종합은 scratchpad
v34-discovery-research.md. 메모리 [[reference-musu-fleet-3state-display-only]]
[[reference-musu-fleet-registry-authority]] [[decision-musu-connection-headscale-acl]].
