"""Screen capture backends for musu-bridge.

Extracted from server.py. Provides mss → ffmpeg → scrot fallback chain.
"""
from __future__ import annotations

import logging
import os
import threading

logger = logging.getLogger("musu.screen_capture")

_mss_lock = threading.Lock()


def _find_display_env() -> dict:
    """Return dict with DISPLAY and XAUTHORITY set, or empty dict if not found."""
    import glob
    env: dict = {}

    # DISPLAY: check env, then X11 lock files
    display = os.environ.get("DISPLAY", "")
    if not display:
        locks = sorted(glob.glob("/tmp/.X*-lock"))
        if locks:
            num = locks[0].replace("/tmp/.X", "").replace("-lock", "")
            display = f":{num}"
        else:
            display = ":0"
    env["DISPLAY"] = display

    # XAUTHORITY: check env first, then common paths
    xauth = os.environ.get("XAUTHORITY", "")
    if not xauth or not os.path.exists(xauth):
        candidates = [
            os.path.expanduser("~/.Xauthority"),
            f"/run/user/{os.getuid()}/gdm/Xauthority",
            f"/run/user/{os.getuid()}/xauthority",
        ] + sorted(glob.glob("/tmp/xauth_*"), reverse=True)
        for c in candidates:
            if os.path.exists(c):
                xauth = c
                break
    if xauth:
        env["XAUTHORITY"] = xauth

    return env


def _capture_mss(tmp_png: str, display_env: dict, monitor_index: int = 1) -> bool:
    """Capture screenshot using python-mss (libX11 direct). Returns True on success."""
    with _mss_lock:
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            import mss
            import mss.tools
            with mss.mss() as sct:
                idx = monitor_index if 0 < monitor_index < len(sct.monitors) else (1 if len(sct.monitors) > 1 else 0)
                monitor = sct.monitors[idx]
                img = sct.grab(monitor)
                mss.tools.to_png(img.rgb, img.size, output=tmp_png)
            return os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 0
        except Exception as _exc:
            logger.debug("_capture_mss failed: %s", _exc)
            return False
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


def _png_to_jpeg(png_path: str, jpg_path: str, quality: int = 65) -> bool:
    """Convert PNG to JPEG via Pillow. Returns True on success."""
    try:
        from PIL import Image
        with Image.open(png_path) as im:
            im.convert("RGB").save(jpg_path, "JPEG", quality=quality, optimize=True)
        return True
    except Exception as _exc:
        logger.debug("_png_to_jpeg failed: %s", _exc)
        return False


def _capture_ffmpeg(tmp_jpg: str, display_env: dict) -> bool:
    """Capture screenshot using ffmpeg x11grab. Returns True on success."""
    import subprocess
    import shutil as _shutil
    if not _shutil.which("ffmpeg"):
        return False
    display = display_env.get("DISPLAY", ":0")
    base_display = display.split(".")[0]
    env = os.environ.copy()
    env.update(display_env)
    res = "1920x1080"
    if _shutil.which("xdpyinfo"):
        try:
            import subprocess as _sp2
            out = _sp2.run(["xdpyinfo", "-display", base_display],
                           capture_output=True, text=True, timeout=3,
                           env={**os.environ, **display_env}).stdout
            for line in out.splitlines():
                if "dimensions:" in line:
                    res = line.split()[1]
                    break
        except Exception:
            pass
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "x11grab", "-video_size", res,
             "-i", f"{base_display}.0", "-vframes", "1", "-q:v", "3", tmp_jpg],
            env=env, timeout=15, check=True, capture_output=True,
        )
        return os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 0
    except Exception as _exc:
        logger.debug("_capture_ffmpeg failed: %s", _exc)
        return False


def _capture_scrot(tmp_jpg: str, display_env: dict) -> bool:
    """Capture screenshot using scrot. Returns True on success."""
    import subprocess
    import shutil
    if not shutil.which("scrot"):
        return False
    env = os.environ.copy()
    env.update(display_env)
    try:
        subprocess.run(
            ["scrot", "-q", "65", "-o", tmp_jpg],
            env=env, timeout=10, check=True, capture_output=True,
        )
        return os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 0
    except Exception as _exc:
        logger.debug("_capture_scrot failed: %s", _exc)
        return False


def _do_capture_sync(display_env: dict, tmp_png: str, tmp_jpg: str, monitor_index: int = 1) -> bool:
    """Run the mss->ffmpeg->scrot fallback chain synchronously. Returns True on success."""
    if _capture_mss(tmp_png, display_env, monitor_index) and _png_to_jpeg(tmp_png, tmp_jpg):
        return True
    if _capture_ffmpeg(tmp_jpg, display_env):
        return True
    if _capture_scrot(tmp_jpg, display_env):
        return True
    return False
