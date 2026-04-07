# Phase 11. Host Validation Automation And Bundle

## 목표

Phase 09의 남은 검증이 host 환경 의존이라도, 사람이 수동으로 여러 명령을 순서대로 치지 않도록 자동화한다. 준비 상태 판정, smoke, packaged smoke를 하나의 evidence bundle로 남길 수 있어야 한다.

## 범위

- host prerequisite check script
- aggregate validation bundle script
- README / handoff / release checklist 연결

## 작업 분해

### 1. Host Prerequisite Probe

- `check-packaged-host-prereqs.sh`
- `python3 -m venv` 가능 여부 확인
- `uv venv --seed` fallback 가능 여부 확인
- report 파일 생성

### 2. Validation Bundle

- `run-validation-bundle.sh`
- host prerequisite report 생성
- local smoke 실행
- packaged smoke 실행
- 결과를 bundle report에 묶음

### 3. Documentation Alignment

- README에 bundle entrypoint 추가
- release checklist에 bundle evidence 반영
- handoff에 current bundle path 예시 반영

## 완료 기준

- 한 명령으로 현재 host readiness와 packaged smoke 상태를 동시에 기록할 수 있다.
- Phase 09의 잔여 작업이 “적절한 host에서 bundle 다시 실행” 수준으로 축소된다.

## Current Result

- status: done
- `scripts/check-packaged-host-prereqs.sh` 추가
- `scripts/run-validation-bundle.sh` 추가
- 현재 host에서도 blocked/success 상태를 report/bundle로 남길 수 있다.
- latest bundle evidence:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/validation-bundle-20260402T031532Z.txt`
