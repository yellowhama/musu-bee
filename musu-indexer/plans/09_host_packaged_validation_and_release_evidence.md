# Phase 09. Host Packaged Validation And Release Evidence

## 목표

코드와 문서 측면의 패키징 준비는 끝났다. 남은 일은 source tree 밖의 실제 host 환경에서 install path를 검증하고, 그 결과를 release evidence로 남기는 것이다.

## 현재 상태

- `scripts/run-packaged-install-smoke.sh`는 isolated venv, base install, missing-runtime message, extras metadata를 자동 검증한다.
- bootstrap order는 `python3 -m venv` 다음 `uv venv --seed` fallback이다.
- `--report <path>`로 smoke 결과를 파일로 남길 수 있다.
- `--online-extras`를 주면 `.[mcp]`, `.[watch]`, `.[full]`의 실제 install 시도도 수행한다.
- 현재 작업 세션 호스트는 `python3 -m venv`가 막혀 있고 `uv`도 없어 blocked report만 생성 가능하다.
- latest blocked evidence:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/packaged-install-smoke-blocked-20260402.txt`
- latest bundle evidence:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/validation-bundle-20260402T031532Z.txt`

## 범위

- host prerequisite 점검
- base packaged install smoke report 생성
- 온라인 extras smoke report 생성
- release checklist / handoff / TODO evidence 정리

## 비범위

- 새로운 packaging 구조 변경
- dependency 버전 상향
- semantic search, distributed indexing 같은 제품 범위 확장

## 작업 분해

### 1. Host Prerequisite Check

- `bash scripts/check-packaged-host-prereqs.sh`
- 실패하면 host blocker를 기록하고 종료한다.
- 성공하면 usable backend와 `pip` 가용성까지 확인한다.

### 2. Base Packaged Install Smoke

- preferred:
  - `bash scripts/run-validation-bundle.sh`
- direct packaged smoke only:
  - `bash scripts/run-packaged-install-smoke.sh --report <path>`
- 기대 결과:
  - `status: success`
  - `base_install`, `entrypoint_help`, `mcp_missing_runtime`, `watch_missing_runtime` 체크가 `ok`

### 3. Online Extras Validation

- 네트워크 가능한 host에서:
  - `bash scripts/run-validation-bundle.sh --online-extras`
- direct packaged smoke only:
  - `bash scripts/run-packaged-install-smoke.sh --online-extras --report <path>`
- 기대 결과:
  - `extras_online_mcp`, `extras_online_watch`, `extras_online_full`가 `ok`
- 네트워크/registry 제한으로 blocked면 그 이유가 report에 남아야 한다.

### 4. Release Evidence Closure

- `RELEASE_CHECKLIST.md`에 latest packaged report path와 결과를 기록
- `HANDOFF.md`에 마지막 검증 host, report path, blocked/ok 여부를 기록
- `TODO.md`, `MASTER_PLAN.md`에서 Phase 09를 닫는다

## 완료 기준

- 적어도 하나의 host에서 packaged smoke report가 생성된다.
- blocked면 환경 blocker가 명확히 적힌 report가 남는다.
- success면 base install과 extras install 결과가 문서에 반영된다.
- release closeout 문서들이 최신 report path를 가리킨다.

## 현재 판단

- 코드 레벨 blocking bug는 현재 없다.
- 남은 리스크는 host Python/venv/network 준비 상태다.
