# TASK-G2: cmd+K 커맨드 팔레트 세부 구현 계획

> 작성: 2026-04-14 | 우선순위: P2 | 예상: 2h
> 선행: TASK-B3 완료 ✅

---

## 목적

채널 전환 + slash command 입력을 마우스 없이 키보드만으로.
Linear, Slack, Cursor 모두 cmd+K가 핵심 power-user UX.

---

## 변경 파일

| 파일 | 작업 |
|------|------|
| `musu-bee/src/components/CommandPalette.tsx` | 신규 — 팔레트 오버레이 컴포넌트 |
| `musu-bee/src/components/AppShell.tsx` | Ctrl/Cmd+K 리스너 + `<CommandPalette>` 마운트 |
| `musu-bee/src/components/ChatArea.tsx` | `inputRef` prop 추가 → textarea에 attach |

---

## 1. CommandPalette.tsx (신규)

### Props interface
```typescript
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onChannelSelect: (id: ChannelId) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}
```

### 팔레트 아이템 정의
```typescript
type PaletteItem =
  | { kind: "channel"; id: ChannelId; label: string; icon: string }
  | { kind: "command"; label: string; value: string; icon: string };

const ITEMS: PaletteItem[] = [
  { kind: "channel", id: "ceo",      label: "CEO",      icon: "👔" },
  { kind: "channel", id: "cto",      label: "CTO",      icon: "🔧" },
  { kind: "channel", id: "engineer", label: "Engineer",  icon: "💻" },
  { kind: "channel", id: "cos",      label: "CoS",       icon: "🗂" },
  { kind: "channel", id: "qa",       label: "QA",        icon: "🧪" },
  { kind: "channel", id: "worker",   label: "Worker",    icon: "⚙️" },
  { kind: "channel", id: "general",  label: "General",   icon: "#" },
  { kind: "channel", id: "dev",      label: "Dev",       icon: "🛠" },
  { kind: "channel", id: "tasks",    label: "Tasks",     icon: "📋" },
  { kind: "channel", id: "alerts",   label: "Alerts",    icon: "🔔" },
  { kind: "command", label: "/task add",  value: "/task add ",  icon: "📌" },
  { kind: "command", label: "/approve",   value: "/approve ",   icon: "✓" },
  { kind: "command", label: "/reject",    value: "/reject ",    icon: "✗" },
  { kind: "command", label: "@route",     value: "@route ",     icon: "📡" },
  { kind: "command", label: "@wiki",      value: "@wiki ",      icon: "📚" },
  { kind: "command", label: "/run",       value: "/run ",       icon: "▶" },
];
```

### 동작
- 검색: query → ITEMS filter (label.toLowerCase().includes(query))
- 키보드: `↑↓` 선택, `Enter` 확정, `Esc` 닫기
- channel 선택: `onChannelSelect(item.id)` + `onClose()`
- command 선택: `inputRef.current.value = item.value` + `inputRef.current.focus()` + `onClose()`
  - React state도 업데이트 필요 — 대신 ChatArea에서 inputRef change event dispatch

### 오버레이 스타일
```
position: fixed
top: 20%
left: 50%, transform: translateX(-50%)
width: min(560px, 90vw)
background: #141414
border: 1px solid #2a2a2a
border-radius: 12px
box-shadow: 0 24px 80px rgba(0,0,0,0.7)
z-index: 9999
```

### 검색 input 스타일
```
width: 100%
background: transparent
border: none
border-bottom: 1px solid #2a2a2a
color: #e5e7eb
font-size: 15px
padding: 14px 16px
outline: none
placeholder: "Search channels or commands..."
```

### 아이템 렌더
- hover/selected: `background: #1e1e1e`, `color: #f3f4f6`
- unselected: `color: #9ca3af`
- icon: 12px span + 8px gap + label

### Backdrop
- `position: fixed, inset: 0, background: transparent` — 클릭 시 onClose()

---

## 2. AppShell.tsx 수정

```typescript
// state 추가
const [showPalette, setShowPalette] = useState(false);
const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

// useEffect — keydown listener
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setShowPalette((prev) => !prev);
    }
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

마운트:
```tsx
{showPalette && (
  <CommandPalette
    open={showPalette}
    onClose={() => setShowPalette(false)}
    onChannelSelect={(id) => { handleChannelSelect(id); setShowPalette(false); }}
    inputRef={chatInputRef}
  />
)}
```

ChatArea에 prop 추가:
```tsx
<ChatArea
  ...기존 props...
  inputRef={chatInputRef}
