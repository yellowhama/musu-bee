# MUSU Blueprint — AI 팀 업무 메신저

> "여러 컴퓨터의 AI가 팀으로 일하는 것을 보고 지시하는 메신저"

유저 = 양봉업자(Beekeeper) / AI 에이전트 = 일벌(Worker Bees) / 기기 네트워크 = 벌집(Hive)

---

## Layer 4: UI (유저가 보는 것)

| UI | 상태 | 설명 |
|----|------|------|
| **Mattermost** (채팅) | MUS-838 설계 완료 | #ceo, #cto, #engineer 채널 + 봇 6개 응답 |
| **MUSU Desktop** (Tauri) | 미래, Musu-new 참조 | 메신저 UI + Tldraw 캔버스 + 대시보드 |
| **Claude Code / CLI** (MCP) | MUS-825 설계 완료 | /musu-status, /musu-board, musu-operator 에이전트 |

---

## Layer 3: Bridge (연결 계층)

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| **musu-bridge** | musu-functions/musu-bridge/ | Mattermost ↔ musu-core (FastAPI :8070) |
| **musu-plugin** | musu-functions/musu-plugin/ | Claude Code 플러그인 (commands/agents/skills/hooks) |
| **musu-control** | musu-functions/musu-control/ | FastMCP 23개 tools (Agent/Issue/Run 관리) |

---

## Layer 2: Core (두뇌)

### musu-core (musu-functions/musu-core/)

Paperclip 없이 독립 동작하는 자체 경량 오케스트레이터.

**Agent Registry** (SQLite)
- CEO, VP (Codex), CTO, Engineer, QA, Worker
- 각 에이전트에 adapter_type + node 할당

**Task Queue** (SQLite)
- tasks + comments + execution_log
- 상태: todo → in_progress → done/cancelled

**Message Router**
- source(Mattermost/CLI/MCP) → agent → adapter 실행 → response 반환

### Adapter Registry

| 어댑터 | 설명 | 비고 |
|--------|------|------|
| `claude_local` | Claude CLI subprocess (로컬) | Paperclip 패턴 차용 |
| `codex_local` | Codex CLI subprocess (로컬) | 기본 모델 gpt-5.2 (env `MUSU_CODEX_MODEL`로 변경) |
| `local_llm` | Qwen 9B/14B (OpenAI-compatible API) | role별 라우팅 |
| `remote_cli` | Machine B에서 Claude/Codex 실행 | MUS-851 |
| `remote_process` | Machine B에서 빌드/테스트 실행 | MUS-851 |
| `process` | 로컬 임의 실행파일 | 범용 |
| `http` | HTTP POST 엔드포인트 | 외부 서비스 |

유저 선택 가능: primary(Claude) / fallback(Codex) / local(Qwen) — 한도 초과 시 자동 전환.

### Backend 추상화

| 백엔드 | 조건 | 기능 |
|--------|------|------|
| **LocalBackend** (SQLite) | 기본, 항상 동작 | Agent/Task CRUD, 실행 로그 |
| **PaperclipBackend** (API) | Paperclip 감지 시 | 고급 오케스트레이션, 예산, 게이트, 세션 |

---

## Layer 1: Infrastructure (인프라)

| 컴포넌트 | 위치 | 상태 | 역할 |
|----------|------|------|------|
| **musu-mesh** | musu-core/mesh.py | MUS-851 설계 완료 | Tailscale 래핑, 노드 디스커버리, 그룹핑, 헬스체크 |
| **musu-index** | musu-functions/musu-indexer/ | ✅ 운영 중 | Go 스캐너 + SQLite FTS5 + MCP + Qwen 태거 |
| **musu-llm** | musu-functions/musu-llm/ | 부분 (Qwen 9B 운영) | LLM 프로세스 관리, Machine B에 Qwen 14B 예정 |
| **musu-port** | musu-functions/musu-port/ | ✅ 95% 완성 | 포트 앨리어스 라우팅, 서비스 디스커버리, :1355 |
| **musu-connects** | musu-functions/musu-connects/ | ⚠️ 60% (트레잇) | QUIC P2P, 피어 디스커버리, 라우트 교환 |
| **musu-computer-tools** | musu-functions/musu-computer-tools/ | ✅ 운영 중 | terminal-engine, chat-spy, rootless-control, Windows bridge |
| **musu-worker** | musu-functions/musu-worker/ | MUS-851 설계 완료 | 원격 노드 실행 서버 (FastAPI :9700) |

