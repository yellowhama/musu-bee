# Musu Indexer Master Plan

## 목표

`musu-indexer`를 "로컬 SQLite FTS 인덱서 + MCP 서버 + 세션/spy 런타임"으로 다시 정리한다.

핵심 목표:

- CLI, MCP, watcher, spy, session 기능의 런타임 경계를 분리한다.
- workspace root / include / exclude 규칙을 명시적 계약으로 바꾼다.
- full sync와 incremental sync를 큰 워크스페이스에서도 예측 가능하게 만든다.
- phase 문서를 먼저 만들고, 구현과 검증은 그 phase 문서 기준으로 진행한다.

## Phase Status

- Phase 01. CLI Runtime Decoupling And Workspace Profiles
  - status: done
  - focus: CLI lazy import, workspace profile contract, root resolution, scope semantics
- Phase 02. Sync Engine Stabilization
  - status: done
- Phase 03. Query And Retrieval Quality
  - status: done
- Phase 04. Session / ACP Productization
  - status: done
- Phase 05. MCP Tool Surface And Packaging
  - status: done
- Phase 06. Validation And Release Readiness
  - status: done
- Phase 07. Session Runtime Persistence
  - status: done
- Phase 08. Packaged Install And Engine Failure Propagation
  - status: done
  - focus: Python fallback guard, explicit error surfacing, packaged smoke scripting, evidence capture
- Phase 09. Host Packaged Validation And Release Evidence
  - status: in_progress
  - focus: host prerequisites, isolated install validation, extras validation, release evidence capture
- Phase 10. Packaged Bootstrap Fallback And Host Guidance
  - status: done
  - focus: Ubuntu/Debian packaging blocker research, `uv` fallback, backend reporting, host guidance
- Phase 11. Host Validation Automation And Bundle
  - status: done
  - focus: host prerequisite probe, aggregate validation bundle, evidence capture automation

## 현재 코드 상태

2026-04-02 기준 현재 상태:

- 저장소 구조
  - Python orchestration / CLI / MCP:
    - `src/musu_indexer/`
  - Go scanner/indexer engine:
    - `indexer_src/main.go`
  - package metadata:
    - `pyproject.toml`
- 현재 워크트리는 이미 in-flight 변경을 포함한다.
  - modified:
    - `src/musu_indexer/cli.py`
    - `src/musu_indexer/core.py`
    - `src/musu_indexer/server.py`
    - `src/musu_indexer/spy_sink.py`
  - untracked:
    - `src/musu_indexer/resolver.py`
    - `src/musu_indexer/session_manager.py`
- 현재 구현상 중요한 관찰
  - CLI/MCP/watcher/runtime 경계는 현재 분리되어 있다.
  - workspace profile, include/exclude/ignore 계약이 들어가 있다.
- sync evidence, cleanup, search ranking, session lifecycle surface, smoke/release 문서까지 baseline은 정리됐다.
- sync correctness는 Python scan + Python index fallback guard로 복구됐다.
- session persistence는 완료됐다.
- runtime path error surfacing도 정리됐다.
- packaged smoke report와 blocked-environment detection도 들어갔다.
- packaged smoke는 이제 `python3 -m venv` 다음에 `uv venv --seed` fallback을 시도하고, backend를 report에 남긴다.
- host prerequisite probe와 validation bundle script가 추가되어, Phase 09는 suitable host에서 bundle 재실행만 남은 상태다.
- 남은 큰 갭은 host prerequisites가 갖춰진 환경에서 실제 packaged-install evidence를 찍는 것이다.

## 운영 원칙

### 1. 런타임 경계를 먼저 자른다

- CLI local command는 MCP dependency 없이 떠야 한다.
- MCP server는 MCP dependency가 있을 때만 로드한다.
- watcher / spy / session은 별도 runtime concern으로 분리한다.

### 2. root 추론 대신 profile을 쓴다

