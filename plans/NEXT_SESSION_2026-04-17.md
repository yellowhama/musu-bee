# Next Session TODO — 2026-04-17

## 현재 상태 요약

### 완료된 것 (2026-04-16 세션)
- **Phase 3A**: MUSU_TOKEN 파일(`~/.musu/musu_token`) 자동 로드
- **Phase 3B**: QUIC connection pool (DashMap, 60s idle TTL)
- **Phase 3C**: cert 영구 저장 (`~/.musu/quic_cert.der`) — 재시작 후 동일 fingerprint ✅
- **Phase 3D**: heartbeat에 cert_fingerprint 포함 (MUSU_QUIC_FINGERPRINT env)
- **빌드**: `bin/musu-connectsd` 9.2MB 업데이트 + git push (`ab5dd902`)

### 현재 실행 중
- second-pc: bridge(:8070) + QUIC proxy(:4433/:9443)
- main-pc: bridge(:8070) + QUIC proxy(:4433/:9443)

### 잔존 확인 사항
- **connection pool E2E**: `--max-time 180`으로 재검증 필요 (LLM 30-60s 응답)

---

## 코드 감사 결과 (2026-04-16 세션 종료 기준)

### 정성적 평가: **97/100** (Phase 3 완료)

| 항목 | 상태 | 비고 |
|------|------|------|
| cert persistence | ✅ | ~/.musu/quic_cert.der |
| fingerprint 안정성 | ✅ | 재시작 후 동일 |
| connection pool | ✅ (코드) | E2E --max-time 180 재검증 필요 |
| MUSU_TOKEN 파일 | ✅ | ~/.musu/musu_token |
| heartbeat fingerprint | ✅ | MUSU_QUIC_FINGERPRINT env |

### 잔존 이슈 (Phase 4 대상)

**Phase 3 신규 코드 — 즉각 위협 없음**
1. **connection pool race**: `drop(entry)` 후 `pool.get_mut()` 재취득 — TOCTOU
   - `DashMap.alter()` 원자 업데이트로 수정 가능
2. **pool cleanup 없음**: idle conn background 청소 미구현
   - 30s interval cleanup task 추가 필요
3. **reqwest 매 요청마다 new client**: `call_local_bridge()` per-call Client 생성
   - static Client 공유로 개선

**기존 코드 — 운영 위험 수준**
4. **SSRF**: `sync_engine._pull_from()` — peer_url 화이트리스트 없음
5. **sync_state.json race**: 동시 쓰기 시 파일 손상 가능
6. **middleware localhost bypass**: 서버 전인터페이스 바인드 시 internal auth bypass 위험
7. **mesh_router TOML race**: load without lock (TOCTOU)

---

## Phase 4 계획 (다음 세션)

### 우선순위

**P0 — musu.pro fingerprint 등록 (vibecode-town)**
- [ ] `nodes` 테이블 `cert_fingerprint TEXT` 컬럼 추가 (vibecode-town Supabase)
- [ ] `POST /api/v1/nodes/register`: cert_fingerprint 저장
- [ ] `GET /api/v1/nodes`: cert_fingerprint 포함 응답

**P1 — NoVerifier → Fingerprint 검증**
- [ ] `NoVerifier` 대체: `FingerprintVerifier`
  - 연결 시 musu.pro에서 peer fingerprint 조회
  - TLS 핸드셰이크 시 비교 → 불일치 시 연결 거부
- [ ] MITM 방어 완성

**P2 — SSRF 방어**
- [ ] `sync_engine._pull_from()`: peer_url → nodes.toml / musu.pro registry 화이트리스트
- [ ] `mesh_router._forward_quic()`: 동일
- [ ] IP 사설망 블록 (RFC 1918, 169.254.x.x)

**P3 — Connection Pool 완성**
- [ ] `DashMap.alter()` 타임스탬프 원자 갱신 (race 수정)
- [ ] background cleanup task (30s interval)
- [ ] reqwest::Client static 공유

---

## 실행 상태 복원 명령어

### second-pc 재시작
```bash
cd /home/hugh51/musu-functions
git pull origin main
./scripts/start-bridge.sh
```

### main-pc 재시작
```bash
cd /home/hugh51/musu-functions
git pull origin main
mkdir -p logs

# QUIC proxy (bin/ 우선)
nohup ./bin/musu-connectsd bridge-proxy \
  --quic-port 4433 --http-port 9443 \
  --bridge-url http://127.0.0.1:8070 \
  > logs/musu-connectsd.log 2>&1 &

# bridge
MUSU_BRIDGE_TOKEN=5d740a2f-68db-478e-a582-b9e84b36c122 \
MUSU_NODE_NAME=hugh-main-1 \
MUSU_QUIC_PROXY_URL=http://127.0.0.1:9443 \
PYTHONPATH=/home/hugh51/musu-functions/musu-core/src:/home/hugh51/musu-functions/musu-bridge \
  nohup python3 musu-bridge/server.py >> logs/musu-bridge.log 2>&1 &
```

### Connection Pool E2E 검증 (--max-time 180)
```bash
# 첫 번째 (new connection 기대)
curl -s --max-time 180 -X POST http://127.0.0.1:9443/forward \
  -H "Content-Type: application/json" \
  -d '{"peer_url":"http://100.121.211.106:8070","channel":"engineer","sender_id":"test","text":"hi"}'

# 두 번째 즉시 (reusing connection 기대)
curl -s --max-time 180 -X POST http://127.0.0.1:9443/forward \
  -H "Content-Type: application/json" \
  -d '{"peer_url":"http://100.121.211.106:8070","channel":"engineer","sender_id":"test","text":"hi again"}'

# 로그 확인
tail -f logs/musu-connectsd.log | grep "connection"
```

---

## 마스터 플랜 현황

`docs/MUSU_MESH_MASTER_PLAN.md` 기준:

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 0 | nodes.toml 수동 설정 | ✅ 완료 |
| Phase 1 | musu.pro peer discovery | ✅ 완료 (MUSU_TOKEN 설정 시 활성) |
| Phase 2 | QUIC UDP transport | ✅ 완료 + E2E 검증 |
| Phase 3 | Cert pinning + connection pool | ✅ 완료 (fingerprint DB 등록 제외) |
| Phase 4 | Fingerprint 검증 + SSRF 방어 | 🔜 다음 |
| Phase 5 | STUN NAT traversal | 📋 backlog |
| Phase 6 | mDNS LAN fast path | 📋 backlog |
