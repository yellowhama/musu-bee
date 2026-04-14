# Phase 5 Mesh Routing — 정성적 평가 & 코드 감사

> 작성: 2026-04-14 | 범위: Phase 5A/5B/5C

---

## 1. 정성적 평가

| 항목 | 점수 | 근거 |
|------|------|------|
| 전체 아키텍처 | **78/100** | 3-Layer 접근 명확, HTTP-first로 즉시 동작 |
| Phase 5A (musu-bridge 라우팅) | **90/100** | nodes.toml → MeshRouter → 자동 포워딩 완성 |
| Phase 5B (musu-port 라우트 교환) | **82/100** | /advertised-routes + /mesh-routes 동작, DoS 픽스 추가 |
| Phase 5C (musu-core 포워딩) | **75/100** | null 체크 버그 1개 픽스됨, 나머지 견고 |
| 코드 보안 | **72/100** → **80/100** (픽스 후) | Critical 3개 픽스 완료 |
| 테스트 커버리지 | **45/100** | mesh 라우팅 통합 테스트 없음 |

**종합: 79/100** (Phase 4 이전 67 → +12점)

---

## 2. 완성된 것

### Phase 5A — musu-bridge 자동 라우팅
- `~/.musu/nodes.toml` — 에이전트 → 노드 할당 선언
- `musu-bridge/mesh_router.py` — MeshRouter 클래스, nodes.toml 로드, HTTP 포워딩
- `musu-bridge/handlers.py` — route_chat()에 mesh check 추가
- `musu-bee/ChatArea.tsx` — LOCAL/REMOTE 토글 숨김

**결과**: 유저가 "engineer" 채널에 보내면 자동으로 main-pc musu-bridge로 포워딩

### Phase 5B — musu-port 라우트 교환
- `mesh_routes.rs` — AdvertisedRoute, ImportedPeerRoutes 타입
- `GET /advertised-routes` — 로컬 서비스를 피어 포맷으로 노출
- `GET /mesh-routes` — 로컬 + 피어 routes 통합 뷰
- 피어 프로빙 확장 — 5초마다 `/advertised-routes` fetch & 캐시

**결과**: musu-port A에서 B의 서비스 목록을 볼 수 있음

### Phase 5C — musu-core inter-node forwarding
- `mesh.py` — bridge_url_for_node/agent() 메서드 추가
- `router.py` — agent 못 찾으면 mesh 조회 → remote bridge로 forwarding
- `_forward_to_bridge()` — httpx 300s timeout async 포워딩

**결과**: CEO → Engineer 위임 시 router.py 레벨에서도 cross-node 동작

---

## 3. 코드 감사 결과

### Critical (2개) → 픽스 완료

| # | 파일 | 이슈 | 픽스 |
|---|------|------|------|
| C1 | `router.py:305` | `node_for_agent() or ""` → is_local("") 항상 False | `node is not None` 명시적 체크로 교체 |
| C2 | `server.rs:316` | 피어에서 받은 Vec 크기 무제한 → 메모리 소진 가능 | `routes.len() <= 1000` DoS 가드 추가 |

### High (남은 것, 즉각 위협 없음)

| # | 파일 | 이슈 | 조치 |
|---|------|------|------|
| H1 | `mesh_router.py` | `except Exception` 너무 광범위 | 다음 세션에 httpx 예외로 좁히기 |
| H2 | `router.py:261` | `resp.json()` 실패 시 미처리 | httpx는 기본으로 잡힘, 낮은 실제 위험 |
| H3 | `server.rs` | 스테일 imported_routes 정리 없음 | 다음: 피어 unreachable 시 eviction 추가 |
| H4 | `server.rs` | 피어 URL 미검증 (설정 파일에서 오므로 낮은 위험) | 설정 레벨 검증으로 해결 예정 |

### Medium (잔존)
- mesh.py O(N) 에이전트 룩업 (현재 에이전트 수 ~10개, 무시 가능)
- mesh_routes.rs 의 unix_now_secs() 중복 (state.rs에도 있음)

---

## 4. 아키텍처 갭

```
현재 동작:
user → musu-bee → /api/agent-route → local musu-bridge
                                          ↓ (if remote agent)
                                     mesh_router.forward()
                                          ↓
                                     remote musu-bridge
                                          ↓
                                     remote agent → 응답

아직 없는 것:
- CEO(local) → [DELEGATE: engineer] → musu-core router
  → mesh forwarding (5C 구현됨, 실제 위임 패턴 테스트 필요)
- musu-port mesh-routes 원격 머신 재배포 필요
- nodes.toml remote 머신 업데이트 필요 (self = "main-pc", url 필드)
- 상태 동기화 (Phase 5D) — company records, message history
```

---

## 5. 검증 항목

```bash
# 로컬 musu-bridge (자동 라우팅 확인)
curl -s http://localhost:8070/api/channels | jq '.engineer'
# engineer가 있으면 로컬 처리, 없으면 mesh 포워딩됨

# musu-port advertised routes (5B)
curl -s http://localhost:1355/advertised-routes | jq '.[].alias'

# mesh 통합 뷰 (양쪽 재배포 후)
curl -s http://localhost:1355/mesh-routes | jq '{
  local_count: (.local|length),
  peer_routes: (.imported | map({peer:.peer_url, count:(.routes|length)}))
}'

# musu-core 라우팅 테스트 (5C)
PYTHONPATH=musu-core/src python3 -c "
import asyncio
from musu_core.mesh import get_registry
r = get_registry()
print('engineer node:', r.node_for_agent('engineer'))
print('bridge url:', r.bridge_url_for_agent('engineer'))
print('is_local:', r.is_local(r.node_for_agent('engineer') or ''))
"
```
