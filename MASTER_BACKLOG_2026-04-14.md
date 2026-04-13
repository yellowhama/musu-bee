# MUSU 전체 백로그 & 구현 계획
> 작성: 2026-04-14 | Phase 1 완료, Phase 2-Alpha+B2 완료 기준
> 상태: ACTIVE

---

## 완료 현황 스냅샷

| Task | 상태 | 커밋 |
|------|------|------|
| TASK-1A: musu-worker 4 테스트 픽스 | ✅ | AsyncMock 수정 |
| TASK-1B: LocalBackend 에이전트 시딩 | ✅ | setup-company-os.sh, seed-agents.py |
| TASK-1C: MUSU-WORKS 탐색 | ✅ | → Phase 2 TASK-2D 이관 |
| TASK-A1: UI → musu-bridge 라우팅 | ✅ | f8fae9a4 |
| TASK-A2: Delegation Chain 시각화 | ✅ | f8fae9a4 |
| TASK-B1: Pulse 애니메이션 | ✅ | f8fae9a4 |
| TASK-B2: 멀티머신 실 디바이스 카드 | ✅ | 3bd0c078 |
| TASK-G1: 영어/이중언어 랜딩 | ✅ | f8fae9a4 |

---

## 남은 작업 전체 목록

### musu-bee (UI) — 블로커 없음

| ID | 작업 | 예상 | 우선순위 |
|----|------|------|---------|
| B3 | Plan/Approve Gate (PlanCard UI) | 3h | P1 |
| G2 | cmd+K 커맨드 팔레트 | 2h | P2 |

### 플랫폼 — 블로커 없음

| ID | 작업 | 예상 | 우선순위 |
|----|------|------|---------|
| 2D | MUSU-WORKS backport → musu-core company layer | 6h | P2 |
| 2A | musu-connects 완성 (60% → 90%) | 8h | P2 |
| 2B | musu-port Windows/WSL Parity | 4h | P2 |
| 2C | musu-indexer 웹 통합 + pytest suite | 4h | P3 |

### 블로커 대기

| ID | 작업 | 블로커 |
|----|------|--------|
| Ph3 | 멀티머신 실 네트워크 테스트 | 5070Ti SSH |
| Ph4 | Pro/Team 결제 플로우 (Paddle) | Paddle creds |

---

## TASK-B3: Plan/Approve Gate

**왜**: CEO가 "1. 분석 2. 구현 3. 테스트" 형식으로 응답할 때 텍스트로만 표시됨.
실행 전 사용자 승인/거부가 없으면 에이전트가 멋대로 실행 가능. 게이트 필요.

### 구현 상세

**트리거 조건** (`useChat.ts` — `parsePlan(text)`):
```
연속 numbered list: /^\d+\.\s+.{10,}/m 가 2개 이상
또는 "Step \d+:" / "단계 \d+:" 패턴
AND action keyword: execute|run|deploy|commit|실행|배포|커밋|적용
```
두 조건 모두 만족 시에만 PlanCard 렌더 — false positive 최소화.

**타입 추가** (`types/index.ts`):
```typescript
export interface PlanStep {
  id: string;       // `step-${msgId}-${i}`
  text: string;     // numbered list 항목 텍스트
}
export interface MessagePlan {
  steps: PlanStep[];
  status: "pending" | "approved" | "rejected";
}
// Message에 추가:
plan?: MessagePlan;
```

**`parsePlan(msgId, text): MessagePlan | null`** (`useChat.ts`):
```typescript
function parsePlan(msgId: string, text: string): MessagePlan | null {
  const lines = text.split("\n");
  const steps: string[] = [];
  for (const line of lines) {
    const m = /^\s*(\d+)[.)]\s+(.{10,})/.exec(line);
    if (m) steps.push(m[2].trim());
  }
  if (steps.length < 2) return null;
  const lower = text.toLowerCase();
  const hasAction = /execut|run|deploy|commit|실행|배포|커밋|적용/.test(lower);
  if (!hasAction) return null;
  return {
    steps: steps.map((t, i) => ({ id: `step-${msgId}-${i}`, text: t })),
    status: "pending",
  };
}
```

