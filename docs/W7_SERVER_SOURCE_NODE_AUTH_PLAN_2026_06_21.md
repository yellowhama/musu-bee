# W-7 세부 플랜 — 서버측 source_node_id 인증 바인딩 (relay 심층 방어)

> 마스터: `CONNECTION_COMPLETION_MASTER_PLAN_2026_06_20.md` · 세션 플랜: `~/.claude/plans/cosmic-honking-cake.md`
> 출처: W-1 security review Finding 2 (MEDIUM). 별도 워크스트림 — **musu-bee 서버(Next.js API) 변경 = production 배포 게이트**.
> ⚠️ 이 문서는 설계서. 구현 전 사용자 승인 + (서버 인증 모델 변경이므로) Phase -1 전략 게이트 검토 권장.

---

## ✅ 종결 (2026-06-25) — Phase -1 RED + M1 가드 구현, deferral 닫힘

**판정**: Phase -1 전략 게이트(business-panel 4인: Christensen/Taleb/Kim&Mauborgne/Drucker) 만장일치 **🔴 RED** — 전면 W-7(per-node PKI = Opt-B)은 **musu 스케일에 빌드하지 말 것**. 이유:

1. **위협이 신뢰 경계 안**: W-7이 막는 "같은 account 노드가 다른 같은-account 노드 사칭"은 **단일 소유자 모델에서 존재하지 않는 위협**(한 사람이 account의 모든 노드를 소유). 그 결과(위조 callback)는 이미 **W-1 소비자측 executor 바인딩**이 거부.
2. **Opt-B는 C-1 token 단일화를 부분 되돌림**: per-node 키는 C-1(account-wide shared bearer, cross-machine 401 근본수정)과 충돌. `cloud/mod.rs:140-145` "같은 account의 모든 머신이 동일 값 받음". no-YAGNI 게이트 위반.

**조건부 RED** — 사용자 결정으로 **M1 값싼 가드만** 채택:

- **구현(2026-06-25)**: `route.ts` POST에서 `matchedLease` 객체를 캡처하고 `matchedLease.source_node_id/target_node_id == body`를 **로컬 명시 단언**. 불일치 → 409 `relay_payload_lease_node_mismatch`. **새 primitive 0, 스키마 무변경.** (Opt-A의 핵심을 명시화한 형태.)
- **Critic 판정(system-architect)**: M1 갭은 **이미 닫혀 있었음(ALREADY_CLOSED)**. `queryRelayLeases`가 body의 source/target을 필터 술어로 넘기고 lease store가 엄격 동일성 필터를 `find()` 전에 적용하므로, 불일치 쌍은 후보에서 빠져 409. 새 가드는 **현재 도달 불가능**. **가치는 refactor 트립와이어**(향후 query 필터가 빠지거나 zod `.min(1)`이 완화되면 갭 재오픈 방지) + 회귀 테스트.
- **테스트**: 블랙박스 회귀 2개 추가(불일치 source / 불일치 target → 409). 13/13 통과 + tsc 0. 화이트박스 단언 라인은 store 모킹 seam 없어 도달 불가 → 무당짓 회피 위해 트립와이어 주석으로 명시(억지 테스트 안 만듦).
- **production write 경로 단일성 확인**: `createRelayPayload`/`appendRelayPayload` production 호출처 = route.ts 1곳뿐(나머지 전부 `.test.ts`). M1 단언이 write 경로 전역 커버.

**열린 채로 두는 것(설계상)**: 같은-쌍 spoof(호출자가 실제로 다른 노드)는 per-node 신원이 있어야 막힘 — Phase -1 RED로 빌드 안 함.

**🔁 재오픈 트리거 (H1, 영구 불필요 아님)**: musu deployment가 **멀티테넌트**(한 deployment가 1인 초과 소유자 서빙)가 되면 — mesh bearer가 deployment-wide라(`meshBearer.ts:12-18`) cross-account 격리 + W-7이 **하나의 새 위협 모델로 동시 재오픈**. 그 날 Phase -1 게이트 재실행.

**L1 doc 정정**: 본 문서/이력에서 "#35"는 정확히 **C-1 token 단일화**. relay payload 무결성은 cryptographic signature 아니라 **sha256/base64 바인딩**.

## 결함 (코드 실측)

`POST /api/v1/p2p/relay/payload` (`musu-bee/src/app/api/v1/p2p/relay/payload/route.ts:88-164`):
- 인증: `authorizeP2pControl(req)` + `p2pControlPrincipal(req)` → **`principal.owner_key`만** 검증(`p2pControlAuth.ts:27-28` — `P2pControlPrincipal = { owner_key }`, node_id 없음).
- 저장: `createRelayPayload({ owner_key: principal.owner_key, source_node_id: parsed.data.source_node_id, ... })` (route.ts:154-159) — `source_node_id`는 **클라이언트가 보낸 값을 그대로 신뢰**. 서버는 "이 요청자가 정말 그 source_node_id 노드인가"를 확인하지 않음.

