# MUSU 다음 단계 — 2026-04-08

## 현재 위치

- **기능 구현**: MUS-888 계열 15개 중 13개 완료, 2개 리뷰 중
- **백엔드 강화**: Phase 0 완료 (errors.py + middleware.py)
- **감사 점수**: 7.3/10
- **총 코드**: ~18,784 LOC (Python+TS), Rust 3 workspace

---

## 즉각 작업 (이번 주)

### 1. 감사 이슈 수정 (Critical + High)
- [ ] musu-supervisor `.unwrap()` → `Result` 교체 (23개)
- [ ] musu-worker rate limiting 추가
- [ ] Router fallback error_code 로직 정리
- [ ] musu-worker 테스트 작성 (최소 10개)
- [ ] unsafe PID 검증 추가

### 2. 백엔드 강화 Phase 1 (Security)
- [ ] bridge 인증 적용 완료 확인
- [ ] rate_limit.py 독립 모듈 구현
- [ ] 입력 검증 강화 (메시지 길이, 채널 패턴)
- [ ] 보안 헤더 미들웨어
- [ ] worker command allowlist

### 3. 리뷰 중 이슈 마무리
- [ ] MUS-889 (HISTORY-1) 리뷰 통과
- [ ] MUS-892 (프론트엔드 히스토리) 리뷰 통과
- [ ] MUS-897 (Fallback heartbeat 엔진) 리뷰 통과
- [ ] MUS-947 (Wave G-6 채널/메시지/WS) 리뷰 통과

---

## 다음 주

### 백엔드 강화 Phase 2-3
- [ ] 테스트 커버리지 60%+ (bridge 20개, control 15개, port 15개)
- [ ] structlog 구조화 로깅
- [ ] correlation ID 미들웨어
- [ ] audit_log 테이블 + 감사 추적

### musu-supervisor 실제 서비스 기동
- [ ] musu start → bridge + control + portd 실제 기동 테스트
- [ ] kill -9 → 자동 재시작 검증
- [ ] musu status 출력 확인

---

## 2주 후

### 백엔드 강화 Phase 4-5
- [ ] circuit breaker 독립 모듈
- [ ] graceful shutdown (SIGTERM 핸들러)
- [ ] Pydantic Settings 중앙 설정
- [ ] Alembic 마이그레이션 도입

### 통합 테스트
- [ ] supervisor → bridge → core → adapter 풀 스택 E2E
- [ ] 2-node Tailscale 시나리오 (Wave F 재검증)

---

## 설치 가이드

### 다른 컴퓨터에 MUSU 설치

#### 사전 요구사항
- Linux (Ubuntu 22.04+ / WSL2)
- Python 3.10+
- Rust 1.75+ (cargo)
- Node.js 18+ (pnpm 권장)
- Go 1.21+ (musu-scanner 빌드 시)
- Tailscale (멀티 머신 시)

#### 1. 코드 클론
```bash
git clone git@github.com:yellowhama/musu-bee.git musu-functions
cd musu-functions
```

#### 2. Python 환경 세팅
```bash
# musu-core
cd musu-core
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# musu-bridge
cd ../musu-bridge
pip install -e ".[dev]"

# musu-worker
cd ../musu-worker
pip install -e ".[dev]"

# musu-control
cd ../musu-control
pip install -e ".[dev]"

# musu-indexer
cd ../musu-indexer
pip install -e ".[mcp]"
```

#### 3. Rust 빌드
```bash
# musu-port
cd musu-port && cargo build --release

# musu-connects
cd ../musu-connects && cargo build --release

# musu-supervisor
cd ../musu-supervisor && cargo build --release
```

#### 4. 프론트엔드
```bash
cd musu-bee
pnpm install
pnpm build
```

#### 5. 설정
```bash
# .env 파일 생성
cat > .env << 'EOF'
MUSU_DB_PATH=~/.musu/musu.db
MUSU_BRIDGE_TOKEN=your-secret-token-here
MUSU_WORKER_TOKEN=your-worker-token-here
MUSU_ADAPTER_TIMEOUT_SEC=300
EOF

# musu.toml (supervisor용)
mkdir -p ~/.musu
cat > ~/.musu/musu.toml << 'EOF'
[core]
db_path = "~/.musu/musu.db"

[bridge]
host = "127.0.0.1"
port = 8070

[adapters]
primary = "claude_local"
EOF
```

#### 6. 실행
```bash
# 방법 A: 수동 (각 터미널에서)
cd musu-bridge && python server.py          # :8070
cd musu-bee && pnpm dev                      # :3001
cd musu-port && cargo run -p musu-portd      # :1355

# 방법 B: supervisor (구현 완료 후)
musu start
musu status
```

#### 7. 테스트
```bash
# Python 테스트
cd musu-core && pytest
cd musu-bridge && pytest

# Rust 테스트
cd musu-port && cargo test
cd musu-connects && cargo test
cd musu-supervisor && cargo test

# E2E
cd musu-bee && npx playwright test
```

#### 8. Tailscale 연결 (멀티 머신)
```bash
# 양쪽 머신에서
tailscale up

# musu.toml에 노드 추가
[mesh]
[[mesh.nodes]]
name = "second-pc"
tailscale_ip = "100.x.x.x"
```

---

## 멀티 머신 아키텍처

```
Machine A (카페 노트북)           Machine B (집 데스크탑)
  musu-bee :3001 ──────────────── musu-worker :9700
  musu-bridge :8070                musu-portd :1355
  musu-supervisor                  musu-connects (QUIC)
       │                                │
       └──── Tailscale 100.x.x.x ──────┘
```
