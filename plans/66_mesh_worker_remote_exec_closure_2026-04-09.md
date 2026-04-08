# Plan 66 — Mesh Worker Remote Exec Closure (2026-04-09)

## Objective

멀티 머신 MUSU 운영에서 “다른 컴퓨터에서 해야 하는 작업(배포/재시작/로그확인/실행)”을 **원격 실행 루프**로 닫는다.

핵심은 단순하다:

- 각 머신에 `musu-worker`를 띄운다 (`:9700`).
- orchestrator(카페 노트북/메인 작업 머신)에서 `musu-core`의 `remote_process` / `remote_cli` 어댑터로 원격 실행한다.
- 이 구성이 Paperclip 이슈의 “5070Ti 배포/증거 수집” 같은 보드 블로커를 **사람 로그인 없이** 처리할 수 있게 만든다.

## Non-goals (이번 패킷에서 하지 않는 것)

- QUIC 기반 transport로 원격 실행을 옮기기 (현재는 Tailscale HTTP로 충분)
- “안전한” 원격 실행 (현재 `musu-worker`는 의도적 RCE 엔드포인트를 포함한다)
  - 대신 최소한의 방어(토큰/레이트리밋/런북)를 고정한다.
- Paperclip 자체 기능 확장

## Current State (API/현장 사실)

- `~/.musu/nodes.toml` 은 이미 존재하며 `main-pc=100.121.211.106`, `second-pc=100.126.67.88`, `worker_port=9700` 로 설정되어 있다.
- 하지만 두 노드 모두 `http://<tailscale_ip>:9700/health` 접속이 실패한다.
  - 즉, “노드 등록”은 되어 있지만 “원격 실행 worker 프로세스”가 **실행 중/접근 가능 상태가 아니다**.
- 이게 현재 보드의 `5070Ti` 관련 배포/검증 이슈가 blocked로 남는 직접 원인이다.

## Architecture (Target)

```
Machine A (orchestrator)                  Machine B (worker node)
  musu-bridge (:8070)   ─────HTTP────►      musu-worker (:9700)
  musu-core adapters:                         /execute/process  (RCE)
    - remote_process                           /execute/cli
    - remote_cli                               /health
  nodes.toml registry
```

## Implementation Plan

### Step 1 — Make worker reachable on every node

1. 각 노드에 `musu-worker`가 설치되어 있어야 한다.
2. `musu-worker`가 `0.0.0.0:9700`으로 바인딩되어야 한다.
3. Tailscale mesh에서 `:9700` 접근이 가능해야 한다.
4. `MUSU_WORKER_TOKEN`을 운영에서 설정한다(권장: 32자 이상 랜덤).

**Runbook (노드에서 실행)**

- health:
  - `curl -sf http://127.0.0.1:9700/health`
- capabilities:
  - `curl -sf -H "Authorization: Bearer $MUSU_WORKER_TOKEN" http://127.0.0.1:9700/capabilities`

### Step 2 — Add a mesh healthcheck script (orchestrator side)

목표: `nodes.toml`에 있는 모든 노드에 대해

- worker health를 체크하고
- 실패 시 “무엇이 문제인지(연결 실패 vs 401)”를 한 줄로 요약해서
- Paperclip 이슈에 증거로 붙일 수 있게 만든다.

산출물:

- `scripts/musu_mesh_healthcheck.py`

### Step 3 — Add a remote exec helper (orchestrator side)

목표: 특정 노드에 대해 원격 프로세스를 실행하고 stdout/stderr/exitcode를 출력한다.

산출물:

- `scripts/musu_remote_process.py`

### Step 4 — Wire to TODO discipline

- 이 패킷이 닫히면, 보드의 “다른 컴퓨터에서 해야 해서 blocked”류는 원칙적으로 **remote_process로 처리 가능한 형태**가 된다.
- 이후 개별 이슈(예: `5070Ti portd deploy`)는 “SSH” 대신 “worker health + remote_process”로 증거를 남긴다.

## Acceptance Criteria

1. `curl http://100.121.211.106:9700/health` 가 200을 반환한다.
2. `curl http://100.126.67.88:9700/health` 가 200을 반환한다.
3. `python scripts/musu_mesh_healthcheck.py` 가 두 노드를 `ok`로 보고한다.
4. `python scripts/musu_remote_process.py --node main-pc -- command echo hello` 가 원격에서 `hello`를 반환한다.

## Evidence Artifacts

- `scripts/musu_mesh_healthcheck.py` 실행 로그 (성공 시 2노드 ok)
- `scripts/musu_remote_process.py` 실행 로그 (원격 echo proof)

