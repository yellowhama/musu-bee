# 현재 상태 리포트: AI↔musu1↔musu2↔AI 연결 (2026-06-20)

> 목표: "AI ↔ musu컴1 ↔ musu컴2 ↔ AI" 연결 하나만 제대로 살린다. 사용자 호소: "왜 뭐 하나 할 때마다 토큰이 안되네 에러가 나네."
>
> 방법: 5개 READ-ONLY 코드 리더(병렬) + CLI 직접 실측(`musu nodes/mesh/relay`). 두 출처가 일치. 무당짓 아님 — 모든 결론 file:line + CLI 출력 근거.

---

## 0. 한 줄 결론

**배관은 코드상 연결돼 있다. 그러나 토큰이 절대 안 맞는다.** cross-machine의 세 구간(route 송신 · forward 송신 · 결과 callback)이 모두 **자기 머신의 랜덤 bridge 토큰**을 bearer로 보내는데, 수신측은 **자기 토큰**으로만 검증한다. 두 토큰은 머신마다 `getrandom`으로 따로 생성되고 **영원히 동기화되지 않는다**(pairing이 교환된 토큰을 버림). 사용자가 손수 모든 머신에 동일 `MUSU_TOKEN`을 깔지 않는 한 **모든 cross-machine 작업이 401**. 추가로 WAN relay 런타임은 죽어있어 같은 LAN/tailnet이 아니면 도달 자체가 안 된다.

---

## 1. CLI 직접 실측 (이 머신 = `hugh_second`)

```
$ musu nodes --json
  → hugh_second (this PC, Private Mesh, control_server_verified:true)
  → hugh-main   (다른 머신, last_seen 06-19, tailscale_ip:"", mesh_mode:"")
```
두 머신이 account fleet에 **등록은 됨**. 하지만:

```
$ musu mesh status
  local tailnet ip: [none]          ← 이 머신, mesh에 실제 join 안 됨
  release-grade proof: false

$ musu relay transport
  ok: false
  blockers: relay_disabled, relay_transport_not_wired,
            relay_tunnel_runtime_not_implemented,
            relay_payload_endpoint_not_wired, relay_url_not_configured,
            connect_pro_entitlement_required
```

→ **컨트롤플레인(등록/lease/rendezvous DTO)은 wired, 실제 데이터 transport는 전부 false.** 노드는 보이는데 작업은 못 보낸다.

---

## 2. 토큰 5(6)종 — single source of truth 없음

| # | 토큰 | 출처 | 용도 |
|---|---|---|---|
| 1 | bridge bearer | `MUSU_BRIDGE_TOKEN` / `~/.musu/bridge.env` (`install/token.rs::read_bridge_token`) | 로컬 bridge 인증 |
| 2 | peer_token | `MUSU_TOKEN` env **only** (`config.rs:95`) | 원격 소스가 쓸 수 있는 유일한 대체 토큰 |
| 3 | account/cloud | `~/.musu/token` device-flow (`cloud/token.rs`) | musu.pro 등록·discovery·relay lease |
| 4 | P2P control | `MUSU_P2P_CONTROL_TOKEN` + SHA256 allowlist (`p2pControlAuth.ts`) | **웹 전용** (Rust bridge는 모름) |
| 5 | route_evidence | `MUSU_ROUTE_EVIDENCE_TOKEN` | control+cloud 체인에 섞임 |
| 6 | mesh/relay | = account 토큰 재사용 | 별도 토큰 아님 |

**4개의 독립 토큰 해석기**(`read_bridge_token` / `read_control_token` / `cloud::load_token` / `p2pControlAuth`)가 `MUSU_TOKEN`에서 겹쳐서, "어느 토큰이 이기는지 path-dependent" — 코드 자체 주석(`install/token.rs:46-58`)이 "diverging ... auth failures path-dependent and hard to debug"라고 인정.

---

## 3. THE 근본 원인 — cross-machine 토큰 불일치 (HIGH, broken)

### 3-1. forward가 자기 토큰을 보냄
- 송신: `forward.rs:838` `forward_to_peer_attempt(...&state.config.token)` → `:710` `.bearer_auth(token)` — **소스 머신 자기 bridge 토큰**.
- 수신: `auth.rs:199` `ct_compare(token, state.token)` → `:204-208` fallback `peer_token`.
- 두 `state.config.token`은 `ensure_bridge_token`(`install/token.rs:86-94`)이 머신마다 `getrandom`으로 생성한 랜덤. 파일에 "Do NOT share the token" 명시.
- `ResolvedPeer`(`peer/discovery.rs:163`)에 **피어별 토큰 필드가 없음** → 소스가 상대 토큰을 쓸 구조적 방법이 없음.