**`PlanCard` 컴포넌트** (`ChatArea.tsx`):
```
┌──────────────────────────────────────┐
│ 📋 Execution Plan  · 3 steps         │
│ ────────────────────────────────────  │
│ ① Analyze codebase dependencies      │
│ ② Refactor ChatArea.tsx              │
│ ③ Run tsc + verify tests             │
│ ────────────────────────────────────  │
│  [✓ Approve & Run]   [✗ Reject]      │
└──────────────────────────────────────┘
```
- 승인 후: 버튼 → "Approved ✓" 텍스트, 배경 green tint
- 거부 후: 버튼 → "Rejected ✗" 텍스트, 배경 red tint
- 승인 시: `sendMessage("/approve " + msgId)` 자동 전송

**변경 파일**:
| 파일 | 작업 |
|------|------|
| `src/types/index.ts` | PlanStep, MessagePlan, Message.plan 추가 |
| `src/lib/useChat.ts` | parsePlan() + agent 응답 수신 시 plan 파싱 |
| `src/components/ChatArea.tsx` | PlanCard 컴포넌트 + MessageBubble에 삽입 |

**검증**: CEO에게 "이 파일 수정해줘" → 단계별 계획 포함 응답 → PlanCard 표시

---

## TASK-G2: cmd+K 커맨드 팔레트

**왜**: 채널 전환, 에이전트 라우팅, slash command를 마우스 없이 키보드만으로 해야
power user 경험. Linear, Slack, Cursor 모두 cmd+K가 핵심 UX.

### 구현 상세

**커맨드 항목 정의** (`CommandPalette.tsx`):
```typescript
type PaletteItem =
  | { kind: "channel"; id: ChannelId; label: string; icon: string }
  | { kind: "command"; label: string; value: string; icon: string };

const ITEMS: PaletteItem[] = [
  { kind: "channel", id: "ceo",      label: "CEO",     icon: "👔" },
  { kind: "channel", id: "cto",      label: "CTO",     icon: "🔧" },
  { kind: "channel", id: "engineer", label: "Engineer", icon: "💻" },
  { kind: "channel", id: "qa",       label: "QA",      icon: "🧪" },
  { kind: "channel", id: "general",  label: "General", icon: "#" },
  { kind: "command", label: "/task add", value: "/task add ", icon: "📋" },
  { kind: "command", label: "/approve",  value: "/approve ",  icon: "✓" },
  { kind: "command", label: "/reject",   value: "/reject ",   icon: "✗" },
  { kind: "command", label: "@route",    value: "@route ",    icon: "📡" },
  { kind: "command", label: "@wiki",     value: "@wiki ",     icon: "📚" },
  { kind: "command", label: "/run",      value: "/run ",      icon: "▶" },
];
```

**동작**:
- `Ctrl+K` / `Cmd+K` → 팔레트 열기
- 입력 즉시 필터링 (label 포함 검색)
- `↑↓` 선택, `Enter` 확정, `Esc` 닫기
- channel 선택 → `onChannelSelect(id)` 호출
- command 선택 → chat input에 value 주입 후 포커스

**overlay 스타일**:
```
position: fixed
top: 20%
left: 50%, transform: translateX(-50%)
width: min(560px, 90vw)
background: #141414
border: 1px solid #2a2a2a
border-radius: 12px
box-shadow: 0 24px 80px rgba(0,0,0,0.7)
backdrop-filter: blur(12px)
z-index: 9999
```

**변경 파일**:
| 파일 | 작업 |
|------|------|
| `src/components/CommandPalette.tsx` | 신규 — 팔레트 컴포넌트 |
| `src/components/AppShell.tsx` | keydown listener + `<CommandPalette>` 마운트 |
| `src/components/ChatArea.tsx` | `inputRef` expose → command 선택 시 input 주입 |

**검증**: Ctrl+K → 팔레트 열림 → "cto" 타이핑 → Enter → CTO 채널 전환

---

## TASK-2D: MUSU-WORKS backport → musu-core company layer

**왜**: musu-core LocalBackend에 company 레이어가 없음.
현재 에이전트가 "회사" 개념 없이 동작. Company OS를 완성하려면 companies 테이블 필요.
MUSU-WORKS에서 설계 완료된 스키마를 musu-core에 추가하는 작업.

