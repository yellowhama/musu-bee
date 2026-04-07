# musu-connects Advertisement And Import Plane

## 목적

local route advertisement와 remote route import를 같은 control surface 안에서 설명 가능한 수준으로 정리한다.

## advertised registry

저장 대상:

- exported local routes
- current share scope
- last advertisement status
- peer visibility state

예시:

```json
{
  "advertised_routes": [
    {
      "route_id": "route-local-ssh-alpha",
      "alias": "build-shell",
      "source_peer_id": "peer-workstation-alpha",
      "share_scope": "trusted-peers",
      "advertisement_state": "active",
      "last_advertised_at": "2026-04-02T10:20:02Z",
      "fresh_until": "2026-04-02T10:20:32Z"
    }
  ]
}
```

## imported registry

저장 대상:

- remote advertised routes
- source peer/device
- alias collision state
- freshness and health

예시:

```json
{
  "imported_routes": [
    {
      "import_id": "import-peer-workstation-alpha-route-local-ssh-alpha",
      "route_id": "route-local-ssh-alpha",
      "alias": "build-shell",
      "origin_peer_id": "peer-workstation-alpha",
      "origin_device_id": "device-workstation-alpha",
      "import_state": "active",
      "freshness_state": "fresh",
      "collision_state": "none"
    }
  ]
}
```

## registry lifecycle

### advertised registry

1. local route selected for export
2. share scope evaluation
3. advertisement_state = `active`
4. refresh on health/freshness update
5. advertisement_state = `withdrawn` or `stale`

### imported registry

1. advertised payload received
2. source peer validation
3. collision evaluation
4. import_state = `active` or `suppressed`
5. freshness reconcile
6. stale cleanup or withdraw

## imported route 상태 초안

- `active`
- `suppressed`
- `stale`
- `withdrawn`

## collision rules

우선 고려 항목:

- local route 우선
- same-peer update 허용
- different-peer same-alias 충돌 시 suffix 또는 namespace 필요

세부 규칙 초안:

- local route와 alias가 겹치면 imported route는 `suppressed`
- 같은 peer가 같은 `route_id`를 다시 보내면 기존 imported route를 업데이트
- 다른 peer가 같은 alias를 보내면 `collision_state = alias-conflict`
- `alias-conflict` 상태는 자동 승격하지 않고 operator resolution 대상으로 남긴다

## visibility rules

- `local-only`
- `peer-visible`
- `shared`

### share scope 규칙 초안

- `local-only`
  - advertisement 대상 아님
- `peer-visible`
  - trusted peer까지 광고 가능
- `shared`
  - shared-org 또는 명시 허용 peer까지 광고 가능

## audit 필요 항목

- imported route가 언제 들어왔는가
- 어떤 peer가 어떤 alias를 광고했는가
- 어떤 충돌이 발생했는가
- 어떤 imported route가 stale/withdraw 되었는가

## open questions

- namespace scheme
- collision UX
- imported route audit surface
