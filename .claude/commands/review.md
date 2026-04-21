---
description: Code review — 4기준 QA 점수 + Sprint Contract 체크 + 보안 감사
argument-hint: Optional file path or "last" for last commit
allowed-tools: ["Bash", "Read", "Glob", "Grep"]
---

# /review — 코드 리뷰

$ARGUMENTS 가 없으면 마지막 커밋(HEAD)을 리뷰한다.
파일 경로가 있으면 해당 파일을 리뷰한다.

## 실행 순서

### 1. 범위 파악

```bash
# 마지막 커밋 diff
rtk git diff HEAD~1 HEAD

# 또는 특정 파일
rtk git diff HEAD -- <file>
```

Sprint Contract가 있으면 읽는다:
```bash
ls .musu/sprint_contract_*.json 2>/dev/null | tail -1
```

### 2. 4기준 채점

각 항목 1~10점으로 채점:

**functionality** (기능 동작)
- API/함수가 명세대로 동작하는가
- 입력/출력 타입이 올바른가
- 의도한 시나리오가 커버되는가

**correctness** (정확성)
- 엣지케이스: None/null, 빈 배열, 음수, 빈 문자열
- 에러핸들링: 예외가 적절히 잡히고 응답하는가
- 동시성: race condition 가능성 있는가
- 경계값: off-by-one, integer overflow

**completeness** (완전성)
- Sprint Contract acceptance_criteria 각 항목 체크
- 테스트가 있는가 (없으면 -2점)
- 문서화가 필요한 경우 있는가

**code_quality** (코드 품질)
- 함수 크기 (50줄 이상이면 분리 검토)
- 변수명 명확성
- 중복 코드
- 프로젝트 패턴 일관성 (CLAUDE.md 규칙 준수)

### 3. 보안 체크리스트

- [ ] 하드코딩된 토큰/API 키 없음
- [ ] SQL injection 위험 없음 (파라미터화 쿼리 사용)
- [ ] 사용자 입력 검증
- [ ] 시크릿이 로그에 노출되지 않음
- [ ] CORS, 인증 미들웨어 적용 (API 엔드포인트)
- [ ] migrations.py 직접 수정 없음 (신규 함수로만 추가)

### 4. 출력

```
## Code Review

### Scores
| 항목 | 점수 | 판정 |
|------|------|------|
| functionality  | X/10 | ✅/❌ |
| correctness    | X/10 | ✅/❌ |
| completeness   | X/10 | ✅/❌ |
| code_quality   | X/10 | ✅/❌ |

**전체**: PASS ✅ / FAIL ❌ (모든 항목 7점 이상 필요)

### 주요 발견사항

**P0 (즉시 수정)**
- ...

**P1 (이번 PR에 포함)**
- ...

**P2 (다음 이터레이션)**
- ...

### Sprint Contract 체크
- [x] criterion 1
- [ ] criterion 2 — ❌ 누락
...
```

7점 미만 항목이 있으면 구체적 수정 방법을 함께 제시한다.
