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
| musu-connects | Rust (Quinn QUIC) | 4433/9443 | P2P 메쉬 transport |
| musu-bee | Next.js 16 + React 19 | — | 데스크톱 UI (Tauri 2.0) |
| musu-control | MCP 서버 | — | Claude Code용 제어 인터페이스 |
| vibecode-town | Next.js 16 (Vercel) | — | musu.pro 웹 대시보드 |

**경계 규칙:**
- musu-bridge는 musu-core를 라이브러리로 사용. 역방향 의존 금지.
- vibecode-town은 Vercel Edge 런타임. 서버 전용 Node.js API 사용 불가.
- musu-connects(Rust) ↔ musu-bridge 통신: HTTP only (127.0.0.1:9443).

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
