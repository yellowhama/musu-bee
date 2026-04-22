# Phase 55: CEO 하네스 루프 타임아웃 수정

> 작성: 2026-04-22

## 문제

CEO agent task가 `timeout after 300s`로 계속 실패.

**root cause**: `server.py:582`
```python
_use_qa = req.use_qa_loop and req.channel == "engineer"
_timeout = 900 if _use_qa else 300  # CEO는 항상 300s
```
Agent의 `adapter_config.timeout_sec`(900)을 무시하고 300s 강제.

## 현재 상태 (2026-04-22)

- Phase 52 (VNC TTL): ✅ 이미 구현됨
- Phase 53 (musu-core 테스트): ✅ 이미 구현됨
- CEO/engineer/qa instructions_path: ✅ 설정됨
- CEO adapter_config.timeout_sec=900: ✅ DB에 저장됨
- **server.py delegate_task timeout 하드코딩**: ❌ 고쳐야 함

## 구현 태스크

### P1: DelegateTaskRequest에 timeout_sec 필드 추가

**파일**: `musu-bridge/server.py`
**위치**: `DelegateRequest` 클래스 (약 490-497줄)

```python
# 추가할 필드
timeout_sec: int | None = Field(default=None, ge=30, le=3600,
    description="Override agent default timeout. None = use agent adapter_config.timeout_sec.")
```

### P0: delegate_task timeout 로직 — agent adapter_config 반영

**파일**: `musu-bridge/server.py`
**위치**: line 581-582

```python
# 현재
_use_qa = req.use_qa_loop and req.channel == "engineer"
_timeout = 900 if _use_qa else 300

# 변경
_use_qa = req.use_qa_loop and req.channel == "engineer"
_channel_info = channel_map.get(req.channel, {})
_agent_id = _channel_info.get("agent_id")
_agent_record = get_agent_by_id(_agent_id) if _agent_id else None
_agent_timeout = int((_agent_record.get("adapter_config") or {}).get("timeout_sec", 300)) if _agent_record else 300
_timeout = 900 if _use_qa else max(req.timeout_sec or 0, _agent_timeout) or 300
```

**의존성**: `get_agent_by_id` 함수가 handlers.py에 있어야 함.

### P2: PATCH /api/agents/{id} — adapter_config_patch 지원

**파일**: `musu-bridge/server.py` + `musu-bridge/handlers.py`

server.py `AgentUpdateRequest`:
```python
adapter_config_patch: dict | None = Field(default=None,
    description="Partial adapter_config patch (shallow merge)")
```

handlers.py `update_agent_fields()`:
```python
# adapter_config_patch 파라미터 추가
# 기존 adapter_config에 shallow merge
```

## 완료 기준

1. `pytest musu-bridge/tests/ -q` → 0 failures (기존 124개 + 신규 테스트)
2. bridge 재시작 후 CEO task → 300s 이전에 output 생성
3. CEO가 "Phase 52/53 완료, 새 Phase 대기 중" 보고

## 커밋 전략

```
feat(phase-55): fix delegate_task to respect agent timeout_sec
```

단일 커밋으로 P0+P1+P2 묶기.
