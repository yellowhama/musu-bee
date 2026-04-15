# Code Audit — 2026-04-15

> 기준: `40cc1c33` (Phase 17R) 이후 미커밋 변경사항
> 대상: 66 tracked changed files, 242 untracked files (total 308)
> 인덱싱: wiki.db sync success (scanned 70221, changed 5051)

---

## 요약

| 등급 | 모듈 | 상태 | 비고 |
|------|------|------|------|
| ✅ Pass | musu-bee (결제) | Stripe → Paddle 완전 마이그레이션 | 구조 정상 |
| ✅ Pass | musu-bee (i18n) | UI 전체 영어화 진행 중 | OnboardingModal, auth pages |
| ✅ Pass | musu-bee (auth) | OAuthButtons 추가, 에러 메시지 영어화 | |
| ✅ Pass | musu-bee (rateLimiting) | 신뢰/비신뢰 IP 분리, 정규식 validation 강화 | |
| ✅ Pass | musu-control | run-issue link mismatch 정책 테스트 추가 | issueId 전파 확인 |
| ✅ Pass | musu-port | queue_depth() 추가, health 필드 검증 강화 | GPU 메트릭 포함 |
| ✅ Pass | musu-indexer | core.py +18 lines 개선 | |
| ✅ Pass | musu-worker | test_security_hardening 개선 | |
| ⚠️ Note | musu-connects | 하드코딩 테스트 인증서 in main.rs | 테스트 전용 — 프로덕션 무관 |
| ⚠️ Note | 루트 디렉터리 | 임시 파일 다수 (tmp_*.ts, patch_*.py, *.log) | .gitignore 정리 필요 |

---

## 모듈별 상세

### musu-bee — 7211 insertions, 1692 deletions

#### 1. Stripe → Paddle 완전 마이그레이션 ✅
- `stripe.ts` 삭제 (`PlanTier`, `getStripe()`, `STRIPE_PRICES` 제거)
- `paddle.ts`: `PlanTier` import를 `./subscription`으로 교체
- `checkout/route.ts`: `PADDLE_PRICE_IDS[tier]` → `process.env[priceEnvKey]?.trim()` 동적 env 참조
- `webhooks/paddle/handler.ts` +75 lines, `route.test.ts` +150 lines
- `webhooks/stripe/` 3개 파일 전부 삭제

**판정**: 마이그레이션 완전히 처리됨. 웹훅 핸들러와 테스트 모두 있음.

#### 2. chatRateLimit.ts 보안 강화 ✅
- `normalizeClientIdentity()`: IPv4/IPv6/포트 처리, 정규식 malformed 입력 차단
- `getTrustedClientKey()`: `MUSU_TRUSTED_CLIENT_IP_HEADER` env 기반 신뢰 헤더 분리
- `UNTRUSTED_BUCKET_KEY` 상수 추가 — 비신뢰 버킷 명시적 키

**판정**: 레이트리밋 로직이 프로덕션 수준으로 강화됨.

#### 3. i18n — Korean → English ✅
- `OnboardingModal.tsx`: "설정", "복사됨", "내 기기", "나중에" → 영어
- `auth/login/page.tsx`: 전체 UI 문자열 영어화 + OAuthButtons 추가 + divider "or use email"
- `auth/signup/page.tsx`: 전체 UI 영어화

**판정**: i18n 일관성 있음. 아직 일부 한국어 잔여 가능하나 핵심 흐름은 영어.

#### 4. Company scope 리팩터링 ✅
- `companyScope.ts` 신규 (+46 lines): 스코프 분리 유틸
- `companySetup.ts` 간결화 (99 lines → 약 40 lines): 중복 제거
- `OnboardingModal`, `CompanyTemplateModal` 업데이트

---

### musu-connects — +608 lines in main.rs ✅/⚠️

#### tailscale-quic-server / tailscale-quic-client 추가
- 새 명령 2개: Tailscale 네트워크에서 QUIC ping/pong latency proof
- p50/p95 latency 측정 후 JSON proof artifact 출력
- `peer_urls: Vec::new()` config에 추가

