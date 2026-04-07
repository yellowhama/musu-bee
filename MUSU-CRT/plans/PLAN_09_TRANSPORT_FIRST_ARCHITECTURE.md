# PLAN 09 - Transport-First Architecture

## 목적

`MUSU-CRT`에서 transport 우선순위를 명확히 고정한다.

핵심 결정:

- `HTTP`는 local proof / bootstrap / fallback only
- `WebSocket + WebRTC`는 cross-computer CRT primary transport

## 배경

현재 `MUSU-CRT`에는 정적 viewer와 harness가 있다.
이 산출물은 파일 서빙을 위해 HTTP를 쓰지만, 실제 제품 transport 구조를 대표하지 않는다.

원본 MUSU 코드에는 이미 local realtime frame path와 WebRTC path가 공존한다.
이를 하나의 "stream"으로 뭉개면 추출 방향이 틀어진다.

## 할 일

1. master plan에 transport 원칙 반영
2. current state에 local path / remote path 구분 반영
3. todo board에 active objective 반영
4. transport architecture 문서 작성
5. 이후 signaling/stream extraction 문서가 이 transport 원칙을 따르도록 연결

## 완료 기준

- `CRT_TRANSPORT_ARCHITECTURE.md` 존재
- `MASTER_PLAN.md` active plan이 `PLAN_09`
- `CURRENT_STATE.md`에 local path / remote path 구분 반영
- `TODO_EXECUTION_BOARD.md`에 transport-first objective 반영
