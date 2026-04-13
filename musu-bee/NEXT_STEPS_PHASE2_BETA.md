# musu-bee Phase 2-Beta / Gamma — Next Steps

> 작성: 2026-04-14 | Phase 2-Alpha 완료 후
> 선행 조건: musu-bridge :8070, musu-port :1355 동작 중

---

## 현재 상태 (Phase 2-Alpha 완료)

| 항목 | 상태 |
|------|------|
| UI → musu-bridge 에이전트 라우팅 | ✅ `/api/agent-route` |
| Delegation Chain 시각화 | ✅ `DelegationChip` |
| 에이전트 상태 Pulse 애니메이션 | ✅ CSS keyframes |
| 영어/이중언어 랜딩 | ✅ `page.tsx` |
| Multi-machine 디바이스 카드 | ❌ 미완 |
| Plan/Approve Gate | ❌ 미완 |
| cmd+K 커맨드 팔레트 | ❌ 미완 |

---

## TASK-B2: 멀티머신 실 디바이스 카드

**왜**: Sidebar가 현재 mock 데이터 또는 단일 머신만 표시. 실제 musu-port `/devices` 엔드포인트 연동 필요.

**사전 조사 필수**:
```bash
curl http://127.0.0.1:1355/devices | jq .
```
응답 구조 파악 후 `Device` 타입 매핑.

**변경 파일**:

| 파일 | 작업 |
|------|------|
| `src/app/api/device-status/route.ts` | musu-port `/devices` 프록시. 다중 디바이스 배열 처리 |
| `src/lib/useDeviceDiscovery.ts` | `Device[]` 배열 처리, polling 30s interval |
| `src/components/Sidebar.tsx` | 머신 그룹 헤더 (local/remote), Leader badge |
| `src/types/index.ts` | `Device.isRemote?: boolean`, `Device.tailscaleIp?: string` 추가 |

**구현 상세**:
- polling: `setInterval(30_000)` — musu-port는 30s 캐시
- Leader 머신: `device.isLeader === true` → 보라색 badge (이미 구현됨)
- remote 머신: `device.isRemote` → 별도 섹션 "Remote Machines"
- offline 머신도 표시 (회색, stats 생략)

**검증**: dev-start.sh 후 Sidebar에 로컬 머신 카드 정상 표시, stats 실시간 업데이트

---

## TASK-B3: Plan/Approve Gate 재설계

**왜**: CEO가 단계별 계획을 텍스트로 응답할 때 승인/거부 UI가 없음. 현재는 그냥 텍스트 bubble.

**트리거 감지** (useChat.ts):
```
numbered list:
  "1. ..." + "2. ..." (2개 이상 연속)
  또는 "Step 1:" / "단계 1:"
action keywords:
  "실행", "execute", "run", "deploy", "commit"
```

**변경 파일**:

| 파일 | 작업 |
|------|------|
| `src/types/index.ts` | `PlanStep { id, text, status }`, `Message.plan?: Plan` |
| `src/lib/useChat.ts` | `parsePlan(text)` — numbered list 감지 → `plan` 필드 주입 |
| `src/components/ChatArea.tsx` | `PlanCard` 컴포넌트 |

**PlanCard UI**:
```
┌─────────────────────────────────┐
│ 📋 CEO Plan  (3 steps)          │
│ ─────────────────────────────── │
│ 1. 코드 분석 및 의존성 파악      │
│ 2. ChatArea.tsx 리팩토링        │
│ 3. tsc + 테스트 검증            │
│ ─────────────────────────────── │
│  [✓ Approve]    [✗ Reject]      │
└─────────────────────────────────┘
```

- Approve → `/approve <msg_id>` command 자동 전송
- Reject → `/reject <msg_id>` command 자동 전송
- 승인 후 카드 상태 → "Approved ✓" (비활성화)

---

## TASK-G2: cmd+K 커맨드 팔레트

**왜**: 채널 전환, 에이전트 라우팅, slash command 검색을 키보드로 해야 power user 경험.

**변경 파일**:

| 파일 | 작업 |
|------|------|
| `src/components/CommandPalette.tsx` | 신규. cmd+K overlay |
| `src/components/AppShell.tsx` | `keydown` listener: `(e.metaKey || e.ctrlKey) && e.key === "k"` |

**커맨드 팔레트 항목**:
```
> ceo          → ceo 채널로 이동
> cto          → cto 채널로 이동
> /task add    → 태스크 생성
> /approve     → 승인
> /route       → 라우팅 명령
> @wiki        → wiki 검색
```

**구현**:
- `useState<boolean>` open/close
- `useRef<HTMLInputElement>` for search input autofocus
- filter: `items.filter(i => i.label.includes(query))`
- keyboard nav: ↑↓ select, Enter confirm, Esc close
- overlay: `position: fixed`, `backdrop-filter: blur(4px)`

---

## 실행 순서

```
B2 (Multi-machine, ~2h)
  → B3 (Plan/Approve Gate, ~3h)
      → G2 (cmd+K, ~2h)
```

B2 먼저: `/devices` 엔드포인트 실제 응답 구조에 따라 타입 정의가 달라지고,
이 타입이 B3/G2 관련 context에 영향.

---

## 품질 체크리스트

Phase 2-Beta 완료 전 확인:

- [ ] `rtk tsc --noEmit` 통과
- [ ] CEO 채널 채팅 → 실제 응답 표시
- [ ] DelegationChip: "CTO에게 위임" 텍스트 → chip 표시
- [ ] Sidebar pulse: 에이전트 active 시 green dot animation
- [ ] Multi-machine: 2대 이상 시 Sidebar 정상 렌더
- [ ] PlanCard: numbered list 응답 → Approve/Reject 버튼 표시
- [ ] cmd+K: 팔레트 열림/닫힘, 채널 전환 동작

---

## 배포 준비도 평가

| 기준 | 현재 | Beta 완료 시 |
|------|------|-------------|
| 에이전트 실행 | ✅ | ✅ |
| 실시간 UI | ❌ polling | polling (WS는 Phase 3) |
| 멀티머신 | ❌ | ✅ |
| 승인 게이트 | ❌ | ✅ |
| 커맨드 팔레트 | ❌ | ✅ |
| 랜딩 영어화 | ✅ | ✅ |
| **musu.pro 올릴 수 있나** | 로컬 데모 가능 | **YES** |
