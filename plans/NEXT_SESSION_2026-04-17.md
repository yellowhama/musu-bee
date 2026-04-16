# NEXT SESSION — 2026-04-17 (Phase 5/6 완료 이후)

## 현재 상태

**마스터 플랜**: Phase 0~6 ✅ 완료, Phase 7 남음
**정성적 평가**: 96/100
**커밋**: `394e551f` (Phase 5+6 코드), `16ad0681` (bin/ 바이너리 재빌드)

---

## 즉시 해야 할 것 (유저 액션)

### 1. MUSU_TOKEN 발급 + 저장 (두 머신 모두)

musu.pro 로그인 → Account → Node Tokens → 토큰 발급

```bash
mkdir -p ~/.musu
echo "your-musu-token" > ~/.musu/musu_token
chmod 600 ~/.musu/musu_token
```

### 2. Bridge 재시작 + fingerprint E2E 검증

```bash
# 기존 프로세스 종료
pkill -f "musu-connectsd" 2>/dev/null
pkill -f "python.*server.py" 2>/dev/null

# 재시작
bash scripts/start-bridge.sh
# → 로그에서 확인: [start-bridge] QUIC fingerprint: ab:cd:ef:...

# E2E 검증
bash scripts/verify-fingerprint.sh
# → ✅ E2E 검증 완료 (4/4 통과)
```

### 3. main-pc에서 git pull + 재시작

```bash
cd /home/hugh/musu-functions && git pull
pkill musu-connectsd; bash scripts/start-bridge.sh
```

---

## 다음 개발 Phase

### Phase 7 — Wake-on-LAN

**목표**: 노트북에서 원격 데스크탑 깨우기

**흐름**:
```
POST /api/wol/{node_name}
  → musu.pro에서 {mac_address, broadcast_ip} 조회
  → Magic Packet (UDP 9/7번 포트 broadcast)
```

**변경 파일**:
- `vibecode-town`: nodes 테이블 `mac_address TEXT`, `broadcast_ip TEXT` 컬럼
- `musu-bridge/wol.py` — 신규: Magic Packet 생성 + UDP 발송
- `musu-bridge/server.py` — `POST /api/wol/{node_name}` 엔드포인트
- `musu-bridge/registry.py` — heartbeat에 `mac_address` + `broadcast_ip` 포함

**수락 기준**:
- `curl -X POST http://127.0.0.1:8070/api/wol/hugh-main-1` → 데스크탑 부팅

---

## 코드 개선 항목 (Low)

### 1. mesh_router.has_node() 인터페이스화
```python
# mesh_router.py
def has_node(self, name: str) -> bool:
    return name in self._node_urls
```
→ server.py mDNS loop의 `router._node_urls` 직접 접근 제거

### 2. detect_public_ip() 조건부 호출
```python
# MUSU_TOKEN 없으면 ipify 호출 불필요
if not tailscale_ip and musu_token:
    _detected_public_ip = await detect_public_ip()
else:
    _detected_public_ip = None
```

---

## 현황 확인 체크리스트

```bash
# 로컬
bash scripts/verify-fingerprint.sh     # fingerprint E2E ✅
curl http://127.0.0.1:8070/health      # bridge 정상
curl http://127.0.0.1:8070/api/system/stats  # GPU/CPU stats

# 크로스머신 (second-pc → main-pc, Tailscale)
curl http://100.121.211.106:8070/api/system/stats

# QUIC 연결 풀 확인
cat logs/musu-connectsd.log | tail -30
# 첫 요청: "new connection to ..."
# 둘째 요청: "reusing connection to ..."
```

---

## 파일 위치 SSOT

| 항목 | 경로 |
|------|------|
| 마스터 플랜 | `docs/MUSU_MESH_MASTER_PLAN.md` |
| LLM Wiki | `/home/hugh51/llm-wiki/wiki/64_MUSU_MESH_PHASE4_5_6.md` |
| Specs | `~/.claude/projects/-home-hugh51/memory/musu-specs.md` (SPEC-135~137) |
| 검증 스크립트 | `scripts/verify-fingerprint.sh` |
| 시작 스크립트 | `scripts/start-bridge.sh` |
| 바이너리 | `bin/musu-connectsd` (2026-04-17 05:21, DashMap lock fix) |
