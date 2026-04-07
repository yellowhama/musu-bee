# musu-connects Transport And Health Model

## 목적

peer 간 transport와 health/reconcile 신호를 한 모델로 정리한다.

## transport responsibility

- peer session open/close
- encrypted channel 유지
- advertisement payload 교환
- route import freshness 유지

예시 session record:

```json
{
  "peer_id": "peer-workstation-alpha",
  "session_id": "sess-peer-workstation-alpha-001",
  "transport_state": "connected",
  "connected_at": "2026-04-02T10:50:00Z",
  "last_heartbeat_at": "2026-04-02T10:50:12Z"
}
```

## health responsibility

- peer reachability
- advertised route freshness
- imported route stale cleanup
- reconnect/backoff

예시 health record:

```json
{
  "peer_id": "peer-workstation-alpha",
  "reachability": "reachable",
  "freshness_state": "fresh",
  "reconcile_state": "clean",
  "last_probe_at": "2026-04-02T10:50:12Z",
  "retry_count": 0
}
```

## suggested lifecycle

1. `discovered`
2. `handshaking`
3. `connected`
4. `degraded`
5. `stale`
6. `closed`

## transport lifecycle 해석

- `discovered`
  - peer hint만 있고 session은 아직 열리지 않음
- `handshaking`
  - identity 검증 및 transport bootstrap 중
- `connected`
  - advertisement/import payload 교환 가능
- `degraded`
  - heartbeat 지연, 일부 route freshness 경고
- `stale`
  - session은 남아 있어도 imported route freshness를 보장하지 못함
- `closed`
  - session 종료, imported route cleanup 후보

## reachability signal 초안

- `reachable`
- `intermittent`
- `unreachable`

## reconcile 흐름

1. peer session open
2. last heartbeat 기록
3. advertised route freshness 갱신
4. imported route freshness 재판정
5. stale imported route cleanup 후보 생성
6. peer close 시 imported route withdraw 처리

## reconnect / backoff 초안

- 첫 실패 후 short retry
- 연속 실패 시 exponential backoff
- heartbeat가 일정 시간 회복되면 retry_count 초기화

## stale cleanup 규칙 초안

- imported route가 `fresh_until`을 넘기면 `degraded`
- grace period 이후 `stale`
- peer session이 `closed`면 imported route를 `withdrawn`
- `withdrawn` route는 cleanup worker가 제거 가능

## open questions

- QUIC vs tunnel baseline
- health heartbeat format
- stale timeout 기본값
