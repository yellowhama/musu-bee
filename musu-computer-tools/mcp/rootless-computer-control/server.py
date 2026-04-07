#!/mnt/wslg/distro/usr/bin/python3
import json
import os
import select
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Union
from uuid import uuid4

import mss
from mcp.server.fastmcp import FastMCP, Image
from PIL import Image as PILImage


ROOT = Path(__file__).resolve().parent
EXTRACT_ROOT = ROOT / "root"
BIN_DIR = EXTRACT_ROOT / "usr" / "bin"
LIB_DIR = EXTRACT_ROOT / "usr" / "lib" / "x86_64-linux-gnu"
SCREENSHOT_DIR = Path(
    os.getenv(
        "COMPUTER_CONTROL_MCP_SCREENSHOT_DIR",
        str(ROOT / "screenshots"),
    )
)
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
HELPER_REQUEST_DIR = ROOT / "helper-requests"
HELPER_REQUEST_DIR.mkdir(parents=True, exist_ok=True)

XDOTOOL = str(BIN_DIR / "xdotool")
WMCTRL = str(BIN_DIR / "wmctrl")
SCROT = str(BIN_DIR / "scrot")
IMLIB2_LOADER_DIR = LIB_DIR / "imlib2" / "loaders"

RUNTIME_ENV = os.environ.copy()
RUNTIME_ENV["DISPLAY"] = os.getenv("DISPLAY", ":0")
RUNTIME_ENV["WAYLAND_DISPLAY"] = os.getenv("WAYLAND_DISPLAY", "wayland-0")
RUNTIME_ENV["LD_LIBRARY_PATH"] = ":".join(
    [
        str(LIB_DIR),
        "/mnt/wslg/distro/usr/lib/x86_64-linux-gnu",
        "/mnt/wslg/distro/lib/x86_64-linux-gnu",
        "/mnt/wslg/distro/usr/lib",
        "/mnt/wslg/distro/lib",
        os.getenv("LD_LIBRARY_PATH", ""),
    ]
).strip(":")
RUNTIME_ENV["PATH"] = ":".join(
    [
        str(BIN_DIR),
        "/mnt/wslg/distro/usr/bin",
        "/mnt/wslg/distro/bin",
        os.getenv("PATH", ""),
    ]
).strip(":")
if IMLIB2_LOADER_DIR.exists():
    RUNTIME_ENV["IMLIB2_LOADER_PATH"] = str(IMLIB2_LOADER_DIR)

mcp = FastMCP("RootlessComputerControl")

# PTY session store: session_id -> Popen handle
_PTY_SESSIONS: dict[str, subprocess.Popen] = {}
_PTY_SESSIONS_LOCK = threading.Lock()

# Spy log store: source -> latest text
_SPY_LOG: dict[str, str] = {}
_SPY_LOG_LOCK = threading.Lock()

TERMINAL_ENGINE = str(
    ROOT.parent.parent / "musu-terminal-engine" / "target" / "release" / "musu-terminal-engine"
)


def _ensure_x11_socket_bridge() -> None:
    target = Path("/mnt/wslg/.X11-unix")
    link = Path("/tmp/.X11-unix")
    if link.exists() or link.is_symlink():
        return
    if target.exists():
        link.symlink_to(target, target_is_directory=True)


def _run(args: List[str]) -> subprocess.CompletedProcess[str]:
    _ensure_x11_socket_bridge()
    return subprocess.run(
        args,
        env=RUNTIME_ENV,
        text=True,
        capture_output=True,
        check=True,
    )


def _button_code(button: str) -> str:
    mapping = {
        "left": "1",
        "middle": "2",
        "right": "3",
        "up": "4",
        "down": "5",
        "left_scroll": "6",
        "right_scroll": "7",
    }
    key = button.lower()
    if key not in mapping:
        raise ValueError(f"Unsupported button: {button}")
    return mapping[key]


def _save_image(image: PILImage.Image, prefix: str) -> Path:
    name = f"{prefix}-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.png"
    path = SCREENSHOT_DIR / name
    image.save(path)
    return path


def _capture_region(region: Optional[dict] = None) -> PILImage.Image:
    temp_path = SCREENSHOT_DIR / f"rootless-computer-control-{uuid4().hex}.png"

    try:
        _capture_with_helper(temp_path)
        with PILImage.open(temp_path) as image:
            captured = image.convert("RGB")
    finally:
        temp_path.unlink(missing_ok=True)

    if region is None:
        return captured

    left = int(region["left"])
    top = int(region["top"])
    width = int(region["width"])
    height = int(region["height"])
    return captured.crop((left, top, left + width, top + height))


