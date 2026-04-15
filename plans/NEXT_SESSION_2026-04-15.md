# 다음 세션 TODO — 2026-04-15 (Wave 5 이후)

> 작성: 2026-04-15 | Phase 17R 이후 Wave 5 변경사항 커밋 완료 기준
> 이전: NEXT_SESSION_2026-04-14.md (Phase 1+2 완료 기록 → 참조만)

---

## 세션 시작 체크리스트

```
[ ] musu-bee dev 서버 정상 기동 확인 (npm run dev)
[ ] curl localhost:8070/api/companies → [] 확인
[ ] musu-core pytest → 전체 pass 확인
[ ] musu-control MCP (24개 도구) 활성 확인
[ ] musu-bee tsc → 0 errors 확인 (Stripe 삭제 후 회귀 체크)
```

---

## P0 — 레포 클린업 (30분)

### 1. 빈 파일 / 이상 파일 삭제

```bash
cd /home/hugh51/musu-functions
rm -f "MUS-25" "MUS-56" "MUS-61" "blocked" "running\\" "such" "No" "or" "file" "directory"
rm -f temp_output.txt bee_stderr.log "새 텍스트 문서.txt"
```

### 2. .gitignore 업데이트

추가할 패턴:
```gitignore
# 임시 디버그 스크립트 (루트)
tmp_*.ts
fix_*.ts
check_*.ts
check_*.py
patch_*.py
update_*.ts
trigger_*.ts
repair_*.ts
rebind_*.ts
audit_linkage.ts
coherence_report.*
filter_issue*.py
ingest-wiki.mjs

# QA / 로그 아티팩트
.qa-g2-*.log
.qa-m*.log
qa-artifacts/
.qa-artifacts/
.mus*_latest_evid

# 세션 로그
scripts/opencode-session-archive.log
scripts/qwen-tagger.log
scripts/auto-index.log
bee_stderr.log
bee_stdout.log
bridge_stderr.log
bridge_stdout.log

# DB 락 파일
*.db-shm
*.db-wal
```

---

## P1 — 검증 작업 (1~2시간)

### 3. musu-bee tsc + next build

```bash
cd musu-functions/musu-bee
rtk tsc         # → 0 errors (Stripe 삭제 후 회귀 체크)
rtk next build  # → production build clean
```

### 4. musu-core pytest 재확인

```bash
cd musu-functions/musu-core
python -m pytest tests/ -v --tb=short
# → 231+ pass
```

### 5. musu-control 정책 테스트 확인

```bash
cd musu-functions/musu-control
python -m pytest tests/ -v -k "link_mismatch"
# → test_checkout_issue_blocks_run_issue_link_mismatch PASS
# → test_update_issue_blocks_run_issue_link_mismatch PASS
```

### 6. musu-port cargo test

```bash
cd musu-functions/musu-port
cargo test --workspace 2>&1 | tail -20
# → parity_verification 포함 전 pass
```

---

## P1 — i18n 완성 (1시간)

### 7. 잔여 한국어 문자열 스캔 + 영어화

```bash
grep -r --include="*.tsx" --include="*.ts" -l $'[\uAC00-\uD7A3]' musu-bee/src/
```

우선순위:
- `components/ChatArea.tsx`
- `app/landing/page.tsx`
- `lib/publicSiteContent.ts`
- `components/CompanyTemplateModal.tsx`

---

## P1 — OPERATOR_INGRESS_ACCEPTANCE.md 업데이트

```
파일: musu-functions/musu-port/OPERATOR_INGRESS_ACCEPTANCE.md
내용: WSL parity 테스트 결과 기록
  - standalone_runtime_matches_parity_baseline: PASS (2026-04-14)
  - 수정: state.rs L974-979 — promote 후 즉시 reconcile_routes 호출
  - 6/6 parity tests pass
```

---

## P2 — Phase 18 계획 수립

### 8. 다음 구현 후보 (우선순위 순)

| 순서 | 항목 | 설명 | 예상 |
|------|------|------|------|
| 1 | **A2 — Delegation Chain 시각화** | CEO→CTO→Engineer breadcrumb chip | ~2h |
| 2 | **B1 — 에이전트 Pulse 애니메이션** | sidebar dot amber pulse | ~1h |
| 3 | **B2 — 멀티머신 실 디바이스 카드** | Devices sidebar 2개 노드 표시 | ~2h |
| 4 | **B3 — Plan/Approve Gate** | 숫자 목록 → 승인/거부 카드 | ~3h |
| 5 | **musu-connects 인증서 분리** | HARNESS_CERT/KEY → tests/fixtures/ | ~1h |

### 9. musu-control MCP E2E 검증

musu-bridge + musu-control 실행 상태에서 Claude Code MCP 도구 직접 호출:
```
mcp__musu-control__list_agents → 에이전트 목록 확인
mcp__musu-control__get_dashboard → 대시보드 확인
mcp__musu-control__list_tasks → 태스크 목록 확인
```

---

## 참고: Wave 5에서 완료된 것

- ✅ Stripe → Paddle 완전 마이그레이션 (stripe.ts + webhooks/stripe/ 삭제)
- ✅ chatRateLimit 보안 강화 (IP 정규화, malformed 입력 차단)
- ✅ auth 영어화 + OAuthButtons
- ✅ OnboardingModal 영어화
- ✅ musu-connects tailscale-quic-server/client P2P latency proof
- ✅ musu-control run-issue link mismatch 정책 테스트
- ✅ musu-port queue_depth() + health 검증 강화
- ✅ musu-indexer sync (scanned 70221)
- ✅ CODE_AUDIT_2026-04-15.md 작성
- ✅ CURRENT_STATE.md Wave 5 업데이트
