#!/usr/bin/env bash
# verify-fingerprint.sh — QUIC fingerprint E2E 검증 (4단계 smoke test)
#
# 사용법:
#   bash scripts/verify-fingerprint.sh
#   MUSU_NODE_NAME=my-node bash scripts/verify-fingerprint.sh
#
# 요구사항:
#   - ~/.musu/musu_token (musu.pro API 토큰)
#   - ~/.musu/quic_cert.der (자동 생성됨 — bridge 최소 1회 시작 후)
#   - curl, openssl, jq (xxd 또는 od)
set -euo pipefail

PASS=0
FAIL=0

ok()   { echo "  ✅ $*"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $*"; FAIL=$((FAIL + 1)); }
info() { echo "  ℹ️  $*"; }

echo ""
echo "══════════════════════════════════════════════"
echo "  musu-bridge QUIC Fingerprint E2E Verifier"
echo "══════════════════════════════════════════════"
echo ""

# ── Step 1: musu_token 존재 확인 ──────────────────────────────────────────────
echo "Step 1: MUSU_TOKEN 확인"
MUSU_TOKEN_FILE="${HOME}/.musu/musu_token"
if [[ -n "${MUSU_TOKEN:-}" ]]; then
    ok "MUSU_TOKEN env 설정됨"
    TOKEN="$MUSU_TOKEN"
elif [[ -f "$MUSU_TOKEN_FILE" ]]; then
    TOKEN="$(tr -d '\n' < "$MUSU_TOKEN_FILE")"
    ok "MUSU_TOKEN 파일 로드: $MUSU_TOKEN_FILE"
else
    fail "MUSU_TOKEN 없음 — musu.pro/account 에서 발급 후 저장:"
    info "echo 'your-token' > ~/.musu/musu_token && chmod 600 ~/.musu/musu_token"
    TOKEN=""
fi
echo ""

# ── Step 2: 로컬 cert fingerprint 계산 ───────────────────────────────────────
echo "Step 2: 로컬 QUIC cert fingerprint 계산"
QUIC_CERT="${HOME}/.musu/quic_cert.der"
LOCAL_FP=""
if [[ ! -f "$QUIC_CERT" ]]; then
    fail "quic_cert.der 없음 ($QUIC_CERT) — bridge를 최소 1회 시작하면 자동 생성"
else
    if command -v xxd &>/dev/null; then
        LOCAL_FP="$(openssl dgst -sha256 -binary "$QUIC_CERT" | xxd -p | tr -d '\n' | sed 's/../&:/g;s/:$//')"
    else
        LOCAL_FP="$(openssl dgst -sha256 -binary "$QUIC_CERT" | od -A n -t x1 | tr -d ' \n' | sed 's/../&:/g;s/:$//')"
    fi
    ok "로컬 fingerprint: ${LOCAL_FP:0:23}..."
    info "전체: $LOCAL_FP"
fi
echo ""

# ── Step 3: musu.pro에서 이 노드의 cert_fingerprint 조회 ─────────────────────
echo "Step 3: musu.pro에서 cert_fingerprint 조회"
NODES_URL="${MUSU_NODES_URL:-https://musu.pro/api/v1/nodes}"
NODE_NAME="${MUSU_NODE_NAME:-$(hostname)}"
REMOTE_FP=""

if [[ -z "$TOKEN" ]]; then
    fail "토큰 없어서 musu.pro 조회 불가 (Step 1 실패)"
else
    if ! command -v jq &>/dev/null; then
        fail "jq 미설치 — apt install jq 또는 brew install jq"
    else
        HTTP_CODE=$(curl -s -o /tmp/musu_nodes_resp.json -w "%{http_code}" \
            -H "Authorization: Bearer $TOKEN" \
            "$NODES_URL" 2>/dev/null || echo "000")

        if [[ "$HTTP_CODE" == "200" ]]; then
            REMOTE_FP=$(jq -r --arg name "$NODE_NAME" \
                '.[] | select(.name == $name) | .cert_fingerprint // ""' \
                /tmp/musu_nodes_resp.json 2>/dev/null || echo "")

            if [[ -z "$REMOTE_FP" || "$REMOTE_FP" == "null" ]]; then
                fail "musu.pro에서 노드 '$NODE_NAME' 찾음 but cert_fingerprint 없음"
                info "bridge 재시작 후 heartbeat이 fingerprint를 보내면 등록됩니다"
                info "현재 등록된 노드:"
                jq -r '.[].name' /tmp/musu_nodes_resp.json 2>/dev/null | sed 's/^/    /'
            else
                ok "musu.pro cert_fingerprint: ${REMOTE_FP:0:23}..."
            fi
        else
            fail "musu.pro API 오류 (HTTP $HTTP_CODE)"
            info "응답: $(cat /tmp/musu_nodes_resp.json 2>/dev/null | head -c 200)"
        fi
    fi
fi
echo ""

# ── Step 4: local == remote 비교 ─────────────────────────────────────────────
echo "Step 4: fingerprint 일치 확인"
if [[ -z "$LOCAL_FP" ]]; then
    fail "로컬 fingerprint 없음 (Step 2 실패)"
elif [[ -z "$REMOTE_FP" || "$REMOTE_FP" == "null" ]]; then
    fail "원격 fingerprint 없음 (Step 3 실패)"
elif [[ "$LOCAL_FP" == "$REMOTE_FP" ]]; then
    ok "LOCAL == REMOTE ✓ — FingerprintVerifier 활성화 조건 충족"
else
    fail "MISMATCH!"
    info "LOCAL : $LOCAL_FP"
    info "REMOTE: $REMOTE_FP"
    info "원인: cert 재생성 후 heartbeat 미발송, 또는 다른 노드의 fingerprint"
fi
echo ""

# ── 결과 요약 ─────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
    echo "  ✅ E2E 검증 완료 ($PASS/$TOTAL 통과)"
    echo "  FingerprintVerifier가 MITM 공격을 차단합니다."
else
    echo "  ⚠️  $FAIL/$TOTAL 실패 — 위 항목 확인 후 bridge 재시작"
fi
echo "══════════════════════════════════════════════"
echo ""
