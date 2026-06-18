# WS-2c — 머신 rename / remove 세부 플랜 (2026-06-19)

**Master:** `COCKPIT_REDESIGN_MASTER_PLAN_2026_06_18.md` WS-2c. **가장 큰 blast radius → Critic + dual-audit.**
**Status:** security-engineer Critic 통과(HIGH 3 + MED 2, 코드 전 reshape). **rename/remove 분리 — rename 먼저, remove 더 강한 게이트.** production DELETE = 사용자 승인.

## ⚠️ Critic HIGH 3건 (코드 전 차단 — reshape 반영)

1. **HIGH-1 name+IP 재해석 = 엉뚱한 노드 삭제.** fleet은 로컬 bridge dashboard(별도 데이터플레인, drift 가능)에서 옴 — Headscale 권위 아님. IP 재할당/중복 이름/stale name → 엉뚱한 live id 해석 → 잘못된 머신 추방. → **resolve→confirm-by-id 흐름**: server가 후보 노드 목록(id+name+IP+last_seen) 반환 → 사용자 특정 노드 확인 → **그 응답의 정확한 id로** 삭제 + server가 id 여전히 owner scope + name/IP 일치 재검증(optimistic-concurrency, 불일치 거부). ambiguous = {중복 name, 중복 IP, name↔다른노드 IP 충돌, 0 매칭, liveness 불일치} 전부 거부.
2. **HIGH-2 크로스테넌트.** admin key = 글로벌(전 user), control token allowlist = 복수(멀티테넌트). server `?user=` 스코프가 **유일 차단막**. → list는 control-plane `?user=<server가 owner_key로 도출한 acct id>` 필터(글로벌 list 후 앱필터 금지, 클라 supplied id 금지). DELETE/rename 전 target node 재fetch해 `node.user.id === ensureHeadscaleUser(ownerKey).id` 단언, 불일치 403. fail-closed.
3. **HIGH-3 this-PC 자기추방 = server-side 거부.** `is_this_pc`는 클라 계산(우회/스푸핑 가능). shell 가드는 UX, **server가 요청 머신 자신 노드 삭제를 명시 override 없이 거부**.

MED: remove는 **typed confirmation**(노드명 입력) 필수(고려 X) + server audit 로그(route.ts:116 패턴) + Headscale 404=idempotent 성공(재해석 재시도 절대 금지) + per-owner rate-limit. rename/remove **분리**.

## 단계 분리 (Critic)
- **Phase 1 rename 먼저**: resolve→confirm-by-id + owner scope(HIGH-1/2 적용, 오rename은 복구 가능 = id 파이프라인 canary).
- **Phase 2 remove 나중**: HIGH-3(server self-eviction 거부) + MED(typed confirm/audit/idempotent) + **dual-audit** 전부 통과 후. production DELETE = 사용자 승인 + 테스트 노드 한정.

## 목표 (스펙 B2)

fleet 행의 ⋯ 메뉴에서 머신 **이름 변경** + **mesh에서 제거**(Tailscale Machines 패턴). 현재 둘 다 없음.

## 핵심 제약 (Explore + 코드 확인)

- fleet 목록은 **로컬 bridge `/api/fleet/status`**(lib.rs:1509)에서 옴. `FleetNode`(lib.rs:815)는 `node_name`/`addr`/`tailscale_ip`만 — **Headscale numeric node id 없음**.
- Headscale rename/remove REST는 **numeric node id로 키**(`POST /api/v1/node/{id}/rename`, `DELETE /api/v1/node/{id}`).
- `headscaleProvisioning.ts`(site)는 `/api/v1/{user,preauthkey,policy}`만 호출, **`/api/v1/node` 호출 0**.
- ∴ rename/remove 하려면 **node id 파이프라인 신규**: name/IP → Headscale node id 해석 필요.

## blast radius (왜 dual-audit)

- **remove = `DELETE /api/v1/node/{id}`**: 그 머신을 mesh에서 **영구 추방**. 되돌리려면 그 머신에서 재join(account-join → 새 preauth). 잘못된 id 삭제 = **다른 머신(혹은 this PC) 추방** = 사용자 fleet 파괴. 한 방향(one-way) 작업.
- **rename**: 덜 위험하나 잘못된 id rename도 혼란.
- → **node id 해석이 틀리면 엉뚱한 노드 삭제.** name 충돌(같은 이름 2대), IP 재사용, stale 매핑 위험. 이게 dual-audit 핵심.

## 설계 옵션 (Critic 전 검토 필요)

**A. site 경유 (권장 후보)** — 새 `POST /api/account/mesh-node-action`(bearer control token, owner_key→acct user 스코프) → headscaleProvisioning.ts에 `listNodes`/`deleteNode`/`renameNode` 추가. owner의 acct user 노드만 조작(격리). Rust는 그 endpoint shell-out/HTTP.
  - 장: Headscale admin key가 서버 env only(클라이언트 미노출, mesh-join-key와 동일 패턴). owner 스코프 강제.
  - 단: site 라운드트립 + 새 endpoint.

**B. Rust 직접 Headscale 호출** — Rust가 Headscale admin API 직접.
  - 단: **admin key를 클라이언트(데스크탑)에 노출** = 보안 후퇴. **기각 후보**(mesh-join-key가 일부러 site 경유한 이유와 충돌, 메모리 self-contained).

→ **A 채택 방향.** node id 해석도 server-side(owner 스코프 내에서 name+IP 매칭, ambiguous면 거부).

## 구현 (A 기준, 잠정 — Critic 후 확정)

### Site (musu-bee)
- `headscaleProvisioning.ts`: `listNodesForUser(userId)`(`GET /api/v1/node?user=`), `renameNode(id,newName)`, `deleteNode(id)`.
- 새 route `POST /api/account/mesh-node-action`: bearer control token → owner_key→acct user → 요청 노드가 **그 user 소속인지 검증**(아니면 403) → action. **id는 클라가 아니라 server가 name+IP로 해석**, ambiguous(중복 매칭)면 거부.
- remove는 **추가 확인 토큰**(double-confirm) 고려.

### Rust + Shell
- Tauri command `mesh_node_rename`/`mesh_node_remove`(site endpoint 호출).
- fleet 행에 ⋯ 메뉴: Rename(인라인 입력) / Remove(확인 다이얼로그 — "영구 제거, 재연결은 그 PC에서 재join" + this-PC면 다른 경고/금지).
- **this-PC 자기 제거 가드**: 자기 자신 remove는 막거나 강한 확인(자기 fleet에서 자기 추방).

## 위험 / 열린 질문
1. **node id 해석 정확성** — name 충돌/IP 재사용 시 오삭제. server가 ambiguous 거부 필수. dual-audit 핵심.
2. **this-PC remove** — 자기 추방 footgun. 가드 필요.
3. **권한** — Headscale admin key 스코프(전체 노드 vs user 노드). owner 스코프 강제 확인.
4. **실기기 검증 한계** — 단일 머신. 노드 목록/매칭은 mock + 1회 라이브(VPS Headscale), 실제 DELETE는 신중(테스트 노드로만).
5. **rename 전파** — Headscale rename이 bridge dashboard `name`에 반영되는 시점(poll 지연).

## 게이트
- **Critic(security-engineer)**: A vs B, node id 해석 안전성, owner 스코프, this-PC 가드.
- **dual-audit(Phase 5, 2× 병렬)**: DELETE one-way blast radius → 오삭제 경로 전수.
- 실제 production Headscale DELETE = 사용자 승인 + 테스트 노드 한정.