### 3-2. pairing이 교환된 토큰을 버림
- `pair.rs:133` `Some((peer_name, peer_url, _token)) =>` — `_token` 바인딩하고 **버림**. 주소만 저장(`:147-149`).
- 즉 유일한 토큰 교환 메커니즘이 자격증명을 저장하지 않음 → "pairing 성공해도 forward는 여전히 401".

### 3-3. callback도 같은 비대칭 (mirror)
- 실행(타깃) 노드가 결과를 POST할 때 `callback_token = 타깃 자기 토큰`(`forward.rs:612-613`).
- 원본 노드의 `/api/tasks/callback`은 `require_bearer`로 **소스 토큰**을 검증 → callback 401 → 소스 task 영원히 pending. (메모리 `pattern-cross-machine-callback-auth`와 일치.)

### 3-4. peer_token은 `MUSU_TOKEN` env 외엔 아무도 안 채움
- 전체 트리에서 `peer_token` writer가 **`config.rs:95` 한 곳뿐**(env 읽기). pairing·cloud 등록·registry 어디도 안 씀.
- → 사용자가 **모든 머신에 동일 `MUSU_TOKEN`을 수동 설정**하지 않는 한 cross-machine 100% 실패. 이게 "매번 토큰 에러"의 정체.

### 3-5. mesh join이 토큰을 배포 안 함 (갭)
- cockpit fleet join(`lib.rs:1124` `musu mesh join`)은 `tailscale up` + `/health`(네트워크 IP 계층)만. **공유 bearer 토큰 배포 코드 없음.** → 네트워크는 붙어 online으로 보이지만 auth 토큰은 여전히 머신별 랜덤.

### 3-6. 부수 실패 경로
- **빈 토큰**: bridge.env 없으면 `get_token()`이 `unwrap_or_default()`로 빈 문자열 → 즉시 401 "empty token" (`cli_commands.rs:3525`, `auth.rs:193`).
- **원격 바인딩**: `bridge_host` 기본값 `127.0.0.1`(`config.rs:97`) → 원격이 `BRIDGE_HOST`를 LAN/tailnet IP로 명시 안 하면 도달 자체 불가.
- **cockpit pre-send 게이트**가 online만 보고 auth 미검증(`main.js:4004`) → 사용자는 online 머신 골라 Send → 401 카드 반복.

---

## 4. transport 도달 — WAN relay 죽음 (HIGH, dead-code)

- `rendezvous.rs:244` `not_implemented`, `p2pRelayPolicy.ts:10,12` `false`, relay connect `route.ts:245` → 409.
- LAN 직접 HTTP는 동작(토큰만 맞으면). Tailscale/headscale는 **주소 계층만**(토큰 동기화 안 함). mDNS는 물리 LAN 전용.
- → **같은 LAN/tailnet이 아니면 cross-machine 도달 0.**

---

## 5. 동작하는 것 (살릴 수 있는 토대)

- **단일 머신 경로는 일관**: control MCP(claude/codex가 `musu control` spawn) → 로컬 bridge가 같은 `bridge.env` 토큰으로 검증. 로컬은 OK.
- **cockpit cross-machine UI 배관은 실재(데드코드 아님)**: `main.js:4054` submitOrder → `invoke("submit_order")` → `lib.rs:1758` `musu route --target <peer> --channel desktop` → 원격 `/api/tasks/delegate` POST → `get_order_status` 폴링 → callback 확인. **배관은 다 있고, 토큰만 안 맞아서 끊긴다.**
- **auth 로직 자체는 견고**(상수시간 비교) — 버그가 아니라 **공유 토큰 배포 메커니즘 부재**라는 설계 갭.

---

## 6. 무엇을 덜어내야 하나 (사용자 "쓸데없는거 다 덜어내라")

- 토큰 5종 → 통합 필요(아래 딥리서치 리포트가 해법 제시).
- 4개 독립 토큰 해석기 → 단일화.
- WAN relay 자체 구현(`not_implemented`) → 딥리서치 결론은 "Tailscale/headscale가 이미 함, 자체 relay는 over-engineering" (단 사용자는 이전에 WAN relay 직접구현을 선택 → 새 리서치가 이를 재검토하게 함, Phase -1 대상).

→ 새 기획안은 `CONNECTION_REDESIGN_PLAN_2026_06_20.md` 참조.
