# NEXT SESSION — 2026-04-17 (Phase P0~P3 완료 이후)

## 완료된 것 (2026-04-17 세션)

| 작업 | 상태 |
|------|------|
| Phase 4~7: FingerprintVerifier, Device Auth, machine_group, 랜딩 재설계 | ✅ |
| P0: IP Rate Limiting (device_codes + route.ts) | ✅ |
| P1: install.sh one-liner | ✅ |
| P2: Wake-on-LAN (wol.py, server.py, registry.py, start-bridge.sh, vibecode-town full stack) | ✅ |
| P3: Pricing 페이지 Pro tier 업데이트 | ✅ |
| 코드 인덱싱, LLM wiki 66 작성, SPEC-140~142 | ✅ |

**정성적 평가**: 94/100 (Medium 1개 신규 발견)

---

## 세션 시작 즉시 할 것

### 1. Supabase 마이그레이션 수동 실행 (최우선)

```sql
-- Migration 012: Rate limiting IP tracking
-- Supabase Dashboard → SQL Editor
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS created_from_ip TEXT;
CREATE INDEX IF NOT EXISTS device_codes_ip_created_idx
  ON device_codes (created_from_ip, created_at)
  WHERE created_from_ip IS NOT NULL;

-- Migration 013: Wake-on-LAN columns
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS mac_address TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS broadcast_ip TEXT;
```

### 2. E2E 검증

```bash
# Rate limit (migration 012 적용 후)
for i in {1..11}; do
  curl -sf -X POST https://musu.pro/api/v1/auth/device \
    -H "Content-Type: application/json" -d '{}' | jq .status 2>/dev/null || echo "no json"
done
# → 11번째에서 {"error":"Too many requests"} + 429 확인

# Device Auth + WoL
bash scripts/start-bridge.sh
# → URL 출력 → 승인 → ~/.musu/musu_token 생성 확인
# → musu.pro/account → offline 노드에 "Wake" 버튼 표시 확인

# install.sh
bash <(curl -fsSL https://musu.pro/install.sh)
# → musu-bridge 설치 + 시작
```

---

## P0 — SSRF 패치 (Medium 신규 발견)

**파일**: `src/app/api/v1/nodes/[id]/wol/route.ts`

**문제**: `proxy.public_url + '/api/wol'` fetch 시 URL 검증 없음.
인증된 사용자가 `public_url = "http://169.254.169.254/"` 등 내부 주소 등록 가능 → Vercel 서버리스에서 SSRF.

**패치**:
```typescript
// fetch 전에 추가:
const proxyHost = new URL(proxy.public_url).hostname;
const blocked = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fd)/i;
if (blocked.test(proxyHost)) {
  return NextResponse.json({ error: "Invalid proxy URL" }, { status: 422 });
}
```

**우선순위**: Medium (인증 후에만 트리거, Vercel 환경 제한)

---

## 남은 Low 항목

| 항목 | 파일 | 설명 |
|------|------|------|
| polling 2-curl | `scripts/start-bridge.sh` | curl 2회 → 1회 (`-w "%{http_code}"` + body 동시 파싱) |
| approveDeviceCode TOCTOU | `device_codes.repo.ts` | select→insert→update 3쿼리 → Supabase transaction |
| detect_public_ip TTL | `musu-bridge/discovery.py` | 1h TTL `(ip, timestamp)` 캐시 |
| MAC 감지 edge case | `scripts/start-bridge.sh` | `ip link` 파싱 실패 시 silent 처리 → 로그 추가 |

---

## 파일 위치 SSOT

| 항목 | 경로 |
|------|------|
| LLM Wiki | `/home/hugh51/llm-wiki/wiki/66_MUSU_MESH_PHASE8_P0_P3.md` |
| Specs | `~/.claude/projects/-home-hugh51/memory/musu-specs.md` (SPEC-140~142) |
| Rate limiting repo | `vibecode-town/src/lib/db/repositories/device_codes.repo.ts` |
| Rate limiting route | `vibecode-town/src/app/api/v1/auth/device/route.ts` |
| WoL API | `vibecode-town/src/app/api/v1/nodes/[id]/wol/route.ts` |
| WakeButton | `vibecode-town/src/components/WakeButton.tsx` |
| wol.py | `musu-functions/musu-bridge/wol.py` |
| install.sh | `musu-functions/scripts/install.sh` = `vibecode-town/public/install.sh` |
| Migration 012 | `vibecode-town/docs/migrations/012_device_codes_ip.sql` |
| Migration 013 | `vibecode-town/docs/migrations/013_wol.sql` |
| vibecode-town 커밋 | `2c78f35` |
| musu-functions 커밋 | `b1cab0c9` |
