# MUSU 설치 가이드

새 컴퓨터에 MUSU를 설치하고 실행하는 방법.

---

## 사전 요구사항

| 도구 | 최소 버전 | 확인 |
|------|-----------|------|
| Linux (Ubuntu 22.04+ / WSL2) | — | `uname -a` |
| Python | 3.10+ | `python3 --version` |
| pip | 최신 | `pip --version` |
| Node.js | 18+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Rust + Cargo | 1.75+ | `cargo --version` |
| Git | 2.30+ | `git --version` |
| Tailscale | (멀티 머신 시) | `tailscale status` |

### 빠른 설치 (Ubuntu/WSL2)
```bash
# Node.js + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Python (보통 이미 설치됨)
sudo apt install -y python3 python3-pip python3-venv
```

---

## 1. 코드 클론

```bash
git clone git@github.com:yellowhama/musu-bee.git musu-functions
cd musu-functions
```

---

## 2. Python 모듈 설치

각 모듈별로 venv를 만들 수도 있고, 하나의 venv에서 전부 설치할 수도 있습니다.

### 방법 A: 통합 venv (권장)

```bash
cd musu-functions
python3 -m venv .venv
source .venv/bin/activate

pip install -e musu-core[dev]
pip install -e musu-bridge[dev]
pip install -e musu-worker[dev]
pip install -e musu-control[dev]
pip install -e musu-indexer[mcp]
```

### 방법 B: 모듈별 venv

```bash
cd musu-core && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]" && deactivate
cd ../musu-bridge && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]" && deactivate
# ... 동일하게 musu-worker, musu-control, musu-indexer
```

---

## 3. Rust 빌드

```bash
# musu-port (WebSocket 컨트롤 플레인, :1355)
cd musu-port && cargo build --release && cd ..

# musu-connects (QUIC P2P)
cd musu-connects && cargo build --release && cd ..

# musu-supervisor (프로세스 관리자)
cd musu-supervisor && cargo build --release && cd ..
```

> Rust 1.75 미만이면 Cargo.lock v4를 못 읽습니다. `rustup update`로 업데이트하세요.

---

## 4. 프론트엔드

```bash
cd musu-bee
pnpm install
pnpm build    # 프로덕션 빌드
# 또는
pnpm dev      # 개발 서버 (:3001)
```

---

## 5. 환경 설정

### .env 파일

```bash
cd musu-functions
cat > .env << 'EOF'
# Bridge
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=8070
MUSU_BRIDGE_TOKEN=your-bridge-token-here

# Worker
MUSU_WORKER_TOKEN=your-worker-token-here

# Core
MUSU_DB_PATH=~/.musu/musu.db
MUSU_ADAPTER_TIMEOUT_SEC=300

# Paperclip (선택)
# PAPERCLIP_API_URL=http://127.0.0.1:3100/api
# PAPERCLIP_API_KEY=your-key
# PAPERCLIP_COMPANY_ID=your-company-id
EOF
```

### musu.toml (supervisor용, 선택)

```bash
mkdir -p ~/.musu
cat > ~/.musu/musu.toml << 'EOF'
[core]
db_path = "~/.musu/musu.db"

[bridge]
host = "0.0.0.0"
port = 8070

[adapters]
primary = "claude_local"
fallback = "gemini_local"
EOF
```

---

## 6. 실행

### 편의 스크립트 (권장)

```bash
# musu-bridge 시작 (PYTHONPATH 자동 설정)
./scripts/start-bridge.sh

# musu-bee 프론트엔드 시작
./scripts/start-bee.sh
```

### 수동 실행

```bash
# 터미널 1: bridge
export PYTHONPATH="$(pwd)/musu-core/src:$(pwd)/musu-bridge"
cd musu-bridge && python3 server.py

# 터미널 2: frontend
cd musu-bee && pnpm dev --hostname 0.0.0.0

# 터미널 3: port (선택)
cd musu-port && cargo run -p musu-portd

# 터미널 4: worker (선택, 원격 실행 시)
export PYTHONPATH="$(pwd)/musu-core/src:$(pwd)/musu-worker"
cd musu-worker && python3 -m musu_worker.main
```