**대상 엔티티**:
1. `companies` — id, name, template_key, workspace_id, created_at
2. `company_role_templates` — company_id, role, instructions
3. `company_project_index` — company_id, project_name, status, assigned_to
4. `company_approvals_queue` — id, company_id, task_id, status, requested_by

**구현 경로**:
- musu-core `src/musu_core/backends/local/schema.py` — 4개 테이블 추가 migration
- musu-core `src/musu_core/backends/local/company_ops.py` — CRUD operations
- musu-bridge `src/musu_bridge/routes/companies.py` — GET/POST /api/companies
- musu-bridge `main.py` — router 등록

**검증**: `curl localhost:8070/api/companies` → 목록 반환, musu-core pytest 전체 pass

**선행 조사**: `plans/P1C_musu_works_2026-04-13.md` 참조

---

## TASK-2A: musu-connects 완성 (60% → 90%)

**왜**: P2P 네트워크가 simulated transport 상태. 실제 QUIC 피어 인증 없이는
멀티머신이 "연결된 척"만 하는 것. Phase 3 멀티머신 실 테스트의 기반.

**현재 상태**: QUIC peer authentication simulated, relay fallback 없음

**구현 대상**:
- QUIC peer authentication 실 구현 (`simulated` 제거)
- NAT/relay fallback risk register 문서화
- `cargo test` 신규 테스트 suite (실 연결 smoke test)

**참고**: `musu-connects/` Rust workspace

---

## TASK-2B: musu-port Windows/WSL Parity

**왜**: Windows + WSL 동시 실행 시 경로 번역 버그 남아있음.
musu.pro 데모 시 Windows 유저가 실패하면 안됨.

**대상**:
- Windows listener discovery adapter 완성
- WSL ↔ Windows path translation 검증 (cross-boundary spawn test)
- `OPERATOR_INGRESS_ACCEPTANCE.md` 업데이트

---

## TASK-2C: musu-indexer 웹 통합 + 테스트

**왜**: CLI는 동작하지만 musu-bee의 `/api/wiki` 엔드포인트와 완전히 연결 안됨.
`@wiki` 명령어가 실제 FTS5 검색을 못하고 있음.

**대상**:
- musu-bee `/api/wiki` → musu-indexer SQLite FTS5 직접 쿼리 또는 MCP 프록시
- pytest suite 신규 (현재 0개)

---

## 실행 순서 (우선순위)

```
지금 → B3 Plan/Approve Gate (~3h)
         G2 cmd+K 팔레트 (~2h)
              ↓
         2D MUSU-WORKS backport (~6h)  ← company layer
         2C musu-indexer 웹 통합 (~4h) ← @wiki 실동작
              ↓
         2A musu-connects QUIC (~8h)   ← Phase 3 준비
         2B musu-port WSL parity (~4h)
              ↓
         [블로커 해제 대기]
         Ph3 멀티머신 실 네트워크 (5070Ti SSH 확보 시)
         Ph4 Paddle 결제 플로우 (creds 수령 시)
```

---

## 배포 준비도 로드맵

| 단계 | 조건 | 준비도 |
|------|------|--------|
| 로컬 데모 | 지금 | ✅ 가능 |
| musu.pro 올리기 | B3 + G2 완료 | 🔨 ~5h |
| Company OS 완전체 | 2D 완료 | 🔨 ~6h |
| 멀티머신 실 증명 | 5070Ti SSH + Ph3 | ⏳ 블로커 |
| 유료 출시 | Ph4 Paddle | ⏳ 블로커 |

---

## 현재 코드베이스 상태 (2026-04-14)

| 모듈 | 상태 | 테스트 |
|------|------|--------|
| musu-bee | ✅ tsc clean, Phase 2-Beta 진행 중 | — |
| musu-bridge | ✅ FastAPI 풀 동작 | 3 파일 |
| musu-core | ✅ 231 테스트 all pass | 231 |
| musu-port | ✅ :1355 동작, /health + /peers | Rust |
| musu-worker | ⚠️ 동작, 4 테스트 실패 수정됨 | — |
| musu-connects | ⚠️ 60% — simulated transport | 없음 |
| musu-indexer | ⚠️ CLI 동작, 웹 미연결 | 없음 |
| MUSU-WORKS | ⚠️ 설계 완료, backport 대기 | — |
| MUSU-CRT | ❌ 미구현 | — |
