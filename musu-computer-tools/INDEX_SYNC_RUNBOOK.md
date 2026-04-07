# Index Sync Runbook

## 목적

`musu-computer-tools`와 `musu-port`의 spec/doc/code index를 같은 입력 집합으로 반복 동기화한다.

## 입력 Manifest

생성:

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/generate-sync-manifest.sh
```

manifest에는 아래가 포함된다.

- code index 대상 root
- doc index 대상 root
- ignore pattern
- 핵심 spec 문서 path

## 현재 표준 Sync 순서

### 1. Code Index Sync

- `jcodemunch.index_folder`
  - `musu-computer-tools`
  - `musu-port`
- manifest의 `extra_ignore_patterns`를 그대로 적용한다.

### 2. Doc Index Sync

- `jdocmunch.index_local`
  - `musu-computer-tools`
  - `musu-port`
- manifest의 `extra_ignore_patterns`를 그대로 적용한다.

### 3. Verification

- `jcodemunch.list_repos`
- `jdocmunch.list_repos`
- 최신 repo id와 timestamp를 `INDEX_SYNC_STATUS.md`에 기록한다.

## 현재 주의점

- 인덱싱 자체는 MCP 도구로 수행한다.
- shell script는 sync input과 절차를 고정하는 역할이다.
- `.windows-bridge`, `target`, `target-run-*`, vendored `pydeps/root`는 noise로 간주하고 제외한다.
