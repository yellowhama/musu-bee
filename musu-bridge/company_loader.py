"""Generic company manifest loader (v11-iso1).

Replaces hardcoded company definitions (previously in seed_bw_agents.py and
writer_company.py) with a YAML-driven approach. The deployment image stays
empty; user-specific companies live in ``~/.musu/companies/<slug>.yaml``.

Resolution order for the active manifest:

1. Explicit path argument
2. ``MUSU_COMPANY_YAML`` env var
3. ``MUSU_COMPANY_ID`` env var → ``~/.musu/companies/<id>.yaml``
4. None → callers should treat as "no company configured"

Schema (required keys):
    id: str (UUID)
    name: str
    workspace_root: str
    agents: list[dict]
    channel_routing: dict[str, str]

Optional:
    template_key, workspace_id, status, purpose, projects, model_policy,
    production_hardening, release_languages, trend_markets, remote_access,
    source_paths, fallback
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

try:
    import yaml
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "PyYAML is required to load company manifests. "
        "Install with 'pip install pyyaml'."
    ) from exc


REQUIRED_KEYS = ("id", "name", "workspace_root", "agents", "channel_routing")


def _user_companies_dir() -> Path:
    base = os.getenv("MUSU_HOME") or str(Path.home() / ".musu")
    return Path(base) / "companies"


def resolve_company_yaml_path(explicit: str | Path | None = None) -> Path | None:
    """Return the path to the active company yaml, or None if not configured."""
    if explicit:
        return Path(explicit).expanduser()
    env_path = os.getenv("MUSU_COMPANY_YAML")
    if env_path:
        return Path(env_path).expanduser()
    company_id = os.getenv("MUSU_COMPANY_ID")
    if company_id:
        return _user_companies_dir() / f"{company_id}.yaml"
    return None


def load_company_manifest(path: str | Path | None = None) -> dict[str, Any]:
    """Load and validate a company manifest yaml.

    Returns an empty dict if no path is resolvable — callers must treat that
    as "no company configured" (deployment default).
    """
    resolved = resolve_company_yaml_path(path)
    if resolved is None or not resolved.exists():
        return {}

    with open(resolved, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    if not isinstance(data, dict):
        raise ValueError(f"company manifest at {resolved} is not a dict")

    missing = [k for k in REQUIRED_KEYS if k not in data]
    if missing:
        raise ValueError(
            f"company manifest {resolved} missing required keys: {missing}"
        )

    return data


def company_id(manifest: dict[str, Any]) -> str | None:
    return manifest.get("id") if manifest else None


def workspace_root(manifest: dict[str, Any]) -> str | None:
    return manifest.get("workspace_root") if manifest else None


def channel_routing(manifest: dict[str, Any]) -> dict[str, str]:
    return dict(manifest.get("channel_routing", {})) if manifest else {}


def agents(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return list(manifest.get("agents", [])) if manifest else []


def projects(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return list(manifest.get("projects", [])) if manifest else []


def adapter_config_for_agent(
    agent_spec: dict[str, Any],
    workspace_root_path: str,
) -> dict[str, Any]:
    """Build adapter_config from agent yaml entry, resolving relative
    instructions_path against workspace_root."""
    instructions_path = agent_spec.get("instructions_path", "")
    if instructions_path and not instructions_path.startswith("/"):
        instructions_path = str(Path(workspace_root_path) / instructions_path)

    cfg: dict[str, Any] = {
        "command": agent_spec.get("command", "gemini"),
        "model": agent_spec.get("model"),
        "yolo": agent_spec.get("yolo", True),
        "cwd": workspace_root_path,
        "timeout_sec": agent_spec.get("timeout_sec", 300),
    }
    if instructions_path:
        cfg["instructions_path"] = instructions_path
    inline = agent_spec.get("instructions_inline")
    if inline:
        cfg["instructions"] = inline
    return cfg


def seed_company_agents(
    manifest: dict[str, Any] | None = None,
    yaml_path: str | Path | None = None,
) -> int:
    """Register agents from manifest into musu-core DB.

    Idempotent — skips agents that already exist for the company.
    Returns the number of new agents created.
    """
    if manifest is None:
        manifest = load_company_manifest(yaml_path)
    if not manifest:
        return 0

    # Lazy import — musu-core is on sys.path only when bridge is set up.
    import sys
    _MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
    if str(_MUSU_CORE) not in sys.path:
        sys.path.insert(0, str(_MUSU_CORE))
    from musu_core.backends.local import LocalBackend
    from musu_core.config import get_config

    config = get_config()
    backend = LocalBackend(config.db_path)

    cid = manifest["id"]
    ws_root = manifest["workspace_root"]
    created = 0
    for agent_spec in manifest.get("agents", []):
        name = agent_spec.get("name")
        if not name:
            continue
        existing = backend.get_agent_by_name(name, company_id=cid)
        if existing is not None:
            continue
        backend.agents.create(
            name=name,
            role=agent_spec.get("role", ""),
            adapter_type=agent_spec.get("adapter_type", "gemini_local"),
            adapter_config=adapter_config_for_agent(agent_spec, ws_root),
            company_id=cid,
        )
        created += 1
    return created
