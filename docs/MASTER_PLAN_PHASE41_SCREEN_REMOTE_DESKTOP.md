# Phase 41 마스터 플랜 — 진짜 원격 데스크톱 (noVNC + x11vnc)

**날짜**: 2026-04-22
**목표**: HTTP 폴링 스크린샷 → 진짜 인터랙티브 원격 데스크톱으로 교체
**기술**: x11vnc (VNC 서버) + FastAPI WebSocket 프록시 + noVNC (브라우저 VNC 클라이언트)

---

## 문제 정의

현재 `/api/screen/snapshot`: mss/ffmpeg/scrot → base64 JPEG → 1~4 FPS 슬라이드쇼.
마우스/키보드 입력 없음. 구글 크롬 원격 데스크탑이 아님.

---

## 아키텍처

```
[Browser noVNC RFB.js]
    ↕ WebSocket (RFB over WS)
[musu-bridge :8070 /api/screen/ws-vnc?token=XXX]
    ↕ TCP asyncio stream
[x11vnc :5900  (localhost only, -nopw)]
    ↕ X11
[실제 DISPLAY :0 화면]
```

**핵심 설계 결정:**
- musu-bridge가 noVNC 정적 파일도 서빙 (`/screen/novnc/`)
- 브라우저는 `{public_url}/screen/novnc/launcher.html?token=XXX`를 **새 탭**으로 열어서 접속
- 새 탭이 HTTP 페이지이므로 `ws://` 연결 — mixed-content 문제 없음
- vibecode-town은 token만 발급해서 URL 전달, WS는 직접 안 건드림

---

## 파일 변경 목록

| 파일 | 동작 | 비고 |
|------|------|------|
| `musu-bridge/static/novnc/` | 신규 (복사) | noVNC core + vnc.html + app/ |
| `musu-bridge/static/novnc/launcher.html` | 신규 | 토큰 파라미터 읽고 RFB 자동 연결 |
| `musu-bridge/screen_vnc.py` | 신규 | x11vnc 프로세스 관리 + WS 프록시 + 토큰 저장소 |
| `musu-bridge/server.py` | 수정 | StaticFiles mount + screen_vnc 엔드포인트 import |
| `musu-bridge/tests/test_screen_vnc.py` | 신규 | 단위 테스트 |
| `vibecode-town/src/app/screen/page.tsx` | 신규 | ScreenPage 컴포넌트 |
| `vibecode-town/src/app/api/bridge/screen/token/route.ts` | 신규 | 토큰 발급 프록시 |

---

## Task 순서

```
Task 1: screen_vnc.py — x11vnc 프로세스 관리
Task 2: screen_vnc.py — WS VNC 프록시 엔드포인트
Task 3: screen_vnc.py — 토큰 발급/검증
Task 4: noVNC 정적 파일 + launcher.html
Task 5: server.py — StaticFiles 마운트 + 엔드포인트 등록
Task 6: 테스트
Task 7: vibecode-town — API 라우트 + Screen 페이지
```

---

## Task 1: x11vnc 프로세스 관리

**파일:** `musu-bridge/screen_vnc.py` (신규)

```python
"""VNC lifecycle manager and WebSocket proxy for musu-bridge screen feature."""
from __future__ import annotations
import asyncio, os, shutil, signal, subprocess, time
from typing import Optional

# ── x11vnc lifecycle ──────────────────────────────────────────────────────────
_vnc_proc: Optional[subprocess.Popen] = None
VNC_PORT = int(os.getenv("MUSU_VNC_PORT", "5900"))

def is_vnc_running() -> bool:
    return _vnc_proc is not None and _vnc_proc.poll() is None

def get_vnc_status() -> dict:
    if is_vnc_running():
        return {"running": True, "pid": _vnc_proc.pid, "port": VNC_PORT}
    return {"running": False, "pid": None, "port": VNC_PORT}

def start_vnc(display: str = ":0") -> dict:
    global _vnc_proc
    if is_vnc_running():
        return {"ok": True, "already_running": True, **get_vnc_status()}
    if not shutil.which("x11vnc"):
        raise RuntimeError("x11vnc not found — run: sudo apt install x11vnc")
    _vnc_proc = subprocess.Popen(
        [
            "x11vnc", "-display", display, "-localhost",
            "-nopw", "-rfbport", str(VNC_PORT),
            "-forever", "-shared", "-noxdamage", "-noxfixes",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # wait up to 2s for x11vnc to open its port
    for _ in range(20):
        import socket
        try:
            with socket.create_connection(("127.0.0.1", VNC_PORT), timeout=0.1):
                break
        except OSError:
            time.sleep(0.1)
    return {"ok": True, "already_running": False, **get_vnc_status()}

def stop_vnc() -> dict:
    global _vnc_proc
    if _vnc_proc and _vnc_proc.poll() is None:
        _vnc_proc.send_signal(signal.SIGTERM)
        try:
            _vnc_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _vnc_proc.kill()
    _vnc_proc = None
    return {"ok": True, "running": False}
```

