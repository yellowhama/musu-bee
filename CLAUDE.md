# musu-functions — 프로젝트 헌법

> CLAUDE.md는 모든 AI 에이전트 세션의 최우선 규칙이다.
> 아래 규칙은 다른 어떤 지시보다 우선한다.

---

## CRITICAL — 절대 금지 (먼저 읽을 것)

```
❌ DB 스키마 수정 — musu-core/src/musu_core/migrations.py
   명시적 허락 없이 절대 건드리지 말 것. 테이블 추가도 마찬가지.

❌ git push --force / git reset --hard / rm -rf
   데이터 파괴 위험. 절대 실행 금지.

❌ 메인 브랜치 직접 커밋
   항상 새 브랜치 생성 후 PR.

❌ MUSU_BRIDGE_TOKEN / API 키 하드코딩
   환경변수만 사용. .env.example 패턴 따를 것.

❌ musu.pro URL 하드코딩
   MUSU_PRO_URL 환경변수 사용.
```

---

## 아키텍처 경계

| 모듈 | 언어/런타임 | 포트 | 역할 |
|------|----------|------|------|
| musu-bridge | Python 3.12 + FastAPI | 8070 | API 서버, 에이전트 조율 |
| musu-core | Python 라이브러리 | — | 에이전트/태스크/DB 추상화 |
| musu-relay | Node.js (Express+WS) | 9900 | WebSocket relay (기기 간 통신) |
| musu-bee | Next.js 16 + React 19 | — | 웹 UI (SaaS + 로컬 호스팅) |
| musu-control | MCP 서버 | — | Claude Code용 제어 인터페이스 |
| vibecode-town | Next.js 16 (Vercel) | — | musu.pro 웹 대시보드 |

**경계 규칙:**
- musu-bridge는 musu-core를 라이브러리로 사용. 역방향 의존 금지.
- vibecode-town은 Vercel Edge 런타임. 서버 전용 Node.js API 사용 불가.
- musu-relay ↔ musu-bridge 통신: WebSocket tunnel (MUSU_TOKEN 인증).

---

## 명령어 규칙

```bash
# ✅ 모든 CLI 명령어에 rtk 접두사 필수
rtk git status
rtk git diff
rtk cargo build
rtk cargo test
rtk next build
rtk tsc

# ❌ 접두사 없이 실행 금지 (토큰 낭비)
git status
cargo build
```

---

## API 패턴

```python
# musu-bridge API 호출 패턴
headers = {"Authorization": f"Bearer {os.getenv('MUSU_BRIDGE_TOKEN', '')}"}
resp = await client.post(f"{BRIDGE_URL}/api/...", headers=headers)

# vibecode-town에서 bridge 호출
# → /api/bridge/[...path]/route.ts catch-all 프록시 사용
# → 직접 bridge URL 하드코딩 금지
```

---

## 테스트 규칙 (TDD)

```
1. 테스트 먼저 작성
2. 실패 확인 (red)
3. 최소 구현
4. 통과 확인 (green)
5. 리팩터

Python: pytest musu-bridge/tests/ / musu-core 내 tests/
Rust:   cargo test (musu-connects/)
```

---

## 커밋 규칙

```bash
# 접두사 필수
feat:   새 기능
fix:    버그 수정
chore:  빌드/설정/의존성
docs:   문서
refactor: 동작 변경 없는 리팩터

# 항상 포함
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## 에이전트 시스템 규칙

```
CEO (codex_local)      — 전략, 태스크 위임
CTO (gemini_local)     — 아키텍처, Sprint Contract 작성
Engineer (gemini_local)— 구현, Sprint Contract 읽고 시작
QA Lead (gemini_local) — 4기준 점수 반환 (functionality/correctness/completeness/code_quality)
Chief of Staff         — 백로그, 이슈 분해

