# Phase 02. Sync Engine Stabilization

## 목표

full sync와 partial cleanup을 큰 workspace에서도 예측 가능하게 만든다.

이번 단계의 첫 구현 목표는 예전에 수동 SQL로 처리했던 stale row 정리를 표준 command로 끌어올리는 것이다.

## 현재 문제

- profile을 바꾸거나 reference repo를 옮긴 뒤에도 DB에 stale row가 남을 수 있다.
- 지금은 full sync에 기대거나 수동 SQLite 삭제로 복구해야 한다.
- operator가 "현재 DB가 실제 파일 시스템과 얼마나 어긋났는지"를 표준 surface에서 알 수 없다.

## 이번 단계 범위

- `cleanup` 또는 `reconcile` command 추가
- workspace/profile-aware stale row detection
- dry-run support
- README/TODO 반영

## 설계 방향

### Track 1. DB Reconciliation Command

- 입력:
  - `--root`
  - `--profile`
  - `--scope all|code|doc`
  - `--dry-run`
- 동작:
  - DB의 `files.path`를 순회
  - workspace/profile에서 제외된 경로 탐지
  - 실제 파일이 사라진 경로 탐지
  - 관련 `files/doc_sections/code_symbols/search_index` row를 같이 정리

### Track 2. Operator Evidence

- 결과에 최소한 아래 수치를 준다:
  - scanned_rows
  - missing_on_disk
  - out_of_workspace
  - deleted_rows

## 완료 기준

- stale row 정리에 수동 SQL이 필요 없다.
- dry-run으로 영향 범위를 먼저 볼 수 있다.
- README와 TODO가 새 command를 반영한다.

## Verification Notes

- `PYTHONPATH=src python3 -m musu_indexer.cli cleanup --help`
- `PYTHONPATH=src python3 -m musu_indexer.cli cleanup --dry-run --root /home/hugh51/musu-functions/musu-indexer`
- `PYTHONPATH=src python3 -m unittest discover -s tests -v`

현재 결과:

- `cleanup --dry-run` 정상 동작
- missing-on-disk / out-of-workspace / deleted_rows 수치가 분리되어 출력
- unit test로 stale row reconcile path 검증 완료
- `sync_runs` evidence와 `runs` CLI가 full/partial 흐름을 기록
- `scripts/run-smoke.sh`에 cleanup/runs 경로가 포함됨
