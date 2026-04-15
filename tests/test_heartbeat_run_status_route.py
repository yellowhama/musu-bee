import json
import os
import urllib.error
import urllib.request
import uuid


def _normalize_base_url() -> str:
    raw = os.getenv("PAPERCLIP_API_URL", "http://127.0.0.1:3100").rstrip("/")
    return raw if raw.endswith("/api") else f"{raw}/api"


BASE_URL = _normalize_base_url()
AGENT_ID = os.getenv("FE_AGENT_ID", "7a87bcf2-6b89-498e-b295-d80d53710bd0")


def _request_json(path: str, method: str = "GET", body: dict | None = None):
    url = f"{BASE_URL}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw)
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw_body": raw}
        return exc.code, payload


def test_legacy_runs_route_is_404_but_heartbeat_runs_route_is_supported():
    invoke_status, invoke_payload = _request_json(f"/agents/{AGENT_ID}/heartbeat/invoke", method="POST")
    assert invoke_status in (200, 202)
    run_id = invoke_payload.get("id")
    assert run_id

    legacy_status, legacy_payload = _request_json(f"/runs/{run_id}")
    assert legacy_status == 404
    assert legacy_payload.get("error") == "API route not found"

    canonical_status, canonical_payload = _request_json(f"/heartbeat-runs/{run_id}")
    assert canonical_status == 200
    assert canonical_payload.get("id") == run_id
    assert canonical_payload.get("status") is not None


def test_canonical_route_returns_404_for_unknown_run_id():
    missing_run_id = str(uuid.uuid4())
    status, payload = _request_json(f"/heartbeat-runs/{missing_run_id}")
    assert status == 404
    assert payload.get("error") == "Heartbeat run not found"
