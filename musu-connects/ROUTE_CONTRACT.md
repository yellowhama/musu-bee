# musu-connects Route Contract

## 목적

`musu-port`의 local managed route를 `musu-connects`가 peer-visible route로 광고하고, 다른 peer의 advertised route를 다시 local imported route로 가져오는 계약면을 고정한다.

## 핵심 모델

### 1. Local Managed Route

`musu-port`가 소유한다.

필수 필드:

- `route_id`
- `alias`
- `protocol`
- `entrypoint`
- `target_kind`
- `visibility`
- `health`

예시:

```json
{
  "route_id": "route-local-ssh-alpha",
  "alias": "build-shell",
  "protocol": "tcp",
  "entrypoint": {
    "host": "127.0.0.1",
    "port": 47110
  },
  "target_kind": "service",
  "visibility": "peer-visible",
  "health": {
    "status": "healthy",
    "checked_at": "2026-04-02T10:20:00Z"
  }
}
```

### 2. Advertised Route

`musu-connects`가 local route를 peer 네트워크용으로 변환한 형태다.

추가 필드:

- `source_device_id`
- `source_peer_id`
- `share_scope`
- `advertised_at`
- `fresh_until`
- `route_health`

예시:

```json
{
  "route_id": "route-local-ssh-alpha",
  "alias": "build-shell",
  "protocol": "tcp",
  "entrypoint": {
    "host": "10.20.0.5",
    "port": 47110
  },
  "target_kind": "service",
  "visibility": "peer-visible",
  "source_device_id": "device-workstation-alpha",
  "source_peer_id": "peer-workstation-alpha",
  "share_scope": "trusted-peers",
  "advertised_at": "2026-04-02T10:20:02Z",
  "fresh_until": "2026-04-02T10:20:32Z",
  "route_health": {
    "status": "healthy",
    "checked_at": "2026-04-02T10:20:02Z"
  }
}
```

### 3. Imported Route

다른 peer의 advertised route를 local MUSU에서 소비 가능한 형태로 변환한 것이다.

추가 필드:

- `import_id`
- `origin_device_id`
- `origin_peer_id`
- `import_state`
- `freshness_state`
- `collision_state`

예시:

```json
{
  "import_id": "import-peer-workstation-alpha-route-local-ssh-alpha",
  "route_id": "route-local-ssh-alpha",
  "alias": "build-shell",
  "protocol": "tcp",
  "entrypoint": {
    "host": "10.20.0.5",
    "port": 47110
  },
  "target_kind": "service",
  "visibility": "peer-visible",
  "origin_device_id": "device-workstation-alpha",
  "origin_peer_id": "peer-workstation-alpha",
  "import_state": "active",
  "freshness_state": "fresh",
  "collision_state": "none"
}
```

## 필드 변환 규칙

### Local -> Advertised

- `route_id`, `alias`, `protocol`, `entrypoint`, `target_kind`, `visibility`는 그대로 유지한다.
- `health`는 `route_health`로 복사한다.
- `source_device_id`, `source_peer_id`, `share_scope`, `advertised_at`, `fresh_until`는 `musu-connects`가 채운다.

### Advertised -> Imported

- advertised route의 core route 필드는 유지한다.
- `import_id`는 `origin_peer_id + route_id` 조합으로 만든다.
- `origin_device_id`, `origin_peer_id`는 source 필드에서 온다.
- `import_state`, `freshness_state`, `collision_state`는 local import registry가 채운다.

## route lifecycle

### 1. local register

`musu-port`가 local managed route를 registry에 넣는다.

### 2. advertise

`musu-connects`가 local route를 peer-visible advertised route로 변환한다.

### 3. exchange

peer 간 advertised route를 교환한다.

### 4. import

받은 advertised route를 imported route registry에 넣는다.

### 5. reconcile

`fresh_until`이 지나면 `freshness_state`를 `stale`로 바꾸고, stale cleanup 후보로 올린다.

### 6. remove

peer disconnect 또는 advertisement stop 시 imported route를 비활성화 또는 삭제한다.

## 흐름

1. `musu-port`가 local managed route를 가진다
2. `musu-connects`가 이를 advertised route로 변환한다
3. peer 간 advertised route를 교환한다
4. 받은 advertised route를 imported route로 변환한다
5. imported route는 local route registry와 같은 서비스 표면에 합쳐진다

## collision 규칙 초안

- local route alias가 항상 우선이다.
- 같은 `origin_peer_id + route_id` 조합의 업데이트는 기존 imported route를 갱신한다.
- 다른 peer가 같은 alias를 광고하면 `collision_state = "alias-conflict"`로 표시한다.
- conflict 상태의 imported route는 자동 승격하지 않는다.

## freshness 규칙 초안

- `fresh_until` 이전: `fresh`
- `fresh_until` 경과 후 grace period 내: `degraded`
- grace period 이후: `stale`
- `stale` imported route는 cleanup 대상으로 본다

## `musu-port` 대응표

| `musu-port` field | `musu-connects` advertised field | imported field |
| --- | --- | --- |
| `route_id` | `route_id` | `route_id` |
| `alias` | `alias` | `alias` |
| `protocol` | `protocol` | `protocol` |
| `entrypoint` | `entrypoint` | `entrypoint` |
| `target_kind` | `target_kind` | `target_kind` |
| `visibility` | `visibility` | `visibility` |
| `health` | `route_health` | `freshness_state`와 함께 소비 |

## open questions

- `route_id`와 `import_id`의 안정성 규칙
- alias collision 우선순위
- share scope 기본값
