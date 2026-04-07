"""Tests for MUS-864 security hardening behaviors (musu-core side).

Covers:
    5. MeshRegistry._load() with missing tailscale_ip raises ValueError with clear message
    6. MeshRegistry._load() with mesh.self not in nodes emits warnings.warn() mentioning is_local()
    7. LLMInstance.url raises NotImplementedError
"""

from __future__ import annotations

import warnings
from pathlib import Path

import pytest

from musu_core.mesh import LLMInstance, MeshRegistry


def _write_toml(tmp_path: Path, content: str) -> Path:
    p = tmp_path / "nodes.toml"
    p.write_text(content)
    return p


class TestMeshRegistryLoad:
    def test_missing_tailscale_ip_raises_value_error(self, tmp_path: Path) -> None:
        toml = _write_toml(
            tmp_path,
            """
[mesh]
self = "node1"

[[mesh.nodes]]
name = "node1"
""",
        )
        with pytest.raises(ValueError, match="tailscale_ip"):
            MeshRegistry(config_path=toml)

    def test_self_not_in_nodes_warns_about_is_local(self, tmp_path: Path) -> None:
        toml = _write_toml(
            tmp_path,
            """
[mesh]
self = "ghost"

[[mesh.nodes]]
name = "node1"
tailscale_ip = "100.1.2.3"
""",
        )
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            MeshRegistry(config_path=toml)
        assert any("is_local" in str(w.message) for w in caught), (
            "Expected a warning mentioning is_local() when mesh.self is not in nodes"
        )


class TestLLMInstanceUrl:
    def test_url_raises_not_implemented(self) -> None:
        inst = LLMInstance(name="test-llm", node="node1", port=8080, role="llm")
        with pytest.raises(NotImplementedError):
            _ = inst.url