def _capture_with_helper(temp_path: Path) -> None:
    request_id = uuid4().hex
    request_path = HELPER_REQUEST_DIR / f"{request_id}.req"
    response_path = HELPER_REQUEST_DIR / f"{request_id}.res"
    request_path.write_text(str(temp_path), encoding="utf-8")
    deadline = time.time() + 10

    try:
        while time.time() < deadline:
            if response_path.exists():
                response = response_path.read_text(encoding="utf-8").strip()
                if response_path.exists():
                    response_path.unlink(missing_ok=True)
                if response == "OK":
                    return
                raise RuntimeError(response or "Screenshot helper failed")
            time.sleep(0.05)
    finally:
        request_path.unlink(missing_ok=True)
        response_path.unlink(missing_ok=True)

    raise RuntimeError(
        "Timed out waiting for screenshot helper. Start scrot-helper.sh first."
    )


def _parse_windows() -> List[dict]:
    output = _run([WMCTRL, "-lGxp"]).stdout
    windows = []
    for line in output.splitlines():
        parts = line.split(None, 8)
        if len(parts) < 9:
            continue
        wid, desktop, x, y, width, height, pid, host, title = parts
        windows.append(
            {
                "id": wid,
                "desktop": int(desktop),
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
                "pid": int(pid) if pid.isdigit() else None,
                "host": host,
                "title": title,
            }
        )
    return windows


def _find_window(title_contains: str) -> dict:
    needle = title_contains.lower()
    for window in _parse_windows():
        if needle in window["title"].lower():
            return window
    raise ValueError(f"No window found containing: {title_contains}")


@mcp.tool()
def get_screen_size() -> str:
    with mss.mss() as sct:
        monitor = sct.monitors[0]
    return json.dumps(
        {
            "width": monitor["width"],
            "height": monitor["height"],
            "left": monitor["left"],
            "top": monitor["top"],
        }
    )


@mcp.tool()
def get_mouse_location() -> str:
    output = _run([XDOTOOL, "getmouselocation", "--shell"]).stdout
    data = {}
    for line in output.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            data[key.lower()] = int(value) if value.isdigit() else value
    return json.dumps(data)


@mcp.tool()
def take_screenshot(
    x: Optional[int] = None,
    y: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    title_contains: Optional[str] = None,
) -> Image:
    region = None
    if title_contains:
        window = _find_window(title_contains)
        region = {
            "left": window["x"],
            "top": window["y"],
            "width": window["width"],
            "height": window["height"],
        }
    elif None not in (x, y, width, height):
        region = {
            "left": int(x),
            "top": int(y),
            "width": int(width),
            "height": int(height),
        }

    image = _capture_region(region)
    path = _save_image(image, "screenshot")
    return Image(str(path))


@mcp.tool()
def move_mouse(x: int, y: int) -> str:
    _run([XDOTOOL, "mousemove", "--sync", str(x), str(y)])
    return f"Moved mouse to ({x}, {y})"


@mcp.tool()
def click_screen(x: int, y: int, button: str = "left") -> str:
    _run([XDOTOOL, "mousemove", "--sync", str(x), str(y)])
    _run([XDOTOOL, "click", _button_code(button)])
    return f"Clicked {button} at ({x}, {y})"


@mcp.tool()
def mouse_down(button: str = "left") -> str:
    _run([XDOTOOL, "mousedown", _button_code(button)])
    return f"Held {button} mouse button"


@mcp.tool()
def mouse_up(button: str = "left") -> str:
    _run([XDOTOOL, "mouseup", _button_code(button)])
    return f"Released {button} mouse button"


