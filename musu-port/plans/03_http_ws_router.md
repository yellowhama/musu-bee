# 03 HTTP WS Router

## 목표

원본 `port_manager.rs`의 alias 기반 HTTP/WS 라우팅을 standalone으로 재현한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`

## 이번 단계 범위

- HTTP proxy
- websocket bridge
- metrics export
- route resolution error handling

## 제외 범위

- CONNECT tcp ingress
- QUIC
- persistence

## 구현 작업 목록

- `resolve_route()` 구현
- `build_target_url()` 구현
- HTTP request proxy 구현
- retry/backoff env 처리 구현
- ws bridge 구현
- metrics text/json export 구현
- header filtering 구현

## 검증 방법

- 로컬 HTTP echo 서버
- 로컬 websocket echo 서버
- `/metrics` 증가 확인
- 잘못된 alias/disabled/running false 응답 확인

## 보류 항목

- CONNECT ingress
- 고급 policy

## 완료 기준

- HTTP/WS alias routing이 smoke test 통과

## 현재 결과

- 부분 완료
- 구현 완료:
  - HTTP alias proxy skeleton
  - websocket bridge skeleton
  - metrics text/json endpoint
  - request/response header filtering
  - retry/backoff env 처리
- 남은 검증:
  - 실제 backend를 띄운 end-to-end HTTP smoke
  - 실제 websocket echo backend smoke
