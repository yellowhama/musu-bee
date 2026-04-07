# Canonical Implementation Board

작성일: 2026-04-01

## 목적

`MUSU-CRT` 안에서 끝까지 구현해야 하는 remaining cuts를 canonical 기준으로 정리한다.

## Remaining Work

1. backport slice strategy
   - signaling / local / remote를 반영 순서 단위로 고정
2. first signaling slice entry
   - 가장 작은 원본 반영 단위를 명시
3. bounded backport prep
   - 실제 진입 전 검증과 rollback 기준 고정

## 현재 상태

- signaling: thin adapter / bridge handler / session coordinator 초안 있음
- stream: local adapter / parser / metrics / reconnect / local controller 초안 있음
- remote path: controller 초안 추가됨
- harness integration: canonical harness 추가됨
- original repo build / health / targeted test proof 확보됨

## 우선순위

1. backport slice strategy
2. first signaling slice
3. bounded backport prep
