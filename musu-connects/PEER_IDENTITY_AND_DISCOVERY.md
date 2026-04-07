# musu-connects Peer Identity And Discovery

## 목적

기기를 어떻게 peer로 인식하고, 어떤 기준으로 발견하고, 어느 수준까지 신뢰할지를 고정한다.

## 모델

### Device Identity

- `device_id`
- `device_label`
- `host_platform`
- `runtime_profile`

예시:

```json
{
  "device_id": "device-workstation-alpha",
  "device_label": "Workstation Alpha",
  "host_platform": "windows-main",
  "runtime_profile": "desktop-primary"
}
```

### Peer Identity

- `peer_id`
- `device_id`
- `trust_level`
- `visibility_scope`
- `last_seen_at`

예시:

```json
{
  "peer_id": "peer-workstation-alpha",
  "device_id": "device-workstation-alpha",
  "trust_level": "trusted",
  "visibility_scope": "trusted-peers",
  "last_seen_at": "2026-04-02T10:45:00Z"
}
```

## peer record

실제 registry에는 아래 형태로 저장한다고 본다.

```json
{
  "peer_id": "peer-workstation-alpha",
  "device": {
    "device_id": "device-workstation-alpha",
    "device_label": "Workstation Alpha",
    "host_platform": "windows-main",
    "runtime_profile": "desktop-primary"
  },
  "trust_level": "trusted",
  "visibility_scope": "trusted-peers",
  "discovery_state": "connected",
  "last_seen_at": "2026-04-02T10:45:00Z",
  "discovered_via": "manual-seed"
}
```

## discovery lifecycle

1. peer hint 획득
2. identity handshake
3. trust scope 판정
4. route advertisement 수신 가능 여부 결정
5. health/last_seen 갱신

### lifecycle 상태 초안

- `seeded`
- `discovered`
- `handshaking`
- `verified`
- `connected`
- `degraded`
- `blocked`
- `forgotten`

## trust level 예시

- `blocked`
- `known`
- `trusted`
- `shared-org`

### trust level 의미

- `blocked`
  - peer는 기록되지만 route import/advertisement를 허용하지 않는다
- `known`
  - identity는 기억하지만 route 교환은 제한적이다
- `trusted`
  - route advertisement/import를 허용하는 기본 peer다
- `shared-org`
  - 같은 조직 네트워크로 간주하고 더 넓은 share scope를 허용한다

## discovery source 예시

- `manual-seed`
- `lan-broadcast`
- `known-peer-sync`
- `org-directory`

## 판정 규칙 초안

- `peer_id`는 로컬 registry에서 안정적인 key로 쓴다
- `device_id`는 같은 물리/논리 장치를 식별하는 기준이다
- `trust_level = blocked`이면 imported route를 활성화하지 않는다
- `visibility_scope`는 route advertisement filter와 연결된다
- `last_seen_at`이 오래된 peer는 `degraded` 또는 `forgotten` 후보로 본다

## open questions

- discovery bootstrap source
- device fingerprint 방식
- trust elevation UX