- `cwd == project root`는 작은 repo에는 편하지만, `/home/hugh51/musu-functions` 같은 workspace에는 위험하다.
- include roots / exclude roots / ignore patterns를 명시적으로 받는 profile이 필요하다.

### 3. 큰 workspace 기준으로 설계한다

- `references/`, generated output, vendored asset, archive를 섞어 돌리는 순간 검색 품질이 무너진다.
- 따라서 first-class exclude 계약이 필수다.

### 4. phase 문서가 구현보다 먼저다

- phase 시작 전 `plans/NN_<slug>.md`를 먼저 만든다.
- phase 종료 후 README, validation, runbook을 같이 정리한다.

## 비목표

이 마스터 플랜에서 바로 하지 않을 것:

- semantic embedding search
- distributed indexing
- cloud-hosted database
- editor plugin 확장
- cross-machine sync

지금 범위는 "로컬 인덱서/서버를 운영 가능한 제품 면으로 재정렬"하는 데 한정한다.

## Phase Ordering

## Phase 01. CLI Runtime Decoupling And Workspace Profiles

목적:

- 로컬 CLI가 MCP dependency 없이 동작하게 만든다.
- workspace profile / include / exclude / ignore 계약의 최소 형태를 도입한다.

출력물:

- lazy import 또는 runtime split 설계
- profile manifest 초안
- root resolution 정책 문서
- scope filtering 재정의

완료 기준:

- `python -m musu_indexer.cli sync/search/log`가 MCP dependency 없이 기동한다.
- workspace root가 `cwd`에만 묶이지 않는다.
- reference repo가 accidental root bleed로 인덱싱되지 않는다.

상세 플랜:

- `plans/01_cli_runtime_decoupling_and_workspace_profiles.md`

## Phase 02. Sync Engine Stabilization

목적:

- full sync / partial ingest / delete cleanup 경로를 큰 workspace에서도 예측 가능하게 만든다.

예상 작업:

- scan/index 단계 계측
- stuck/full-sync evidence 수집
- delete reconciliation 정리
- profile-aware sync path 추가

완료 기준:

- 큰 workspace sync의 병목과 정상 상태를 구분할 수 있다.
- reference cleanup 후 stale row 정리 절차가 수동 SQL이 아니라 표준 command로 가능하다.

## Phase 03. Query And Retrieval Quality

목적:

- FTS query expansion과 category/tagging 품질을 올린다.

예상 작업:

- query expander 개선
- category/tag rule 정리
- search output format 표준화
- reference/spec/report weighting 검토

완료 기준:

- 검색 결과가 workspace noise에 덜 흔들린다.
- spec/report/reference 구분이 더 일관된다.

## Phase 04. Session / ACP Productization

목적:

- PTY/spy/session 기능을 실험 코드에서 운영 가능한 surface로 끌어올린다.

예상 작업:

- session lifecycle contract
- stale session cleanup 기준
- raw snapshot logging policy
- ACP tool naming / payload 표준화

완료 기준:

- session 기능이 CLI와 MCP에서 같은 계약으로 보인다.
- spy / pty logging이 DB bloat를 통제한다.

## Phase 05. MCP Tool Surface And Packaging

목적:

- MCP tool surface와 package entrypoint를 명확히 정리한다.

예상 작업:

- MCP tool taxonomy 정리
- package dependency split 검토
- optional dependency 전략
- README / install flow 수정

완료 기준:

- local CLI와 MCP server의 설치/실행 경로가 덜 얽힌다.
- README가 실제 실행 구조를 반영한다.

## Phase 06. Validation And Release Readiness

목적:

- 테스트, smoke, runbook, release 기준을 고정한다.

예상 작업:

- minimal test baseline
- sync smoke script
- workspace profile example
- release checklist

완료 기준:

- 현재 변경분을 반복 검증할 수 있다.
- 다음 세션이 문서만 보고 이어갈 수 있다.

## Phase 07. Session Runtime Persistence

