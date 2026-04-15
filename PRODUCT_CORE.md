# MUSU — 핵심 기능 정의서

> 작성: 2026-04-13 | SSOT
> "여러 대 컴퓨터의 AI가 팀으로 일하는 업무 메신저"

---

## 핵심 기능 4가지

### 기능 1: 여러 컴퓨터를 한 컴퓨터처럼
여러 대의 컴퓨터(로컬 머신들)를 하나의 통합된 컴퓨팅 환경으로 묶는다.
유저는 어느 머신에 무엇이 있는지 신경 쓰지 않고, MUSU가 알아서 라우팅한다.

**실제 사용 예시:**
- "이 모델 학습 돌려" → GPU 여유 있는 5070Ti로 자동 라우팅
- 4060Ti에서 시작한 작업이 5070Ti에서 이어서 실행
- 어느 머신이 죽으면 다른 머신이 자동으로 보스 역할 승계

**구성요소:**
- `musu-port`: 각 머신의 로컬 컨트롤 플레인 (포트 1355)
- `musu-connects`: 머신간 P2P 네트워크 (Rust QUIC)
- `musu-worker`: 원격 머신에서 실제 실행 담당 (포트 9700)

---

### 기능 2: 로컬 AI를 에이전트로 사용
Claude Code, Codex 등 로컬에 설치된 AI CLI를 에이전트로 실행한다.
클라우드 API 없이 로컬 모델 + 로컬 실행 = 비용 0, 프라이버시 완전 보장.

**실제 사용 예시:**
- "이 코드 리팩토링해줘" → 로컬 Claude Code가 실제로 파일 수정
- "이 버그 찾아줘" → 로컬 Codex가 코드베이스 분석
- 여러 AI 동시 실행 → 4060Ti는 Claude, 5070Ti는 Qwen

**구성요소:**
- `musu-ai`: Claude/Codex CLI를 child process로 실행하는 어댑터
- `musu-worker`: `/execute/cli` 엔드포인트로 실행 위임
- `musu-bee`: 결과를 채팅창에 스트리밍

---

### 기능 3: MCP 인터페이스
MUSU 자체가 MCP 서버로 동작한다.
Claude Code, Cursor 등 어떤 MCP 클라이언트에서도 MUSU를 도구로 사용할 수 있다.

**실제 사용 예시:**
- Claude Code에서 `mcp: musu` → MUSU 통해 원격 머신에 명령 실행
- "5070Ti의 GPU 사용률 알려줘" → MCP 도구 호출
- Pencil.dev처럼 외부 앱이 MUSU 기능을 MCP로 호출

**구성요소:**
- `musu-indexer`: 코드베이스 검색 MCP (이미 완성)
- `musu-port`: MCP health 프로빙 + Layer A
- MUSU-AS-MCP: 디바이스 상태/작업 실행을 MCP 도구로 노출 (미구현)

---

### 기능 4: 자원 오케스트레이션
각 머신의 CPU/RAM/GPU 상태를 실시간으로 파악하고, 작업을 가장 적합한 머신에 배분한다.

**실제 사용 예시:**
- 모델 추론 요청 → GPU 여유율 높은 머신으로 자동 배분
- RAM 부족한 머신에는 메모리 집약 작업 안 보냄
- 머신별 부하 균등화 (load balancing)

**구성요소:**
- `musu-port`: 각 머신 CPU/RAM/GPU 실시간 수집
- `musu-connects`: 피어 health 스냅샷 기반 merge policy
- `musu-bee`: 사이드바에 실시간 표시, 라우팅 UI

---

## 현재 구현 상태

| 기능 | 서비스 | 상태 | 비고 |
|------|--------|------|------|
| 1. 멀티컴퓨터 | musu-port | ✅ REAL | 40+ 엔드포인트, 디바이스 프로파일 |
| 1. 멀티컴퓨터 | musu-connects | ⚠️ ALPHA | QUIC 베이스라인, P2P 통합 미완 |
| 1. 멀티컴퓨터 | 디바이스 UI | ❌ STUB | INITIAL_DEVICES 하드코딩 |
| 1. 멀티컴퓨터 | musu-worker | ⚠️ PARTIAL | 실행 엔드포인트 있음, 격리 없음 |
| 2. 로컬 AI | musu-ai 어댑터 | ⚠️ PARTIAL | 파일 구조 있음, 실행 미연결 |
| 2. 로컬 AI | musu-worker /execute/cli | ✅ REAL | 엔드포인트 존재 |
| 2. 로컬 AI | Claude CLI 설치 | ✅ 설치됨 | `/home/hugh51/.local/bin/claude` |
| 2. 로컬 AI | Codex CLI 설치 | ✅ 설치됨 | `~/.npm-global/bin/codex` |
| 2. 로컬 AI | 채팅 연결 | ❌ 미연결 | Ollama만 연결, CLI 미연결 |
| 3. MCP | musu-indexer MCP | ✅ REAL | FastMCP, 코드 검색 도구 |
| 3. MCP | musu-port Layer A | ✅ REAL | /mcp/health 프로빙 |
| 3. MCP | MUSU-AS-MCP Layer B | ❌ 미구현 | 디자인만 있음 |
| 4. 자원 오케스트레이션 | musu-port 수집 | ✅ REAL | CPU/RAM/GPU 실시간 |
| 4. 자원 오케스트레이션 | UI 표시 | ✅ REAL | Sidebar ProgressBar |
| 4. 자원 오케스트레이션 | 라우팅 로직 | ❌ 미구현 | 자원 기반 배분 없음 |

---

## 외부 블로커

| 항목 | 블로커 | 상태 |
|------|--------|------|
| 5070Ti 연결 | SSH 접근 필요 | AWAITING-BOARD |
| Paddle 결제 | creds 필요 | AWAITING-BOARD |

---

## 관련 파일

| 서비스 | 핵심 파일 |
|--------|---------|
| musu-port | `musu-port/crates/musu-port-core/src/server.rs` |
| musu-connects | `musu-connects/MASTER_PLAN.md` |
| musu-worker | `musu-worker/src/musu_worker/main.py` |
| musu-ai | `musu-ai/ADAPTER_ARCHITECTURE.md`, `musu-ai/src/adapters/` |
| musu-indexer MCP | `musu-indexer/src/musu_indexer/server.py` |
| musu-port MCP | `musu-port/MUSU_AS_MCP_RELATION.md` |
| musu-bee 디바이스 | `musu-bee/src/components/AppShell.tsx:57-74` |
| musu-bee 자원 UI | `musu-bee/src/components/Sidebar.tsx` |