---

## Task 2: WebSocket VNC 프록시

**파일:** `musu-bridge/screen_vnc.py` (계속)

```python
# ── WebSocket ↔ TCP VNC proxy ─────────────────────────────────────────────────
from fastapi import WebSocket, WebSocketDisconnect

async def ws_vnc_proxy(websocket: WebSocket, token: str) -> None:
    """Bridge browser WebSocket to x11vnc TCP:5900."""
    from screen_vnc import consume_token  # circular safe
    if not consume_token(token):
        await websocket.close(code=4403, reason="invalid or expired token")
        return
    if not is_vnc_running():
        await websocket.close(code=4503, reason="VNC server not running")
        return
    await websocket.accept(subprotocol="binary")
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", VNC_PORT), timeout=5
        )
    except Exception as exc:
        await websocket.close(code=4503, reason=f"VNC connect failed: {exc}")
        return

    async def browser_to_vnc():
        try:
            while True:
                data = await websocket.receive_bytes()
                writer.write(data)
                await writer.drain()
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            writer.close()

    async def vnc_to_browser():
        try:
            while True:
                data = await asyncio.wait_for(reader.read(65536), timeout=30)
                if not data:
                    break
                await websocket.send_bytes(data)
        except (WebSocketDisconnect, asyncio.TimeoutError, Exception):
            pass

    await asyncio.gather(browser_to_vnc(), vnc_to_browser(), return_exceptions=True)
    try:
        await websocket.close()
    except Exception:
        pass
```

---

## Task 3: 토큰 발급/검증

**파일:** `musu-bridge/screen_vnc.py` (계속)

```python
# ── One-time token store ──────────────────────────────────────────────────────
import secrets
from collections import OrderedDict

_tokens: "OrderedDict[str, float]" = OrderedDict()  # token → expiry_ts
TOKEN_TTL = 60  # seconds

def issue_token() -> str:
    _purge_expired_tokens()
    tok = secrets.token_urlsafe(32)
    _tokens[tok] = time.time() + TOKEN_TTL
    return tok

def consume_token(token: str) -> bool:
    """Return True and delete the token if valid, False otherwise."""
    _purge_expired_tokens()
    if token in _tokens and _tokens[token] > time.time():
        del _tokens[token]
        return True
    return False

def _purge_expired_tokens() -> None:
    now = time.time()
    expired = [k for k, v in _tokens.items() if v <= now]
    for k in expired:
        del _tokens[k]
```

---

## Task 4: noVNC 정적 파일 + launcher.html

**실행:** noVNC 파일 복사

```bash
# musu-bridge/static/novnc/ 에 필요한 파일 복사
mkdir -p musu-bridge/static/novnc
cp -r ~/references_AI/webrtc_remote_desktop_oss/noVNC/core musu-bridge/static/novnc/
cp -r ~/references_AI/webrtc_remote_desktop_oss/noVNC/vendor musu-bridge/static/novnc/
cp -r ~/references_AI/webrtc_remote_desktop_oss/noVNC/app musu-bridge/static/novnc/
cp ~/references_AI/webrtc_remote_desktop_oss/noVNC/vnc.html musu-bridge/static/novnc/vnc.html
```