@mcp.tool()
def drag_mouse(
    from_x: int,
    from_y: int,
    to_x: int,
    to_y: int,
    duration_ms: int = 250,
    button: str = "left",
) -> str:
    steps = max(1, min(60, duration_ms // 16))
    _run([XDOTOOL, "mousemove", "--sync", str(from_x), str(from_y)])
    _run([XDOTOOL, "mousedown", _button_code(button)])
    for index in range(1, steps + 1):
        x = round(from_x + (to_x - from_x) * index / steps)
        y = round(from_y + (to_y - from_y) * index / steps)
        _run([XDOTOOL, "mousemove", str(x), str(y)])
        time.sleep(duration_ms / 1000 / steps)
    _run([XDOTOOL, "mouseup", _button_code(button)])
    return f"Dragged {button} mouse from ({from_x}, {from_y}) to ({to_x}, {to_y})"


@mcp.tool()
def type_text(text: str, delay_ms: int = 12) -> str:
    _run([XDOTOOL, "type", "--delay", str(delay_ms), "--clearmodifiers", text])
    return f"Typed {len(text)} characters"


@mcp.tool()
def press_keys(keys: Union[str, List[str]]) -> str:
    sequence = keys if isinstance(keys, str) else "+".join(keys)
    _run([XDOTOOL, "key", "--clearmodifiers", sequence])
    return f"Pressed keys: {sequence}"


@mcp.tool()
def scroll_mouse(direction: str = "down", clicks: int = 3) -> str:
    _run([XDOTOOL, "click", "--repeat", str(clicks), _button_code(direction)])
    return f"Scrolled {direction} {clicks} times"


@mcp.tool()
def list_windows() -> str:
    return json.dumps(_parse_windows())


@mcp.tool()
def activate_window(
    title_contains: Optional[str] = None,
    window_id: Optional[str] = None,
) -> str:
    if window_id:
        _run([WMCTRL, "-ia", window_id])
        return f"Activated window {window_id}"
    if not title_contains:
        raise ValueError("Either title_contains or window_id is required")
    window = _find_window(title_contains)
    _run([WMCTRL, "-ia", window["id"]])
    return f"Activated window '{window['title']}'"


@mcp.tool()
def pty_spawn(command: str) -> str:
    """Spawn musu-terminal-engine with the given command. Returns a session_id."""
    session_id = str(uuid4())
    proc = subprocess.Popen(
        [TERMINAL_ENGINE, command],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    with _PTY_SESSIONS_LOCK:
        _PTY_SESSIONS[session_id] = proc
    return session_id


@mcp.tool()
def pty_read(session_id: str, timeout: float = 2.0) -> str:
    """Read the next JSON snapshot line from the PTY session identified by session_id.

    Returns partial output available within `timeout` seconds (default 2s).
    Returns empty string if no data is available before the timeout.
    Raises RuntimeError if the process has terminated.
    """
    with _PTY_SESSIONS_LOCK:
        proc = _PTY_SESSIONS.get(session_id)
    if proc is None:
        raise ValueError(f"Unknown session_id: {session_id}")
    if proc.stdout is None:
        raise RuntimeError("PTY process has no stdout")
    ready, _, _ = select.select([proc.stdout], [], [], timeout)
    if not ready:
        if proc.poll() is not None:
            raise RuntimeError(f"Session {session_id} process has terminated (exit {proc.poll()})")
        return ""
    line = proc.stdout.readline()
    if not line:
        raise RuntimeError(f"Session {session_id} process has terminated (exit {proc.poll()})")
    return line.rstrip("\n")


@mcp.tool()
def pty_write(session_id: str, text: str) -> str:
    """Write text to the PTY session identified by session_id."""
    with _PTY_SESSIONS_LOCK:
        proc = _PTY_SESSIONS.get(session_id)
        if proc is None:
            raise ValueError(f"Unknown session_id: {session_id}")
        if proc.stdin is None:
            raise RuntimeError("PTY process has no stdin pipe")
        try:
            proc.stdin.write(text)
            proc.stdin.flush()
        except (BrokenPipeError, OSError):
            raise RuntimeError(f"Session {session_id} process has terminated")
    return f"Wrote {len(text)} characters to session {session_id}"


@mcp.tool()
def pty_cleanup(session_id: str) -> str:
    """Kill the PTY process for session_id and remove it from the session store."""
    with _PTY_SESSIONS_LOCK:
        proc = _PTY_SESSIONS.pop(session_id, None)
    if proc is None:
        raise ValueError(f"Unknown session_id: {session_id}")
    if proc.poll() is None:
        proc.kill()
        proc.wait()
    return f"Session {session_id} cleaned up"


@mcp.tool()
def spy_ingest_log(source: str, text: str) -> None:
    """Ingest a log entry for the given source into the in-memory spy log store."""
    with _SPY_LOG_LOCK:
        _SPY_LOG[source] = text


@mcp.tool()
def spy_get_snapshot(source: str) -> str:
    """Return the latest spy log entry for the given source, or empty string if not found."""
    with _SPY_LOG_LOCK:
        return _SPY_LOG.get(source, "")


def main() -> None:
    _ensure_x11_socket_bridge()
    mcp.run()


if __name__ == "__main__":
    main()