목적:

- 현재 in-memory session registry 한계를 줄이고, 새 CLI invocation에서도 최소한 session history와 종료 상태를 복원 가능하게 만든다.

예상 작업:

- session metadata persistence
- completed session history/read surface
- restart-safe cleanup contract

완료 기준:

- 새 프로세스에서도 최근 session 상태와 종료 이유를 볼 수 있다.
- active session과 historical session이 혼동되지 않는다.

## Phase 08. Packaged Install And Engine Failure Propagation

목적:

- source tree 밖의 packaged install 경로를 검증하고, Go engine 실패가 CLI/MCP 출력에 명확히 드러나게 만든다.

예상 작업:

- wheel/sdist install smoke
- optional extras install smoke
- scanner/indexer non-zero exit surface 정리

완료 기준:

- packaged install에서 `musu-indexer sync/search/mcp` 경로가 문서대로 동작한다.
- engine 실패가 success 문구로 잘못 노출되지 않는다.

## Phase 09. Host Packaged Validation And Release Evidence

목적:

- source tree 밖, host-controlled Python 환경에서 실제 install/entrypoint/extras 경로를 검증하고 release evidence를 남긴다.

예상 작업:

- `python3-venv/ensurepip` 또는 동등 환경 준비
- `scripts/run-packaged-install-smoke.sh --report ...` 실행
- 필요 시 `--online-extras`로 `.[mcp]`, `.[watch]`, `.[full]`까지 검증
- release checklist와 handoff에 evidence 경로/결과 반영

완료 기준:

- blocked가 아닌 host에서 packaged install smoke report가 생성된다.
- release checklist에 latest report path와 결과가 기록된다.
- known limitation이 "환경 미준비"인지 "패키지 결함"인지 구분된다.

상세 플랜:

- `plans/09_host_packaged_validation_and_release_evidence.md`

## Phase 10. Packaged Bootstrap Fallback And Host Guidance

목적:

- Ubuntu/Debian 계열의 `ensurepip`/`python3-venv` 제약 때문에 packaged smoke가 너무 쉽게 막히는 문제를 줄인다.

예상 작업:

- 공식 문서 기반 blocker research 정리
- `scripts/run-packaged-install-smoke.sh`에 `uv venv --seed` fallback 추가
- smoke report에 backend와 blocker reason 기록
- README / handoff / release checklist에 host guidance 추가

완료 기준:

- `python3 -m venv`가 막혀도 `uv`가 있으면 packaged smoke를 계속 진행할 수 있다.
- `blocked`일 때도 어떤 bootstrap backend를 시도했는지 report에 남는다.
- repo 문서가 Ubuntu/Debian 계열 host requirement를 정확히 설명한다.

상세 플랜:

- `plans/10_packaged_bootstrap_fallback_and_host_guidance.md`

## Phase 11. Host Validation Automation And Bundle

목적:

- host-dependent validation 단계를 사람 손으로 반복하지 않게 하고, evidence 파일을 일관된 형식으로 남긴다.

예상 작업:

- host prerequisite probe script
- smoke + packaged smoke aggregate bundle script
- release closeout 문서와 연결

완료 기준:

- 한 번의 명령으로 host readiness와 packaged smoke 결과를 기록할 수 있다.
- Phase 09는 “적절한 host에서 bundle를 다시 실행”만 남는다.

상세 플랜:

- `plans/11_host_validation_automation_and_bundle.md`

## 바로 다음 액션

1. host에서 `python3 -m venv`가 되는지 확인한다.
2. `bash scripts/run-packaged-install-smoke.sh --report <path>`로 base packaged smoke evidence를 남긴다.
3. 네트워크 가능한 host에서는 `--online-extras`까지 실행해 extras evidence를 남긴다.
4. 결과를 `RELEASE_CHECKLIST.md`, `HANDOFF.md`, `TODO.md`에 반영하고 Phase 09를 닫는다.
