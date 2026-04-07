# Phase 01. CLI Runtime Decoupling And Workspace Profiles

## 목표

`musu-indexer`의 가장 큰 현재 문제 두 개를 먼저 정리한다.

- local CLI가 MCP dependency에 묶여 있는 문제
- workspace root가 `cwd`에만 묶여 reference/work/archive까지 빨아들이는 문제

이번 phase는 기능 확장이 아니라 실행 출발선 복구다.

## 현재 상태

- status: done
- gate:
  - `python -m musu_indexer.cli sync --help`가 `mcp` import 때문에 죽는 상태를 먼저 끊는다.
  - workspace root를 explicit root/profile/git-root/cwd-fallback 순으로 해석하는 계약을 넣는다.

## 현재 문제 정리

### 1. CLI boot path가 너무 강하게 결합돼 있다

관찰:

- `cli.py`가 top-level에서 `server.py`를 import한다.
- `server.py`는 `mcp.server.fastmcp`를 top-level에서 import한다.
- 따라서 MCP를 안 쓸 local command도 `mcp` package가 없으면 같이 죽는다.

영향:

- `sync`
- `search`
- `log`
- `recent`

같은 가장 기본적인 local command도 설치 환경에 따라 unusable 해진다.

### 2. project root 정책이 없다

관찰:

- `find_project_root()`는 사실상 `cwd` 반환이다.
- `/home/hugh51/musu-functions` 같은 workspace에서 돌리면 `references/`, `work/`, archive 잔재까지 다 섞인다.

영향:

- accidental full workspace indexing
- search noise 증가
- stale reference row cleanup 필요
- operator가 repo root와 workspace root를 매번 기억해야 함

### 3. scope 규칙이 hard-coded다

관찰:

- `scope=code`는 `src/crates/release/lib/internal` prefix만 통과시킨다.

영향:

- repo layout이 조금만 달라도 code file이 빠질 수 있다.
- workspace profile 없는 상태와 결합되면 결과 예측이 어렵다.

## 이번 단계 범위

- CLI와 MCP runtime decoupling
- workspace profile 초안
- root resolution 정책 도입
- scope filtering 재정의
- README/plan 문서 반영

## 제외 범위

- watcher 개선
- ACP/session contract 개선
- query quality 개선
- Go scanner parser 확장

## 설계 방향

### Track 1. CLI / MCP 런타임 분리

작업:

- `cli.py`에서 `mcp` import를 lazy load로 변경
- `mcp` command 선택 시에만 `server`를 import
- `watch` command도 lazy load로 바꿔 optional runtime concern으로 분리
- local command가 optional dependency 없이 실행되는지 확인

완료 기준:

- `python -m musu_indexer.cli sync --help`
- `python -m musu_indexer.cli search --help`

가 `mcp` package 없이 떠야 한다.

### Track 2. Workspace Profile Contract

작업:

- profile file 형식 초안 정의
- 최소 필드:
  - `name`
  - `root`
  - `include_roots`
  - `exclude_roots`
  - `ignore_globs`
- default profile resolution 규칙 정의
- profile file 이름:
  - `.musu-indexer.json`
- fallback 순서:
  - explicit `--profile`
  - `MUSU_INDEXER_PROFILE`
  - parent chain에서 `.musu-indexer.json`
  - explicit `--root`
  - `MUSU_INDEXER_ROOT`
  - parent chain의 `.git`
  - `cwd`

완료 기준:

- operator가 repo/workspace 경계를 문서로 설명할 수 있다.
- `references/` 제외 같은 요구를 profile로 표현할 수 있다.

### Track 3. Root Resolution Policy

작업:

- `find_project_root()`를 대체할 정책 결정
- 후보:
  - explicit `--root`
  - profile file
  - `.git`/marker 탐색 fallback
- `cwd` fallback은 최후 경로로 낮춘다.

완료 기준:

- accidental workspace bleed가 줄어든다.
- root selection reason이 문서화된다.

### Track 4. Scope Semantics Rewrite

작업:

- `all/code/doc` 의미 재정의
- `code`를 hard-coded directory prefix 대신 extension/include-root 중심으로 바꿀지 결정
- `doc`도 `docs/` prefix 외 markdown/json 문서 처리 방식을 정리

결정:

- `doc`
  - `docs/`, `references/`
  - `README.md`, `CLAUDE.md`, `AGENTS.md`, `TODO.md`, `CHANGELOG.md`, `CONTRIBUTING.md`
  - `.md/.mdx/.rst/.txt/.adoc`
- `code`
  - 문서로 분류되지 않은 일반 코드/설정 확장자
  - `.rs/.ts/.tsx/.py/.go/.js/.jsx/.json/.toml/.yaml/.yml/.sql/.sh/.ps1` 등

완료 기준:

- scope 결과가 repo layout에 덜 의존한다.

## 구현 순서

1. lazy import로 CLI boot 복구
2. root/profile 계약 추가
3. scope semantics 정리
4. README / examples 갱신
5. help/compile/manual smoke로 phase 종료 검증

## 검증 기준

- local CLI help command가 dependency error 없이 뜬다.
- sample workspace profile로 `references/`를 제외한 sync path를 설명할 수 있다.
- phase 종료 시 master plan, README가 현재 runtime 계약을 반영한다.
- `search`가 dynamic exclude 입력 때문에 SQL string interpolation을 하지 않는다.

## 오픈 질문

1. profile file 이름을 repo-local로 둘지, user-global로 둘지
2. `.musu_dev.db`를 root별로 둘지 profile별로 둘지
3. MCP tool이 profile selection argument를 직접 받을지

## Phase 01 Deliverables

- `src/musu_indexer/workspace.py`
- `src/musu_indexer/cli.py`
- `src/musu_indexer/core.py`
- `src/musu_indexer/server.py`
- `examples/musu-functions.workspace.json`
- `README.md`
- `TODO.md`

## Verification Notes

- `PYTHONPATH=src python3 -m musu_indexer.cli sync --help`
- `PYTHONPATH=src python3 -m musu_indexer.cli search --help`
- `PYTHONPATH=src python3 -m musu_indexer.cli mcp`
- `PYTHONPATH=src python3 -m unittest discover -s tests -v`

결과:

- local CLI help는 `mcp` 미설치 환경에서도 정상 동작
- `mcp` subcommand는 명확한 안내 메시지로 종료
- workspace profile resolution / scope semantics 최소 테스트 통과
