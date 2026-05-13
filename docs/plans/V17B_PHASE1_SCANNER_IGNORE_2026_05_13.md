# Phase 1 — Indexer ignore_globs leak fix (2026-05-13)

> Master plan §Phase 1. 원래 "Go scanner 가 ignore_globs 무시" 로 분류했지만,
> 코드 깊게 본 결과 **진짜 버그는 Python `workspace.py`** 쪽이고 Go scanner 는
> 부차적 (그 명령 자체가 dead path 거나 walk 시간만 영향).

## 진단

### 증상

`musu-bee` 워크스페이스의 `.musu_dev.db` 가 61MB, `files` 테이블에 **14030 행**.
그 중 **13109 (93.4%) 가 `musu-bee/node_modules/...` 경로**.

### 원인 — fnmatch 의 `**` 가 path-segment 인식 못 함

`workspace.py` 의 `DEFAULT_IGNORE_GLOBS`:

```python
DEFAULT_IGNORE_GLOBS = (
    ".git/**",
    "node_modules/**",
    "target/**",
    ...
)
```

이걸 `_includes_path` 가 이렇게 적용:

```python
for pattern in self.effective_ignore_globs:
    if fnmatch(normalized, pattern) or path_obj.match(pattern):
        return False
```

문제: `fnmatch("musu-bee/node_modules/x.js", "node_modules/**")` → **False**.
fnmatch 의 `*` 와 `**` 는 path separator 를 안 보고 그냥 character matcher.
`musu-bee/node_modules/x.js` 는 `node_modules` 로 시작하지 않으므로 mismatch.

`PurePosixPath.match("node_modules/**")` 도 — pathlib 의 match 는 right-anchored
glob 인데 `**` 가 directory-recursive 의미를 안 가짐. False.

검증된 동작 (방금 측정):

```
path: musu-bee/node_modules/.bin/acorn.ps1
  fnmatch('node_modules/**')   = False
  PurePosixPath.match('...')   = False
  fnmatch('**/node_modules/**') = True   ← only this works
```

즉 ignore_globs 의 `node_modules/**` 는 **root-level** `node_modules/x.js` 만 거름.
`musu-bee/node_modules/x.js` 처럼 nested 는 통과.

### Go scanner 도 영향?

`indexer_src/main.go` 의 두 walk site (`doScan` line 95, `doScanDirs` line 230)
는 directory name 만 보고 거름 (`ignore[d.Name()]`). 즉 root 든 nested 든
`node_modules` directory 만나면 skip. **Go scanner 자체는 leak 없음**.

다만 Python 의 `_scan_workspace_files` 가 dirty list 만들 때 `rglob("*")` 로
walk → 그 단계에서 `node_modules` 안에 들어가는 게 시간 낭비 (수만 파일 stat).
그 결과 dirty list 에 nested node_modules paths 가 들어가고 → 이게 `includes_path`
거름 단계 통과 (위의 패턴 버그 때문에) → Go scanner 의 `index` 명령은
list 받아서 처리만 → 결과 DB 에 13109 행.

즉:
- **데이터 누설 원인** = Python ignore_globs 패턴 + fnmatch 동작 (이게 진짜 fix 대상)
- **walk 시간 낭비** = Python rglob 의 directory pruning 없음 (부차적, 별 fix)
- **Go scanner `scan`/`dirs` 모드 hardcoded ignore** = 외부 사용자 영향만, 일상 sync 무관

## Fix 설계

### 1. `DEFAULT_IGNORE_GLOBS` 보강 — directory-recursive 패턴 추가

```python
DEFAULT_IGNORE_GLOBS = (
    # Root-level
    ".git/**",
    "node_modules/**",
    "target/**",
    "dist/**",
    "build/**",
    "work/**",
    "__pycache__/**",
    ".venv/**",
    # Nested (new — fnmatch 가 path-aware 가 아니라 명시 필요)
    "**/.git/**",
    "**/node_modules/**",
    "**/target/**",
    "**/dist/**",
    "**/build/**",
    "**/__pycache__/**",
    "**/.venv/**",
    "**/.next/**",
    # File patterns (이미 잘 작동, fnmatch 가 basename 기반이라)
    ".musu_dev.db",
    ".musu_dev.db-*",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.zip",
    "*.7z",
)
```

이렇게 하면 user-supplied `ignore_globs` 도 이중 표기 권장 (`"foo/**"` + `"**/foo/**"`).
v17.C 후보로 자동 변환 함수 (`_expand_recursive_glob`) 고려할 수 있지만 이번 사이클은
명시 패턴으로 fix.

### 2. `includes_path` 의 match 로직 — segment-aware check 추가

