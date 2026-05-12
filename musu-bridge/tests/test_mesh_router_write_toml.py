"""mesh_router._write_toml: preserve external agent_assignments (v8)."""
from __future__ import annotations

import tomllib
from pathlib import Path

from mesh_router import MeshRouter


def _write_nodes_toml(path: Path, agent_assignments: list[tuple[str, str]]) -> None:
    """Write a minimal nodes.toml with a single self node + given agent_assignments."""
    lines = [
        "[mesh]",
        'self = "4060"',
        "",
        "[[mesh.nodes]]",
        'name = "4060"',
        'url = "http://127.0.0.1:8070"',
        "",
    ]
    for agent, node in agent_assignments:
        lines.extend(
            [
                "[[mesh.agent_assignments]]",
                f'agent = "{agent}"',
                f'node = "{node}"',
                "",
            ]
        )
    path.write_text("\n".join(lines))


def _read_assignments(path: Path) -> dict[str, str]:
    with open(path, "rb") as f:
        data = tomllib.load(f)
    return {
        a["agent"]: a["node"]
        for a in data.get("mesh", {}).get("agent_assignments", [])
    }


def test_write_toml_preserves_external_agent_assignments(tmp_path: Path) -> None:
    """External agent_assignment edited directly into nodes.toml must survive _write_toml.

    Regression for v7 race: startup add_node() triggers _write_toml; if memory
    _agent_nodes is empty at that moment, externally-added assignments would
    be wiped. After v8 fix, they must be preserved.
    """
    nodes_toml = tmp_path / "nodes.toml"
    _write_nodes_toml(nodes_toml, [("external_agent", "4060")])

    router = MeshRouter(config_path=nodes_toml)
    # Sanity: _load picked it up
    assert router._agent_nodes.get("external_agent") == "4060"

    # Simulate the race: memory is empty when _write_toml fires
    router._agent_nodes = {}
    router._write_toml()

    assignments = _read_assignments(nodes_toml)
    assert "external_agent" in assignments, (
        "external_agent assignment was wiped — _write_toml does not preserve "
        "external entries (v8 fix not applied)"
    )
    assert assignments["external_agent"] == "4060"


def test_write_toml_memory_wins_on_conflict(tmp_path: Path) -> None:
    """When the same agent appears in both file and memory, memory wins.

    Rationale: _agent_nodes is the runtime source of truth (set via
    auto_assign_agents / add_node / remove_node).
    """
    nodes_toml = tmp_path / "nodes.toml"
    _write_nodes_toml(nodes_toml, [("agent_x", "node_A")])

    router = MeshRouter(config_path=nodes_toml)
    # Override in memory
    router._agent_nodes = {"agent_x": "node_B"}
    router._write_toml()

    assignments = _read_assignments(nodes_toml)
    assert assignments.get("agent_x") == "node_B", (
        f"expected memory to win on conflict, got {assignments.get('agent_x')!r}"
    )


def test_write_toml_no_regression_writes_memory_agents(tmp_path: Path) -> None:
    """Agents present only in _agent_nodes (not in file) must be written out.

    Regression guard for existing behavior (auto_assign_agents flow).
    """
    nodes_toml = tmp_path / "nodes.toml"
    _write_nodes_toml(nodes_toml, [])

    router = MeshRouter(config_path=nodes_toml)
    router._agent_nodes = {"mgr-4060": "4060", "bw-writer": "4060"}
    router._write_toml()

    assignments = _read_assignments(nodes_toml)
    assert assignments.get("mgr-4060") == "4060"
    assert assignments.get("bw-writer") == "4060"