> **핵심**: `PYTHONPATH`에 `musu-core/src`를 반드시 포함해야 합니다.
> 편의 스크립트(`scripts/start-bridge.sh`)를 쓰면 자동으로 설정됩니다.

---

## 7. 동작 확인

```bash
# bridge 헬스 체크
curl http://localhost:8070/health
# → {"status": "ok"}

# 에이전트 목록
curl http://localhost:8070/api/agents
# → [{"id": "...", "name": "ceo", ...}]

# frontend
curl -sI http://localhost:3001
# → HTTP/1.1 200 OK

# 테스트
cd musu-core && pytest
cd musu-bridge && pytest
cd musu-bee && npx playwright test
```

---

## 8. 멀티 머신 (Tailscale)

### 양쪽 머신에 Tailscale 설치

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
tailscale ip -4  # IP 확인 (100.x.x.x)
```

### 머신 A (카페 노트북) — 프론트엔드 + bridge

```bash
./scripts/start-bridge.sh   # :8070, 0.0.0.0
./scripts/start-bee.sh       # :3001, 0.0.0.0
```

### 머신 B (집 데스크탑) — worker + port

```bash
export PYTHONPATH="$(pwd)/musu-core/src"
cd musu-worker && MUSU_WORKER_HOST=0.0.0.0 python3 -m musu_worker.main  # :9700
cd musu-port && cargo run -p musu-portd  # :1355
```

### 연결 확인

```bash
# 머신 A에서 머신 B의 worker 확인
curl http://100.x.x.x:9700/health

# 머신 B에서 머신 A의 bridge 확인
curl http://100.y.y.y:8070/health
```

### 아키텍처

```
Machine A (노트북)              Machine B (데스크탑)
  musu-bee :3001 ──────────────── musu-worker :9700
  musu-bridge :8070                musu-portd :1355
       │                                │
       └──── Tailscale 100.x.x.x ──────┘
```

---

## 9. AI CLI 도구 설치 (선택)

MUSU 어댑터가 사용하는 CLI 도구들:

```bash
# Claude Code
npm install -g @anthropic-ai/claude-code

# Gemini CLI
npm install -g @google/gemini-cli
gemini  # 첫 실행 시 Google OAuth 로그인

# Codex CLI
npm install -g @openai/codex

# Hermes Agent
npm install -g hermes-agent
```

설치 후 어댑터 확인:
```bash
claude --version     # claude_local
gemini --version     # gemini_local
codex --version      # codex_local
hermes --version     # hermes
```

Codex 모델 설정(선택):
```bash
# 기본값: gpt-5.2
export MUSU_CODEX_MODEL=gpt-5.2
```

---

## 트러블슈팅

### `ModuleNotFoundError: No module named 'musu_core'`
→ `PYTHONPATH`에 `musu-core/src` 추가. `scripts/start-bridge.sh` 사용 권장.

### Tailscale IP로 접근 불가
→ 서버가 `127.0.0.1`로 바인딩됐을 수 있음. `BRIDGE_HOST=0.0.0.0` 설정 확인.
  `config.py`에서 기본값이 `0.0.0.0`이므로 환경변수를 덮어쓰지 않았는지 확인.

### Gemini CLI "Keychain initialization error"
→ 무시 가능. `FileKeychain fallback`으로 자동 전환됨. 동작에 영향 없음.

### Rust `Cargo.lock` 버전 오류
→ `rustup update`로 Cargo 1.75+ 업데이트.

### Playwright 테스트 실패 (WSL2)
→ `npx playwright install --with-deps` 실행하여 브라우저 바이너리 설치.