---

## Hardware (벌집) — 동적 노드 모델

### 핵심 원칙: 고정 역할 없음, 동적 스케줄링

노드에 "orchestrator", "gpu_primary" 같은 **고정 역할을 부여하지 않는다.**
각 노드는 자기 **capability(스펙)**만 보고하고, musu-core가 **태스크 배정 시점에 동적으로 결정**한다.

### 노드 자동 감지 (musu-worker가 부팅 시 보고)

```json
// GET /capabilities 응답 (자동 수집)
{
  "node_name": "second-pc",
  "gpu": {"name": "RTX 4060 Ti", "vram_total_mb": 16384, "vram_free_mb": 10200},
  "cpu": {"cores": 12, "load_pct": 15},
  "ram": {"total_mb": 32768, "free_mb": 18000},
  "services": ["paperclip:3100", "llama-server:18081", "musu-portd:1355"],
  "adapters": ["claude_local", "codex_local"],
  "llm_instances": [{"name": "qwen-9b", "port": 18081, "vram_mb": 6200}],
  "online_since": "2026-04-07T06:00:00Z"
}
```

### 동적 스케줄링 정책

```
태스크 도착 → musu-core 스케줄러:
  1. 모든 온라인 노드의 capabilities 조회
  2. 태스크 요구사항 매칭:
     - VRAM 필요 → VRAM 여유 가장 많은 노드
     - CPU 바운드 (빌드) → CPU 부하 가장 낮은 노드
     - 특정 CLI 필요 → 해당 CLI 설치된 노드
     - LLM 추론 → 적합한 모델이 있는 노드
  3. 노드 선택 → remote_cli/remote_process 어댑터로 디스패치
```

### Orchestrator 동적 선출

```
고정 orchestrator 없음.
  - 가장 먼저 `musu start`한 노드가 orchestrator
  - orchestrator 다운 → 다른 노드가 자동 대행
  - 복구되면 리더 재선출 (또는 기존 유지)
```

### nodes.toml (스펙은 자동, 정책만 설정)

```toml
[mesh]
self = "auto"                       # hostname으로 자동 감지
worker_port = 9700
health_interval_sec = 30

[mesh.scheduling]
strategy = "best-fit"               # best-fit | round-robin | affinity
orchestrator = "auto"               # 가장 먼저 올라온 노드
fallback_orchestrator = true        # orchestrator 죽으면 대행
prefer_local = true                 # 로컬 실행 가능하면 로컬 우선

# 노드 목록 (IP만 — 스펙은 자동 수집)
[[mesh.nodes]]
name = "second-pc"
tailscale_ip = "100.126.67.88"

[[mesh.nodes]]
name = "main-pc"
tailscale_ip = "100.121.211.106"

# 노드 3대 추가 시 여기에 한 줄만 추가하면 됨
# [[mesh.nodes]]
# name = "third-pc"
# tailscale_ip = "100.x.x.x"
```

### 현재 물리 머신

| 머신 | GPU | IP | 비고 |
|------|-----|----|------|
| second-pc | RTX 4060 Ti 16GB | 100.126.67.88 | Win + WSL |
| main-pc | RTX 5070 Ti 16GB | 100.121.211.106 | Win + WSL |

각 물리 머신은 Win + WSL 노드를 포함. musu-mesh가 한 그룹으로 인식.

---

## musu-supervisor (통합 프로세스 관리)

```
$ musu start                    → core + chat (기본)
$ musu start --llm              → + Qwen 로컬 LLM
$ musu start --mesh             → + Tailscale 노드 관리
$ musu start --paperclip        → + Paperclip 고급 기능
$ musu start --full             → 전부

$ musu status                   → 모든 서비스 상태
$ musu nodes                    → 머신 목록 + 헬스체크
$ musu agents                   → 에이전트 상태
$ musu board                    → 태스크 보드
$ musu chat <agent> "메시지"    → CLI에서 에이전트 대화
$ musu config                   → 설정 (어댑터, 노드, LLM 선택)
```

