#!/usr/bin/env python3
import json
import sys
import urllib.request


BASE = "http://127.0.0.1:8788/MUSU-CRT"


def fetch_text(path: str) -> str:
    with urllib.request.urlopen(f"{BASE}{path}") as response:
        if response.status != 200:
            raise RuntimeError(f"{path} returned {response.status}")
        return response.read().decode("utf-8")


def fetch_json(path: str):
    return json.loads(fetch_text(path))


def main() -> int:
    index_html = fetch_text("/harness/canonical/index.html")
    app_js = fetch_text("/harness/canonical/app.js")
    styles_css = fetch_text("/harness/canonical/styles.css")
    signaling = fetch_json("/mock/signaling_fixture.json")
    stream = fetch_json("/mock/stream_lifecycle_fixture.json")
    remote = fetch_json("/mock/remote_session_fixture.json")
    lane2 = fetch_json("/mock/lane2_live_proof_fixture.json")

    checks = {
        "index_has_root_marker": 'data-testid="crt-canonical-root"' in index_html,
        "index_has_ready_marker": 'data-testid="crt-canonical-ready"' in index_html,
        "index_has_summary_marker": 'data-testid="crt-canonical-summary"' in index_html,
        "app_has_smoke_global": "__MUSU_CRT_CANONICAL_SMOKE__" in app_js,
        "app_has_render_summary": "renderSummary(summary)" in app_js,
        "styles_has_summary_grid": ".summary-grid" in styles_css,
        "signaling_session_ok": signaling.get("session_id") == "crt-session-alpha",
        "stream_ready_frame": stream.get("last_frame", {}).get("status") == "ready",
        "stream_timeline_present": len(stream.get("timeline", [])) >= 3,
        "remote_fixture_session_ok": remote.get("webrtc_session_id") == "crt-session-alpha",
        "remote_fixture_attach_ok": remote.get("attach_result", {}).get("status") == "active",
        "remote_fixture_close_ok": remote.get("close_result", {}).get("status") == "closed",
        "index_has_remote_panel": "Remote Session State" in index_html,
        "app_has_remote_state": "remoteAttachState" in app_js and "remoteCloseState" in app_js,
        "app_uses_remote_runtime_module": 'from "./remote_session_runtime.js"' in app_js,
        "index_has_lane2_panel": "Lane-2 Remote Operator View" in index_html,
        "app_has_lane2_remote_state": "lane2RemoteState" in app_js,
        "app_uses_lane2_runtime_module": 'from "./lane2_remote_read_runtime.mjs"' in app_js,
        "lane2_fixture_has_selected_service": lane2.get("selected_service") == "demo-api",
        "lane2_fixture_has_pairing_session": lane2.get("snapshot", {}).get("pairing_session_id")
        == "session-a",
    }

    failures = [name for name, ok in checks.items() if not ok]
    print(json.dumps({"checks": checks, "failures": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