**공격 시나리오**: 같은 owner(계정) 내 공격자가 `source_node_id = victim-executor-node`로 위조 relay payload(특히 `task_callback_envelope`)를 제출 → receiver/sender가 그걸 victim의 정당한 메시지로 디코드. 클라측 W-1 S-1(executor 바인딩)/S-2(`cb.node == source_node_id`)가 1차 방어이나, **서버가 source_node_id를 인증 노드에 바인딩하지 않으면** 공격자가 source_node_id를 victim으로 세팅하면 S-2도 통과(자기가 정한 값끼리 일치). 즉 현재 클라측 `forwarded_to_node`(S-1)가 **유일한** 실질 방어 — 공격자가 KV를 읽어 forwarded_to_node를 추론·정렬하면 spoof 가능.

## 근본 제약

mesh bearer 토큰은 **owner(계정) 수준**(C-1 account-wide shared bearer = HMAC(server_secret, owner_key)). node 수준 식별자가 토큰에 없음 → 서버가 토큰만으로 "어느 노드"인지 모름. 따라서 W-7은 단순 1-line 검증 추가가 아니라 **인증 모델 결정**이 필요.

## 해법 옵션 (구현 전 결정 필요)

### Opt-A: lease 기반 바인딩 (권장 — 최소 변경)
- `request_relay_lease`(이미 존재) 시 서버가 lease에 `source_node_id`를 **기록**하고, 그 lease는 그 source_node로만 발급됐음을 보장(lease 발급도 owner-scoped이나 source_node_id를 lease row에 박음).
- payload submit 시 route.ts:126이 이미 `lease_id`로 lease를 조회함 → **그 lease의 source_node_id와 payload의 source_node_id가 일치하는지 검증** 추가. 불일치 시 409/403.
- 장점: 토큰 모델 무변경. lease가 이미 owner+session+source+target을 담음(`queryRelayLeases` 인자에 source_node_id 있음). 거의 검증 1개 추가.
- 단점: lease 발급 자체가 여전히 클라 source_node_id를 신뢰하면 공격자가 victim source로 lease를 먼저 따면 우회 → **lease 발급 라우트도 같은 바인딩 필요**(연쇄 확인).

### Opt-B: node 수준 토큰/서명 (근본적, 큰 변경)
- 각 노드가 고유 키로 요청 서명 → 서버가 source_node_id ↔ 서명키 대조. C-1 account-wide bearer 모델을 node별로 확장.
- 장점: 진짜 노드 인증. 단점: 토큰 발급/회전/저장 전면 재설계 — musu 규모 대비 과설계 가능성([[feedback-no-yagni-architecture]] / lazy-ladder 적용해 Opt-A로 충분한지 먼저 증명).

### 권고
**Opt-A 먼저** — lease row에 source_node_id 바인딩 + submit/claim에서 일치 검증. lease 발급 라우트까지 연쇄 확인. Opt-B는 Opt-A로 못 막는 위협이 실증될 때만.

## 함께 묶을 후속 (W-1 리뷰 이월분)

- **remote_task_id wiring** (W-6 발견): relay 경로의 `apply_task_callback`(`musu-rs/forward.rs:1298`)이 `remote_task_id`를 안 씀 → relay task는 그 컬럼 NULL. TaskCallback이 값을 갖고 있으니 UPDATE에 추가. (클라측, 서버 무관 — 별 커밋 가능.)
- **H-1**: `fire_callback`에 CancellationToken 미배선(runner refactor).
- **H-3**: 역방향 lease가 closed session 재사용 가능성(서버 lease 계약).
- **M-1~M-4**: migration race(v2/v3 상속), musu_home env 해석, audit note 바운드, get_task_tests pool 스키마 drift.

## 검증 (구현 시)
- Opt-A: 위조 source_node_id payload submit → 서버가 거부(403/409) 단위 테스트(`route.test.ts`에 추가). lease 발급 위조도 거부.
- 회귀: 정상 source_node_id는 통과(W-6 통합 테스트가 mock cloud라 서버 변경 무관하게 green 유지 — 서버 실배포 검증은 별도).
- musu-bee 서버 = Vercel(musu.pro) 배포 → **production deploy 게이트**.

## 게이트
- 🔒 서버 인증 모델 변경 = 사용자 승인 + production deploy 게이트.
- musu-bee 서버 코드는 `F:\workspace\musu-bee\musu-bee\src\app\api\v1\p2p\relay\` (musu.pro로 배포되는 Next.js). musu-pro 레포(`F:\Aisaak\Projects\musu-pro`)는 별개 — relay 라우트는 musu-bee에 있음.
