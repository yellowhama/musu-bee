# Phase 08. Packaged Install And Engine Failure Propagation

## 목표

source tree 안에서는 통과해도 packaged install과 engine failure surface가 약하면 운영 품질이 떨어진다. 이 phase는 install smoke와 non-zero exit surfacing을 고정한다.

## 현재 문제

- `pip install .`, `.[mcp]`, `.[watch]`, `.[full]` 경로를 source tree 밖에서 검증한 기록이 없다.
- Go scanner/indexer가 실패해도 일부 경로는 success처럼 보일 여지가 있다.
- release checklist에 packaged install evidence가 아직 없다.

## 이번 단계 범위

- isolated install smoke
- extras install smoke
- sync/index error output 정리
- release checklist 확장

## 완료 기준

- packaged install 환경에서 CLI/MCP entrypoint가 문서대로 동작한다.
- engine non-zero exit는 CLI/MCP에서 명확한 error로 노출된다.
- release checklist에 packaged-install evidence가 포함된다.

## Current Result

- status: done
- `sync`는 Python workspace scan으로 전환되어 stale Go scan 결과 truncation에 덜 의존한다.
- Go index writer가 partial/no-op일 때 Python row materialization fallback이 DB correctness를 보장한다.
- `sync-map`도 Python workspace dir scan 기반으로 바뀌어 stale Go dir scan에 덜 의존한다.
- `scripts/run-packaged-install-smoke.sh`가 추가됐고, `--report`로 blocked/success evidence를 파일로 남긴다.
- `--online-extras`로 `.[mcp]`, `.[watch]`, `.[full]` 실제 install 시도도 분리 실행할 수 있다.
- `sudo apt-get install python3.12-venv python3-hatchling` 시도도 `Operation not permitted`로 막혀서, 이 세션에서는 host dependency 보강이 불가능하다.
- `sync`, `sync-map`, watcher, MCP `sync_workspace`는 공통 error 판정으로 명시적으로 실패를 노출한다.
- 실제 host prerequisite 충족 후 smoke/evidence closeout은 Phase 09로 분리했다.
