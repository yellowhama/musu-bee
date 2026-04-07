# Phase 10. Packaged Bootstrap Fallback And Host Guidance

## 목표

packaged-install smoke가 host Python packaging 상태에 과도하게 의존하는 문제를 줄인다. 특히 Ubuntu/Debian 계열에서 `python3 -m venv`가 막혀도 대체 bootstrap 경로를 제공해야 한다.

## 배경

- 현재 호스트는 `python3 -m venv` 단계에서 막힌다.
- Python 공식 문서상 `venv`는 `ensurepip`에 의존한다.
- Ubuntu 공식 문서는 완전한 개발 런타임으로 `python3-full`을 권장한다.
- Astral `uv`는 `uv venv --seed`로 pip가 포함된 venv를 만들 수 있다.

리서치 정리:

- `/home/hugh51/musu-functions/musu-indexer/PACKAGED_INSTALL_BLOCKER_RESEARCH_2026-04-02.md`

## 범위

- packaged smoke bootstrap fallback
- report에 backend 정보 기록
- host guidance 문서화

## 비범위

- 실제 network-enabled host에서 extras install 성공 evidence 생성
- packaging dependency 구조 변경

## 작업 분해

### 1. Research Capture

- official source를 바탕으로 blocker와 대안을 문서화한다.

### 2. Bootstrap Fallback

- `python3 -m venv`
- 실패 시 `uv venv --seed`
- 둘 다 실패하면 `blocked`

### 3. Report Enrichment

- smoke report에 `venv_backend`, `python3`, `uv`, check history를 기록한다.

### 4. Host Guidance

- README / handoff / release checklist에 다음 기준을 적는다.
  - Ubuntu 계열이면 `python3-full` 또는 동등한 `venv/ensurepip` 환경 필요
  - 대안으로 `uv`가 있으면 packaged smoke를 진행 가능

## 완료 기준

- fallback logic이 스크립트에 반영된다.
- blocked report만 남는 환경에서도 진단 정보가 이전보다 명확하다.
- follow-up phase는 host validation evidence만 남는다.

## Current Result

- status: done
- `scripts/run-packaged-install-smoke.sh`는 `uv` fallback과 backend reporting을 지원한다.
- repo에는 blocker research 문서가 추가됐다.
- 현재 호스트는 `uv`도 없어 여전히 blocked지만, blocker 원인과 다음 액션은 더 명확해졌다.