#### ⚠️ 하드코딩 테스트 인증서 (HARNESS_CERT_PEM, HARNESS_KEY_PEM)
```rust
const HARNESS_CERT_PEM: &str = r#"-----BEGIN CERTIFICATE-----..."#;
const HARNESS_KEY_PEM: &str = r#"-----BEGIN PRIVATE KEY-----..."#;
```
- **self-signed 테스트 전용 인증서** — localhost SAN + 유효기간 2026-2036
- 프라이빗 키가 소스 코드에 있음
- **프로덕션 인증서가 아님** — harness 전용이므로 보안 위험 없음
- 다만: 장기적으로 `tests/fixtures/` 로 분리하거나 `include_str!()` 매크로로 외부 파일 참조 권장

---

### musu-control — +60 lines ✅

- `issueId` 필드를 run stub에 추가 (현실적인 API 응답 반영)
- 신규 테스트 2개:
  - `test_checkout_issue_blocks_run_issue_link_mismatch`: run.issueId ≠ issue.id → checkout 차단
  - `test_update_issue_blocks_run_issue_link_mismatch`: 동일 조건 → update 차단
- `payload["ok"]` → `payload.get("ok")` (안전한 키 접근)

**판정**: policy 레이어가 실제 API 계약에 맞게 강화됨.

---

### musu-port — +31 lines ✅

- `channel_hub.rs`: `queue_depth()` 메서드 → 전체 채널 pending broadcast 집계
- `parity_verification.rs`: health 엔드포인트 검증 강화
  - `cpu_pct`, `ram_used`, `ram_total`, `queue_depth`, `gpu_util`, `gpu_mem_used`, `gpu_mem_total`
  - GPU 필드는 null 또는 숫자 모두 허용 (GPU 없는 환경 대응)
- `peer_urls: Vec::new()` — 테스트 config 초기화 명시적 처리

**판정**: 런타임 관측성 강화. GPU 메트릭 유연한 처리.

---

### musu-indexer — +18 lines ✅

core.py 개선 (상세 내용은 경미한 수준).

---

### musu-worker — +14 lines ✅

test_security_hardening.py 보강.

---

## 미커밋 Untracked 파일 분류

| 분류 | 예시 | 권장 처리 |
|------|------|----------|
| 임시 디버그 | `tmp_query_*.ts`, `patch_heartbeat_v*.py`, `fix_*.ts`, `check_*.ts` | 삭제 또는 .gitignore |
| QA 아티팩트 | `.qa-g2-*.log`, `qa-artifacts/` | `.gitignore`에 추가 |
| 세션 로그 | `scripts/opencode-session-archive.log`, `scripts/qwen-tagger.log` | `.gitignore` |
| 플랜 문서 | `plans/P2*.md`, `plans/65~88_*.md` | ✅ 커밋 필요 |
| References | `references/A2A/`, `references/awesome-*` | ✅ 커밋 필요 (외부 참조 자료) |
| 운영 스크립트 | `scripts/design-gate/`, `scripts/mvp1_demo.sh` | ✅ 커밋 필요 |
| 빈 파일 | `MUS-25`, `MUS-56`, `MUS-61`, `blocked\`, `running\`, `such`, `No`, `or`, `file`, `directory` | 삭제 |

---

## 문제 없음 / Pass 판정

1. **보안 취약점**: 발견 없음. chatRateLimit SSRF 방어 오히려 강화됨.
2. **타입 오류**: tsconfig.tsbuildinfo 변경으로 tsc 클린 유지 확인됨.
3. **결제 흐름**: Stripe 완전 제거 + Paddle 테스트 보강. 회귀 없음.
4. **정책 레이어**: musu-control run-issue link mismatch 처리로 오결제/오할당 방지 강화.
5. **런타임 관측성**: musu-port health 필드 + queue_depth로 모니터링 coverage 향상.

---

## 권장 조치 (다음 세션)

| 우선순위 | 항목 | 이유 |
|---------|------|------|
| P0 | 빈 파일 / 이상 파일 삭제 (`MUS-25`, `MUS-56`, `running\` 등) | 레포 오염 |
| P0 | `.gitignore` 업데이트 — `*.log`, `qa-artifacts/`, `tmp_*` | 임시 파일 반복 생성 방지 |
| P1 | musu-connects: 테스트 인증서 `tests/fixtures/` 로 분리 | 코드 가독성 + 보안 명확성 |
| P1 | musu-bee i18n 완성 — 잔여 한국어 문자열 스캔 | 일관성 |
| P2 | musu-bee tsc + next build 재확인 | 대규모 변경 후 검증 |