**파일:** `musu-bridge/static/novnc/launcher.html` (신규)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MUSU Remote Desktop</title>
<style>
  body { margin: 0; background: #1a1a2e; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: #fff; font-family: monospace; }
  #status { margin-bottom: 12px; font-size: 14px; opacity: 0.7; }
  #canvas-container { width: 100vw; height: 100vh; position: fixed; top: 0; left: 0; }
  #rfb-canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="status">Connecting...</div>
<div id="canvas-container"></div>
<script type="module">
import RFB from './core/rfb.js';
const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';
const host = window.location.hostname;
const port = window.location.port;
const wsUrl = `ws://${host}:${port}/api/screen/ws-vnc?token=${encodeURIComponent(token)}`;
const container = document.getElementById('canvas-container');
const statusEl = document.getElementById('status');
const rfb = new RFB(container, wsUrl, { wsProtocols: ['binary'] });
rfb.scaleViewport = true;
rfb.resizeSession = false;
rfb.addEventListener('connect', () => { statusEl.style.display = 'none'; });
rfb.addEventListener('disconnect', (e) => { statusEl.textContent = 'Disconnected: ' + (e.detail?.reason || ''); });
rfb.addEventListener('credentialsrequired', () => { rfb.sendCredentials({ password: '' }); });
</script>
</body>
</html>
```

---

## Task 5: server.py 수정

**추가할 내용:**

```python
# imports 상단에 추가
from fastapi.staticfiles import StaticFiles
from fastapi import WebSocket
import screen_vnc

# lifespan 또는 startup에 추가
app.mount("/screen/novnc", StaticFiles(directory="static/novnc", html=True), name="novnc")

# 엔드포인트 추가 (screen/snapshot 근처)
@app.post("/api/screen/vnc/start")
async def screen_vnc_start(display: str = Query(default=":0"), _auth=Depends(require_bearer_token)) -> dict:
    try:
        return screen_vnc.start_vnc(display)
    except RuntimeError as exc:
        raise HTTPException(503, detail=str(exc)) from exc

@app.post("/api/screen/vnc/stop")
async def screen_vnc_stop(_auth=Depends(require_bearer_token)) -> dict:
    return screen_vnc.stop_vnc()

@app.get("/api/screen/vnc/status")
async def screen_vnc_status(_auth=Depends(require_bearer_token)) -> dict:
    return screen_vnc.get_vnc_status()

@app.get("/api/screen/vnc/token")
async def screen_vnc_token(_auth=Depends(require_bearer_token)) -> dict:
    """Issue a one-time WebSocket token (60s TTL)."""
    tok = screen_vnc.issue_token()
    return {"token": tok, "launcher_path": f"/screen/novnc/launcher.html?token={tok}"}

@app.websocket("/api/screen/ws-vnc")
async def ws_vnc(websocket: WebSocket, token: str = Query(...)):
    await screen_vnc.ws_vnc_proxy(websocket, token)
```

---

## Task 6: 테스트

**파일:** `musu-bridge/tests/test_screen_vnc.py`

```python
"""Tests for screen VNC token/lifecycle logic."""
from __future__ import annotations
import os
os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")

import time
import screen_vnc

def test_issue_and_consume_token():
    tok = screen_vnc.issue_token()
    assert tok
    assert screen_vnc.consume_token(tok) is True

def test_token_is_single_use():
    tok = screen_vnc.issue_token()
    screen_vnc.consume_token(tok)
    assert screen_vnc.consume_token(tok) is False

def test_invalid_token_rejected():
    assert screen_vnc.consume_token("garbage") is False

def test_expired_token_rejected():
    tok = screen_vnc.issue_token()
    # Override expiry to past
    screen_vnc._tokens[tok] = time.time() - 1
    assert screen_vnc.consume_token(tok) is False

def test_vnc_status_when_stopped():
    screen_vnc.stop_vnc()
    status = screen_vnc.get_vnc_status()
    assert status["running"] is False

def test_start_vnc_fails_without_x11vnc(monkeypatch):
    import shutil
    monkeypatch.setattr(shutil, "which", lambda _: None)
    try:
        screen_vnc.start_vnc()
        assert False, "should have raised"
    except RuntimeError as exc:
        assert "x11vnc not found" in str(exc)
```

---

## Task 7: vibecode-town

### API 라우트

**파일:** `src/app/api/bridge/screen/token/route.ts` (신규)

```typescript
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  // 기존 delegate/route.ts 패턴 그대로 따름
  const cookieHeader = req.headers.get("cookie") ?? "";
  // 1. onlineNode 조회 (기존 helper)
  // 2. bridgeToken 조회
  // 3. forward to bridge /api/screen/vnc/token
  // TODO: 세부 구현은 세부 플랜에서
}
```

### Screen 페이지

**파일:** `src/app/screen/page.tsx` (신규)

```typescript
// ScreenPage: 노드 선택 → 토큰 발급 → 새 탭 open
// TODO: 세부 구현은 세부 플랜에서
```

---

## 검증 체크리스트

1. `sudo apt install x11vnc` (설치 확인)
2. `POST /api/screen/vnc/start` → `{"running": true, "pid": ...}`
3. `GET /api/screen/vnc/token` → `{"token": "...", "launcher_path": "/screen/novnc/launcher.html?token=..."}`
4. 브라우저에서 `http://{node-ip}:8070/screen/novnc/launcher.html?token=...` 열기
5. 실제 화면 표시 + 마우스/키보드 입력 동작
6. 토큰 재사용 → `4403 invalid or expired token`
7. musu-bridge 테스트: `pytest musu-bridge/tests/test_screen_vnc.py -v`

---

## Non-Goals

- HTTPS/WSS 지원 (musu-connects TLS는 별도 Phase)
- 멀티 모니터 전환 UI
- VNC 비밀번호 설정 UI (현재 nopw — 내부 localhost 연결이므로 안전)
- 외부 인터넷에서 직접 접속 (Tailscale/mesh 내부 접속 상정)

---

## 다음 Phase

- **Phase 42**: VNC WSS 지원 (TLS 추가 또는 musu-connects 터널)
- **Phase 43**: vibecode-town 임베드 iframe 버전 (같은 탭에서 열기)
