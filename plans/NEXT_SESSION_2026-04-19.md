# NEXT SESSION — 2026-04-19 (CSO 감사 + Gemini 보안 모듈 이후)

> **현재 스코어**: 99/100 (F2 Supabase PAT 폐기 완료 시 확정)
> **최신 커밋**: 이번 세션 (redact_secrets 연결, SPEC-161/162)

---

## 이번 세션 완료된 것

| 작업 | 커밋/상태 |
|------|----------|
| CSO 전체 감사 (14-phase, /cso 스킬) | `7e604131` |
| F1: next@15.5.15 CVE 패치 | `7e604131` |
| F2: Supabase PAT 플레이스홀더 교체 | `7e604131` |
| **redact_secrets → 로깅 연결** | 이번 세션 |
| LLM wiki 70 (CSO 감사), 71/72 (Gemini 리포트 확인), 73 (보안 모듈) | ✅ |
| SPEC-160 (CSO), SPEC-161 (Gemini 모듈), SPEC-162 (redact 연결) | ✅ |
| 워크스페이스 인덱싱 (4,938 파일 변경) | ✅ |

---

## P0 — Supabase PAT 폐기 확인 (토큰 폐기 후)

```bash
curl -s -w "\nHTTP:%{http_code}" \
  -H "Authorization: Bearer sbp_17e09dee519f531792828842177d4cd43ca92507" \
  https://api.supabase.com/v1/profile
# 기대: HTTP:401 (폐기 완료 확인)
```

---

## P1 — FastAPI on_event → lifespan 마이그레이션

**파일**: `musu-bridge/server.py`, `musu-worker/src/musu_worker/main.py`
**증상**: pytest DeprecationWarning 4개 (`@app.on_event("startup")` deprecated in FastAPI 0.93+)

```python
# Before
@app.on_event("startup")
async def startup():
    ...

# After
from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(app: FastAPI):
    ...  # startup logic
    yield
    ...  # shutdown logic

app = FastAPI(lifespan=lifespan)
```

---

## P2 — WoL E2E 검증 (원격 머신)

```bash
# 1. 원격 머신 (100.121.211.106) iptables 확인
ssh 100.121.211.106 "sudo iptables -L INPUT -n | grep 8070"

# 2. bridge 토큰 설정 확인
curl -s http://100.121.211.106:8070/health

# 3. musu.pro에서 Wake 버튼 → {"ok":true} 기대
```

---

## P3 — musu-connects P2P (60% → 80%)

Gemini RC 리포트 기준 60%. 다음 세션에서 진행:
- `musu-connects` 자동화 레이어 완성
- Tailscale P2P 전송 레이어 안정화

---

## P4 — install.sh 범용 환경 (65% → 90%)

Gemini RC 리포트 기준 65%. Mac + Docker 지원:
```bash
# 현재: Ubuntu/WSL2만 검증됨
# 목표: macOS + Docker 환경 대응
```

---

## 코드 오딧 잔여 항목 (INFO)

| 항목 | 비고 |
|------|------|
| `SlidingWindowLimiter` 멀티워커 미공유 | 현재 단일 프로세스 → 문제 없음 |
| `AuthMiddleware` localhost bypass | 의도적 사이드카 모드 |
| 브릿지 API 감사 로그 없음 | STRIDE Repudiation — 후순위 |
| `redact_secrets` sbp_* 패턴 미등록 | Bearer 패턴으로 커버됨 → 낮은 우선순위 |

---

## 파일 위치 SSOT

| 항목 | 경로 |
|------|------|
| redaction.py | `musu-core/src/musu_core/redaction.py` |
| rate_limit.py | `musu-core/src/musu_core/rate_limit.py` |
| middleware.py | `musu-core/src/musu_core/middleware.py` |
| auth.py (worker) | `musu-worker/src/musu_worker/auth.py` |
| CSO 감사 보고서 | `plans/CSO_AUDIT_2026-04-18.md` |
| LLM Wiki | `/home/hugh51/llm-wiki/wiki/` (70~73) |
| Specs | `~/.claude/projects/-home-hugh51/memory/musu-specs.md` (SPEC-160~162) |
