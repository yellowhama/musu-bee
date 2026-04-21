# Phase 36C: Screen 탭 다중 모니터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Screen 탭에서 다중 모니터를 선택해 캡처할 수 있게 한다.

**Architecture:** `musu-bridge`에 `GET /api/screen/monitors`와 `GET /api/screen/snapshot?monitor=N` 추가. `ScreenClient.tsx`에 모니터 선택 드롭다운 추가. 기존 노드 선택 UI 옆에 배치.

**Tech Stack:** Python (mss), FastAPI, Next.js (React 19), TypeScript

---

## 파일 구조

| 파일 | 동작 |
|------|------|
| `musu-bridge/server.py` | `/api/screen/monitors` + `snapshot?monitor=N` 추가 |
| `vibecode-town/src/app/screen/ScreenClient.tsx` | 모니터 선택 드롭다운 추가 |
| `vibecode-town/src/app/api/bridge/screen/monitors/route.ts` | bridge proxy route (신규) |

---

### Task 1: bridge /api/screen/monitors 엔드포인트

**Files:**
- Modify: `musu-bridge/server.py` — `/api/screen/snapshot` 직전에 삽입

- [ ] **Step 1: `/api/screen/monitors` 엔드포인트 추가**

`screen_snapshot` 함수(라인 1730) 직전에 삽입:

```python
@app.get("/api/screen/monitors")
async def screen_monitors() -> dict:
    """List available monitors on this machine.

    Returns {"monitors": [{"index": 1, "width": 1920, "height": 1080, "left": 0, "top": 0}, ...]}
    Index matches sct.monitors index (1-based for real monitors; 0 = virtual all-in-one).
    """
    display_env = _find_display_env()
    try:
        import mss
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            with mss.mss() as sct:
                result = [
                    {
                        "index": i,
                        "width": m["width"],
                        "height": m["height"],
                        "left": m["left"],
                        "top": m["top"],
                    }
                    for i, m in enumerate(sct.monitors)
                    if i > 0  # skip index 0 (all-in-one virtual)
                ]
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        return {"monitors": result}
    except Exception as exc:
        raise HTTPException(500, detail=f"monitor list failed: {exc}") from exc
```

- [ ] **Step 2: `snapshot?monitor=N` 파라미터 추가**

`screen_snapshot` 함수 시그니처 변경:

기존:
```python
@app.get("/api/screen/snapshot")
async def screen_snapshot() -> dict:
```

변경 후:
```python
@app.get("/api/screen/snapshot")
async def screen_snapshot(monitor: int = 1) -> dict:
```

그리고 `_capture_mss` 함수에 `monitor_index` 파라미터 추가. 현재 `_capture_mss(tmp_png, display_env)` 호출을 `_capture_mss(tmp_png, display_env, monitor)` 로 변경.

`_capture_mss` 함수 시그니처 + 내부 변경:

기존:
```python
def _capture_mss(tmp_png: str, display_env: dict) -> bool:
    """Capture screenshot using python-mss (libX11 direct). Returns True on success."""
    with _mss_lock:
        # mss reads DISPLAY/XAUTHORITY from environment
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            import mss
            import mss.tools
            with mss.mss() as sct:
                monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
```

변경 후:
```python
def _capture_mss(tmp_png: str, display_env: dict, monitor_index: int = 1) -> bool:
    """Capture screenshot using python-mss (libX11 direct). Returns True on success."""
    with _mss_lock:
        # mss reads DISPLAY/XAUTHORITY from environment
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            import mss
            import mss.tools
            with mss.mss() as sct:
                idx = monitor_index if 0 < monitor_index < len(sct.monitors) else (1 if len(sct.monitors) > 1 else 0)
                monitor = sct.monitors[idx]
```

`_do_capture_sync`도 `monitor_index` 전달 필요:

기존:
```python
def _do_capture_sync(display_env: dict, tmp_png: str, tmp_jpg: str) -> bool:
    if _capture_mss(tmp_png, display_env):
```

변경 후:
```python
def _do_capture_sync(display_env: dict, tmp_png: str, tmp_jpg: str, monitor_index: int = 1) -> bool:
    if _capture_mss(tmp_png, display_env, monitor_index):
```

`screen_snapshot`에서 executor 호출도 변경:

기존:
```python
captured = await loop.run_in_executor(None, _do_capture_sync, display_env, tmp_png, tmp_jpg)
```

변경 후:
```python
captured = await loop.run_in_executor(None, _do_capture_sync, display_env, tmp_png, tmp_jpg, monitor)
```

- [ ] **Step 3: bridge 재시작 + 수동 테스트**

```bash
systemctl --user restart musu-bridge && sleep 3
curl -s http://localhost:8070/api/screen/monitors \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" | python3 -m json.tool
```

Expected:
```json
{"monitors": [{"index": 1, "width": 1920, "height": 1080, "left": 0, "top": 0}]}
```