fnmatch + Path.match() 만으로는 부족. directory-name 만 보고 prune 하는 path-segment 검사 추가:

```python
def includes_path(self, rel_path: str) -> bool:
    normalized = _posix_rel_path(rel_path)
    if not normalized:
        return False

    if self.include_roots and not any(
        _matches_root_prefix(normalized, entry) for entry in self.include_roots
    ):
        return False

    if any(_matches_root_prefix(normalized, entry) for entry in self.exclude_roots):
        return False

    # NEW: segment-name based fast prune.
    # ignore_globs 에 "foo/**" 형태로 적힌 directory name 을 추출해서
    # path 의 어떤 segment 에라도 match 되면 거름. fnmatch 의 **/foo/**
    # 보강과 중복이지만 robustness 와 속도 둘 다 챙김.
    segments = normalized.split("/")
    for pattern in self.effective_ignore_globs:
        if pattern.endswith("/**"):
            dirname = pattern[:-3].lstrip("*/").rstrip("/")
            if "/" not in dirname and dirname in segments:
                return False

    path_obj = PurePosixPath(normalized)
    for pattern in self.effective_ignore_globs:
        if fnmatch(normalized, pattern) or path_obj.match(pattern):
            return False
    return True
```

이로써 `"node_modules/**"` 패턴이 root + nested 모두에서 작동.

### 3. `_scan_workspace_files` 의 walk 도 prune (optional, perf)

`project_root.rglob("*")` 는 prune 못 함. `os.walk` 로 바꾸고 `dirs[:] = [...]` 로
ignore directory 들 제외 → walk 시간 단축. 다만 fix #1 + #2 만 있어도 결과는 정확함
(시간만 좀 더 들 뿐). v17.C 후보로 분리.

### 4. Go scanner 는 이번 사이클 손대지 않음

- `index` 명령은 list 받아 처리만 — 영향 0
- `scan`/`dirs` 명령은 외부 사용자가 직접 호출 시만 동작 — 일상 영향 0
- v17.C 후보: scanner 에 `-ignore` flag 추가 + Python wrapper 의 dead 명령 호출 정리

따라서 master plan 의 Phase 1 시간 추정 60분 → 실제로는 30-40분 (Go 빌드 불필요).

## 실행 단계

1. `workspace.py` 의 `DEFAULT_IGNORE_GLOBS` 에 `**/<name>/**` 패턴 추가 (8개).
2. `workspace.py` 의 `includes_path` 에 segment-aware fast prune 추가.
3. 새 pytest `musu-indexer/tests/test_workspace_ignore.py`:
   - `node_modules/x.js` → excluded (regression)
   - `musu-bee/node_modules/x.js` → excluded (new — 이게 버그 케이스)
   - `musu-bridge/__pycache__/foo.pyc` → excluded
   - `musu-bee/src/app.tsx` → included (positive case)
   - `*.tar.gz` 같은 file glob 도 여전히 작동 (regression)
4. 기존 musu-indexer pytest 가 깨지지 않는지 확인.
5. DB 재인덱스: `.musu_dev.db` 삭제 → `musu-indexer sync` → `SELECT COUNT(*) FROM files WHERE path LIKE '%node_modules%'` 이 0 인지 확인.
6. commit `fix(indexer): prune nested node_modules and similar dirs (v17.B Phase 1)`.

## 위험

- **DEFAULT_IGNORE_GLOBS 가 너무 강해져서 정상 파일이 빠지는지?** — `**/build/**` 가 `musu-bee/build` 같은 정상 build artifact 디렉터리도 거름. 의도된 것 (build artifacts 인덱싱 무의미). 사용자가 정말 인덱싱하고 싶으면 workspace profile 에서 명시적 include 가능.
- **DB 재인덱스 시간** — `.musu_dev.db` 가 61MB. 재인덱스에 1-3분 예상. 검증 단계에서만 한 번.
- **Path.match() 의 match semantics 차이** — pathlib match 는 right-anchored. `"node_modules/**"` 가 `match()` 에서 동작 안 함. 새 코드 의 fnmatch path 가 주요 분기여야.

## 검증 기준

- 새 pytest 5 cases pass.
- 기존 `musu-indexer/tests/*` 통과.
- 재인덱스 후 DB `files` 테이블의 node_modules 행 = 0.
- DB 사이즈 < 10MB (이전 61MB 에서).
- typecheck / 다른 import 깨지지 않음.

## Status

- [ ] DEFAULT_IGNORE_GLOBS 패턴 보강
- [ ] includes_path 에 segment-aware fast prune 추가
- [ ] 새 pytest test_workspace_ignore.py
- [ ] 기존 pytest regression check
- [ ] DB 재인덱스 + 결과 검증
- [ ] commit
