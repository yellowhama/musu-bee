# PLAN 27 - Canonical Direct Smoke

## 목적

원본 repo bootstrap이나 shell navigation에 의존하지 않고 `MUSU-CRT` 내부 canonical harness만으로 signaling + local stream proof를 닫는다.

## 작업

1. canonical harness에 deterministic smoke marker 추가
2. summary card와 ready badge 추가
3. fixture 기반 smoke script 추가
4. runbook으로 자동/수동 확인 경로 고정

## 완료 기준

- harness HTML에 root/ready/summary marker가 있다
- harness JS가 canonical smoke global을 노출한다
- smoke script가 fixture와 asset 구조를 검증한다
- runbook이 문서화된다
