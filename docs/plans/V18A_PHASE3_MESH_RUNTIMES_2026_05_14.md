# Phase 3 — Mesh peer runtime fetch (2026-05-14)

> Master plan §Phase 3. Phase 2 의 self-only API 를 peer 까지 확장 + node 삭제 시 cleanup.

## 산출물

- `runtime_routes.py`:
  - `_peer_url(name)` + `_peer_token(name)` — mesh_router 에서 lookup.
  - `_forward_to_peer(method, name, suffix)` — httpx async, 5s timeout. None on any failure (peer offline, non-2xx, malformed).
  - GET 의 self/peer/unknown 3 branch:
    - self → local store.
    - peer reachable → forward, source="peer".
    - peer unreachable → local cache 반환, `source="cache"`, `stale=True`.
    - unknown name → local cache (empty for truly new names), source="local".
  - POST 의 self/peer/unknown 3 branch:
    - self → detect_all + upsert.
    - peer reachable → forward.
    - peer unreachable → 502 (silent success 안 함).
    - unknown name → 404.
  - response model 에 `source: str` + `stale: bool` 추가.
- `server.py` 의 `DELETE /api/nodes/{name}` 에 `RuntimeStore.delete_node(name)` cascade 추가. orphan 방지.

## 검증

- pytest 8 cases (기존 4 + new 4):
  - test_probe_unknown_node_returns_404
  - test_list_unknown_node_returns_empty_local
  - test_list_peer_forwards_to_peer_url (monkeypatch _peer_url + _forward_to_peer)
  - test_list_peer_falls_back_to_cache_when_unreachable
  - test_probe_peer_502_when_unreachable
- bridge regression 14 sprint_contract + 8 runtime_routes = 22/22.

## 위험

- **import cycle**: runtime_routes 가 mesh_router 를 import — 둘 다 server.py 에서 load. 해결: `_peer_url` 안에서 late import.
- **peer token 누락**: nodes.toml 에 token 등록 안 된 peer 는 Authorization header 없이 forward 됨. peer 가 token 강제하면 401. expected — 명시적 peer pairing 후 사용.
- **peer 의 detect 가 5s 이상**: forward timeout 5s 라서 cut-off. peer 가 그것보다 느리면 unreachable 처리 → 502/cache fallback. acceptable.

## Status

- [x] runtime_routes.py 의 peer forwarding
- [x] response model 의 source/stale 필드
- [x] DELETE /api/nodes/{name} 의 fleet cleanup
- [x] 8 pytest pass + 22 regression
- [ ] commit