/>
```

---

## 3. ChatArea.tsx 수정

### Props 추가
```typescript
interface ChatAreaProps {
  ...기존...
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}
```

### textarea에 ref attach
```tsx
<textarea
  ref={inputRef}
  value={input}
  onChange={(e) => setInput(e.target.value)}
  ...기존 props...
/>
```

### Command 주입 처리
CommandPalette가 inputRef에 직접 value를 쓰면 React state와 분리됨.
대신 input event dispatch:
```typescript
// CommandPalette.tsx에서 command 선택 시:
if (inputRef.current) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value"
  )?.set;
  nativeInputValueSetter?.call(inputRef.current, item.value);
  inputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
  inputRef.current.focus();
}
```
단, React onChange가 onInput보다 선호되므로 simpler 방법:
**ChatArea에 `onInjectText` prop 추가** 대신,
inputRef를 통해 setInput을 트리거하는 방법으로:
AppShell에서 `chatInputRef`와 별개로 `setChatInput` 콜백을 CommandPalette에 전달.

**더 단순한 방법**: `inputRef` 대신 AppShell에서 관리하는 `chatInputValue` state + setter를 ChatArea에 optional로 내려주고, CommandPalette가 setter를 직접 호출.

**최종 결정 (단순성 우선)**:
- ChatArea에 `externalInput?: string` + `onExternalInputConsumed?: () => void` prop 추가
- AppShell state: `[paletteInjection, setPaletteInjection] = useState("")`
- CommandPalette command 선택 시: `setPaletteInjection(item.value)` + `onClose()`
- ChatArea: `useEffect(() => { if (externalInput) { setInput(externalInput); onExternalInputConsumed?.(); } }, [externalInput])`
- 그 다음 focus textarea

**또는 가장 단순**: `inputRef`를 ChatArea textarea에 붙이고, CommandPalette에서 `React.useImperativeHandle` 없이 그냥:
```typescript
// AppShell에서
const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
// CommandPalette command 선택 시
// chatInputRef.current.value 를 바꾸면 React controlled input과 충돌
```

**결론: AppShell에 `injectedText` state 방식이 가장 clean.**

---

## 구현 순서

1. `CommandPalette.tsx` 생성 (자급자족 컴포넌트)
2. `ChatArea.tsx` — `externalInput?` + `onExternalInputConsumed?` prop 추가, useEffect로 setInput 처리, textarea focus
3. `AppShell.tsx` — keydown listener, showPalette state, paletteInjection state, CommandPalette 마운트

---

## CEO에게 전달할 태스크 설명

```
TASK-G2: cmd+K 커맨드 팔레트 구현

목표: Ctrl+K / Cmd+K로 채널 전환 + slash command 주입.

변경 파일:
1. musu-bee/src/components/CommandPalette.tsx (신규)
2. musu-bee/src/components/AppShell.tsx (수정)
3. musu-bee/src/components/ChatArea.tsx (수정)

세부 구현 스펙: plans/P2G2_command_palette_2026-04-14.md 참조

검증:
- Ctrl+K → 팔레트 오픈
- "cto" 타이핑 → CTO 채널 항목 필터
- Enter → CTO 채널로 전환
- "/approve" 타이핑 → command 선택 → chat input에 "/approve " 주입
- Esc → 팔레트 닫힘
```

---

## 검증 기준

| 시나리오 | 기대 결과 |
|----------|-----------|
| Ctrl+K 누름 | 팔레트 오픈 |
| "cto" 입력 | CTO 채널 항목 표시 |
| Enter 확정 | CTO 채널 전환, 팔레트 닫힘 |
| "/approve" → 선택 | 채팅 input에 "/approve " 주입 + 포커스 |
| Esc | 팔레트 닫힘 |
| Cmd+K (Mac) | 동일하게 동작 |
| backdrop 클릭 | 팔레트 닫힘 |

---

## 제외 범위

- 최근 사용 히스토리 (복잡도 증가)
- 아이콘 라이브러리 추가 (emoji로 충분)
- 에이전트 상태 표시 (팔레트 안에)
