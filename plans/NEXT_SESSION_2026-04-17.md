# NEXT SESSION — 2026-04-17 (Phase 7 완료 이후)

## 현재 상태

**완료된 것:**
- Phase 4: FingerprintVerifier, SSRF, DashMap lock fix ✅
- Phase 5: fingerprint export (bash), verify-fingerprint.sh, mDNS fast path ✅
- Phase 6: detect_public_ip(), public_url 호이스트, binary rebuild ✅
- Phase 7A: Device Auth RFC 8628 lite (자동 토큰 저장) ✅
- Phase 7B: machine_group WSL2 자동 그룹화 ✅
- musu.pro 랜딩 재설계 (Hero, 뱃지, How It Works, CTA 수정) ✅
- Account 노드 삭제 + fingerprint 복사 + 빈 상태 ✅

**정성적 평가**: 93/100 (Medium 1: rate limiting, Low 5)

---

## 세션 시작 즉시 할 것

### 1. Device Auth E2E 검증

```bash
# bridge 재시작 (MUSU_TOKEN 없이)
pkill -f "python.*server.py" 2>/dev/null || true
pkill -f "musu-connectsd" 2>/dev/null || true
unset MUSU_TOKEN
bash scripts/start-bridge.sh
# → 터미널에 URL 출력 확인
# → 브라우저에서 musu.pro/device?code=... 열기
# → "승인" 클릭
# → [start-bridge] ✅ 토큰 저장 완료 로그 확인
# → ~/.musu/musu_token 파일 존재 확인
```

### 2. Fingerprint E2E 검증

```bash
bash scripts/verify-fingerprint.sh
# → 4 checks 모두 pass ✅
```

### 3. musu.pro Account 확인

```
https://musu.pro/account
→ Connected Nodes 섹션에 노드 표시
→ 노드 삭제 버튼 동작 확인
→ cert_fingerprint 복사 버튼 동작 확인
```

---

## P0 — Rate Limiting (Medium 보안)

**파일**: `src/app/api/v1/auth/device/route.ts`
**구현**: 동일 IP 5분 10회 초과 시 429

```typescript
// 간단한 in-memory 방식 (edge function X, serverless는 공유 안 됨)
// 또는 Upstash Redis rate limiter (@upstash/ratelimit)
// 또는 Vercel firewall rule (no-code)

// 단기 해결: Vercel Dashboard → Firewall → Rate limit rule on /api/v1/auth/device POST
```

---

## P1 — install.sh 작성

**목표**: `bash <(curl -fsSL https://musu.pro/install.sh)` 실제 동작

**경로**: `musu-functions/scripts/install.sh` → vibecode-town `public/install.sh`로 복사

최소 내용:
```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_URL="${MUSU_REPO_URL:-https://github.com/yellowhama/musu-bee}"
INSTALL_DIR="${HOME}/.musu"
mkdir -p "$INSTALL_DIR"
# git clone 또는 GitHub Releases에서 바이너리 다운로드
# 이후 scripts/start-bridge.sh 실행
```

---

## P2 — Wake-on-LAN (이전 Phase 7 계획)

**목표**: 노트북에서 원격 데스크탑 깨우기

```
POST /api/wol/{node_name}
  → musu.pro에서 {mac_address, broadcast_ip} 조회
  → Magic Packet (UDP 9/7번 포트 broadcast)
```

**변경 파일**:
- `vibecode-town`: nodes 테이블 `mac_address TEXT`, `broadcast_ip TEXT` 컬럼 추가
- `musu-bridge/wol.py` 신규 — Magic Packet UDP 발송
- `musu-bridge/server.py` — `POST /api/wol/{node_name}` 엔드포인트
- `musu-bridge/registry.py` — heartbeat에 mac_address + broadcast_ip 포함

---

## P3 — Pricing 페이지 업데이트

**파일**: `src/app/pricing/page.tsx`

현재 Pro tier "Coming Soon" → 실제 기능 반영:
- Core: 1 machine, HTTP mesh
- Mesh: 무제한 기기, machine_group, team
- Pro: QUIC, cert fingerprint, WoL

---

## 코드 개선 Low 항목

1. **start-bridge.sh 폴링**: curl 2회 → 1회 (body에서 status code 추출)
2. **approveDeviceCode TOCTOU**: Supabase transaction으로 묶기 (low priority)
3. **detect_public_ip() TTL**: `(ip, timestamp)` 튜플로 1h TTL 추가

---

## 파일 위치 SSOT

| 항목 | 경로 |
|------|------|
| 마스터 플랜 | `docs/MUSU_MESH_MASTER_PLAN.md` |
| LLM Wiki | `/home/hugh51/llm-wiki/wiki/65_MUSU_MESH_PHASE7_DEVICE_AUTH_LANDING.md` |
| Specs | `~/.claude/projects/-home-hugh51/memory/musu-specs.md` (SPEC-135~139) |
| 검증 스크립트 | `scripts/verify-fingerprint.sh` |
| 시작 스크립트 | `scripts/start-bridge.sh` |
| 바이너리 | `bin/musu-connectsd` (2026-04-17 05:21, DashMap lock fix) |
| musu.pro 랜딩 | `vibecode-town/src/app/page.tsx` (커밋 `7eceff1`) |
| Account 페이지 | `vibecode-town/src/app/account/page.tsx` |