- [ ] **Step 4: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-bridge/server.py
rtk git commit -m "feat(bridge): add /api/screen/monitors + snapshot?monitor=N"
```

---

### Task 2: vibecode-town proxy route

**Files:**
- Create: `vibecode-town/src/app/api/bridge/screen/monitors/route.ts`

- [ ] **Step 1: monitors proxy route 생성**

기존 `src/app/api/bridge/screen/snapshot/route.ts` 패턴을 따른다.

먼저 snapshot route 읽기:
```bash
cat /mnt/f/Aisaak/Projects/vibecode-town/src/app/api/bridge/screen/snapshot/route.ts
```

그 패턴대로 monitors route 생성:

```typescript
// src/app/api/bridge/screen/monitors/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOnlineNodeForRequest } from "@/lib/services/nodeService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const node = searchParams.get("node") ?? "";

  const onlineNode = await getOnlineNodeForRequest(node);
  if (!onlineNode) {
    return NextResponse.json({ error: "No online node found" }, { status: 503 });
  }

  const bridgeToken = process.env.MUSU_BRIDGE_TOKEN ?? "";
  const bridgeUrl = onlineNode.public_url.replace(/\/$/, "");

  try {
    const upstream = await fetch(`${bridgeUrl}/api/screen/monitors`, {
      headers: { Authorization: `Bearer ${bridgeToken}` },
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: 커밋**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
rtk git add src/app/api/bridge/screen/monitors/route.ts
rtk git commit -m "feat(screen): add /api/bridge/screen/monitors proxy route"
```

---

### Task 3: ScreenClient.tsx 모니터 선택 UI

**Files:**
- Modify: `vibecode-town/src/app/screen/ScreenClient.tsx`

- [ ] **Step 1: 모니터 타입 + 상태 추가**

파일 상단 interface 영역에 추가:

```typescript
interface MonitorInfo {
  index: number;
  width: number;
  height: number;
  left: number;
  top: number;
}
```

컴포넌트 상태 추가 (`useState` 목록에):

```typescript
const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
const [selectedMonitor, setSelectedMonitor] = useState<number>(1);
```

- [ ] **Step 2: 모니터 목록 fetch 함수 추가**

`fetchSnapshot` useCallback 아래에 추가:

```typescript
const fetchMonitors = useCallback(async (node: string) => {
  if (!node) return;
  try {
    const res = await fetch(
      `/api/bridge/screen/monitors?node=${encodeURIComponent(node)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const data = await res.json() as { monitors: MonitorInfo[] };
    setMonitors(data.monitors ?? []);
    // Reset to monitor 1 if current selection out of range
    setSelectedMonitor((prev) =>
      data.monitors.some((m) => m.index === prev) ? prev : (data.monitors[0]?.index ?? 1)
    );
  } catch {
    // Ignore — monitors are optional enhancement
  }
}, []);
```

- [ ] **Step 3: 노드 변경 시 모니터 목록 갱신**

기존 `selectedNode` 변경 useEffect (라인 84-87):

```typescript
// Stop if node changes while viewing
useEffect(() => {
  if (viewing) stopViewing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedNode]);
```

변경 후:

```typescript
// Stop + refresh monitors when node changes
useEffect(() => {
  if (viewing) stopViewing();
  void fetchMonitors(selectedNode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedNode]);
```

초기 마운트 시도 (컴포넌트 마운트 useEffect 추가):

```typescript
// Fetch monitors on mount
useEffect(() => {
  void fetchMonitors(selectedNode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 4: snapshot URL에 monitor 파라미터 추가**

기존 fetch URL (라인 35):
```typescript
const res = await fetch(`/api/bridge/screen/snapshot?node=${encodeURIComponent(node)}`, {
```

변경 후:
```typescript
const res = await fetch(
  `/api/bridge/screen/snapshot?node=${encodeURIComponent(node)}&monitor=${selectedMonitor}`,
  {
```

`fetchSnapshot` useCallback deps에 `selectedMonitor` 추가:

기존:
```typescript
}, [fps]);
```

변경 후:
```typescript
}, [fps, selectedMonitor]);
```

- [ ] **Step 5: 모니터 선택 드롭다운 UI 추가**

헤더의 노드 선택기 `</div>` 직후 (라인 ~175)에 추가:

```tsx
{/* Monitor selector — only shown when multiple monitors available */}
{monitors.length > 1 && (
  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
    <span
      style={{
        fontSize: "11px",
        color: "rgba(253,252,240,0.35)",
        fontFamily: "var(--font-jetbrains), monospace",
      }}
    >
      MON
    </span>
    <select
      disabled={viewing}
      value={selectedMonitor}
      onChange={(e) => setSelectedMonitor(Number(e.target.value))}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "6px",
        color: viewing ? "rgba(253,252,240,0.3)" : "#FDFCF0",
        fontSize: "12px",
        fontWeight: 600,
        padding: "4px 8px",
        cursor: viewing ? "default" : "pointer",
        fontFamily: "var(--font-jetbrains), monospace",
        outline: "none",
      }}
    >
      {monitors.map((m) => (
        <option key={m.index} value={m.index} style={{ background: "#2D1D19" }}>
          {`M${m.index} ${m.width}×${m.height}`}
        </option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 6: snapshot bridge route에 monitor 파라미터 전달 확인**

`src/app/api/bridge/screen/snapshot/route.ts` 읽어서 `monitor` query param 전달 여부 확인.

전달 안 되면 URL에 추가:
```typescript
const monitorParam = searchParams.get("monitor") ?? "1";
const upstream = await fetch(
  `${bridgeUrl}/api/screen/snapshot?monitor=${monitorParam}`,
  ...
);
```

- [ ] **Step 7: 커밋**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
rtk git add src/app/screen/ScreenClient.tsx src/app/api/bridge/screen/snapshot/route.ts
rtk git commit -m "feat(screen): add multi-monitor selector to ScreenClient"
```

---

### Task 4: 배포 + 검증

- [ ] **Step 1: vibecode-town 빌드 확인**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
rtk next build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`

- [ ] **Step 2: musu-functions 푸시**

```bash
cd /home/hugh51/musu-functions
rtk git push
```

- [ ] **Step 3: vibecode-town 푸시**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
rtk git push origin main
```

Expected: Vercel 자동 배포 시작

- [ ] **Step 4: 수동 검증**

musu.pro Screen 탭 열기 → 노드 선택 → 모니터가 2개 이상이면 드롭다운 표시 확인
모니터 1개면 드롭다운 숨김 — 깔끔하게 처리됨