통합 설정: `~/.musu/musu.toml` + `~/.musu/nodes.toml`

---

## Paperclip (선택적 백엔드)

있으면 활용, 없어도 동작.

| 기능 | Paperclip ON | Paperclip OFF |
|------|-------------|---------------|
| 에이전트 스케줄링 | 하트비트 타이머 | 수동 / cron |
| 예산 관리 | $6,400/mo 추적 | 없음 |
| 거버넌스 게이트 | G1/G2/G3 | 없음 |
| 세션 관리 | 컴팩션 + 리줌 | 기본 session_id 저장 |
| 실시간 이벤트 | WebSocket | 폴링 |
| 이슈 시스템 | 850+ 이슈 | musu-core TaskQueue |
| CEO 루틴 | Morning Review, QA Weekly | 없음 |
| VP 폴백 | self-heal.sh 자동 | 수동 |

현재: 7 에이전트 (CEO, VP, CTO, Engineer, CoS, QA, Worker)

---

## 이슈 트리 (구현 로드맵)

```
MUS-848: ROOT-ARCH: Unified Runtime (critical)
  │
  ├── MUS-825: Bidirectional Integration (MCP + Plugin)
  │     └── MUS-838: Core + Mattermost Bridge
  │
  ├── MUS-851: Multi-Machine (병렬 실행 + 빌드 오프로드 + LLM)
  │
  └── MUS-791: ROOT 제품 완성 → 판매

MUS-795: Layer 2 메신저 UI Wave G (CEO 생성)
```

---

## 구현 순서

| Phase | 내용 | 의존성 |
|-------|------|--------|
| **1** | musu-core (Agent Registry + Task Queue + claude_local adapter) | 없음 |
| **2** | musu-chat (Mattermost Docker + bridge + 봇) | Phase 1 |
| **3** | musu-mesh + musu-worker (노드 관리 + 원격 실행) | Phase 1 |
| **4** | musu-control (MCP + CLI) | Phase 1 |
| **5** | musu-supervisor (Rust, musu start 통합) | Phase 1-4 |
| **6** | Multi-node LLM (Qwen 14B on Machine B) | Phase 3 |
| **7** | Paperclip 백엔드 (선택적 연동) | Phase 1 |
| **8** | MUSU Desktop Tauri (Musu-new 참조) | Phase 1-5 |

---

## 진행 상태

### ✅ 완료
- musu-port (Rust, 95%)
- musu-indexer (Python+Go, MCP, 15K 파일, Qwen 태거)
- musu-computer-tools (terminal-engine, chat-spy, rootless-control)
- Paperclip 운영 (7 에이전트, 850+ 이슈, 루틴, 워치독)
- VP (Codex) 에이전트 + CEO 폴백 로직
- Tailscale 2-node 연결 + Wave F 증명
- MUSU Desktop 감사 95/100 (Musu-new)
- musu-bee GitHub 레포

### ⚠️ 설계 완료, 구현 대기
- MUS-848: Unified Runtime
- MUS-825: Bidirectional Integration
- MUS-838: Core + Mattermost Bridge
- MUS-851: Multi-Machine
- MUS-795: Layer 2 메신저 UI

### 🔲 미래
- musu-connects 완성 (QUIC P2P)
- MUSU Desktop Tauri 통합
- Tldraw 캔버스 (Factory 탭)
- 3+ 머신 체인
- 엔터프라이즈 배포 (K8s)

---

## 레퍼런스

| 참고 | 위치 | 용도 |
|------|------|------|
| Paperclip adapter | references_AI/paperclip-main/packages/adapters/ | 어댑터 패턴 |
| Claude Code plugin | references_AI/claude-code/plugins/ | 플러그인 구조 |
| gstack skills | references_AI/gstack/ | 스킬 파이프라인 |
| Musu-new (레거시) | /mnt/f/Aisaak/Projects/Musu-new/ | Desktop UI, supervisor 참조 |
| PRODUCT_VISION.md | musu_corp/PRODUCT_VISION.md | 제품 비전 |

## 계획 문서

| 문서 | 내용 |
|------|------|
| `~/.claude/plans/musu-unified-architecture.md` | 통합 런타임 상세 |
| `~/.claude/plans/graceful-honking-matsumoto.md` | 멀티머신 활용 상세 |