QA가 점수 7점 미만 기준 있으면 → Engineer 재작업 (최대 3회)
같은 에러 3회 반복 → CTO 에스컬레이션
```

---

## 파일 위치 SSOT

```
musu-functions/
  musu-bridge/server.py       — FastAPI 엔드포인트
  musu-bridge/handlers.py     — 비즈니스 로직
  musu-bridge/mesh_router.py  — P2P 메쉬 라우팅
  musu-core/src/musu_core/
    router.py                 — 에이전트 디스패치
    agents.py                 — 에이전트 CRUD
    tasks.py                  — 태스크 CRUD
    migrations.py             — DB 스키마 (수정 시 항상 신규 migration 추가)
    qa_loop.py                — QA 반복 루프 (Phase 35)
    sprint_contract.py        — Sprint Contract (Phase 35)
  scripts/
    start-bridge.sh           — 브리지 실행 (connectsd 포함)
    systemd/                  — systemd unit 파일
```

---

## 하네스 사용법

새 작업 시작 전:
```
/harness    → docs/ 읽고 페이즈별 계획 수립
/review     → 완료 후 코드 리뷰
```

<!-- BEGIN sqz-claude-guidance (auto-installed by sqz init; remove this block to disable) -->

## sqz — Context Compression (READ FIRST)

sqz is installed in this project. It compresses tool output so large
files, long logs, and verbose command output cost far fewer tokens.
There are **two ways** sqz is wired in, and you should prefer each
one in the situations below.

### Preferred tools (MCP)

The `sqz-mcp` server is registered in this project's MCP config. It
exposes three read-only tools that compress their output through the
sqz pipeline:

- **`sqz_read_file`** — read a file from disk and return a compressed
  view. **PREFER this over the built-in `Read` tool** for any file
  larger than ~2KB or any file you might read more than once in the
  same session. Repeat reads return a 13-token `§ref:HASH§` reference
  instead of the full content.

- **`sqz_grep`** — search files for a literal string or regex.
  **PREFER this over the built-in `Grep`** for anything that might
  match more than a handful of lines. Caps at 200 matches by default;
  raise with `max_matches` if needed.

- **`sqz_list_dir`** — list a directory. Skips `.git`, `node_modules`,
  `target`, `dist`, `build`, `vendor`, `__pycache__` so the output
  stays focused. **PREFER this over `ls -la` via Bash** when you want
  to see a project layout.

The built-in `Read`, `Grep`, `Glob` tools remain available. Use them for:
- Tiny config files (<1KB) where compression can't help.
- Byte-exact reads you'll hash or diff (lockfiles, signatures).
- Globbing (sqz has no glob tool; `Glob` is still the right choice).

### Bash commands (hooked automatically)

When you run a shell command through the `Bash` tool, a PreToolUse hook
rewrites it to pipe output through `sqz compress`. This is transparent:
you don't need to remember to add anything, but it's useful to know
that these commands get compressed automatically:

```bash
git status           # → git status 2>&1 | sqz compress --cmd git
cargo test           # → cargo test 2>&1 | sqz compress --cmd cargo
docker ps            # → docker ps 2>&1 | sqz compress --cmd docker
kubectl get pods     # → kubectl get pods 2>&1 | sqz compress --cmd kubectl
```

The rewrite is skipped for interactive commands (`vim`, `ssh`,
`python`), compound commands (`a && b`, `a > file.txt`), and anything
already going through sqz.

### Escape hatch — when you see a `§ref:HASH§` token

If tool output contains a `§ref:a1b2c3d4§` token and you need the full
content it points at, resolve it. Three equivalent ways:

- Shell: `/home/hugh51/.cargo/bin/sqz expand a1b2c3d4` (or paste the whole token
  `/home/hugh51/.cargo/bin/sqz expand §ref:a1b2c3d4§`).
- MCP tool: call `expand` with `{ "prefix": "a1b2c3d4" }`.
- To get uncompressed output for one command: prefix it with
  `SQZ_NO_DEDUP=1` (e.g. `SQZ_NO_DEDUP=1 git log | sqz compress`).

If the compressed output is actively making the task harder (looping
on refs, small retries replacing one big read), call the `passthrough`
MCP tool to get raw text.

### When NOT to use sqz tools

- Writing or editing files — use the built-in `Write`/`Edit` tools.
  sqz has no write tools (by design; see issue #5 follow-up).
- Running commands interactively or in watch mode.
- Reading very small files (<1KB) where compression can't help.

<!-- END sqz-claude-guidance -->
