"""Isolation gate — every audit tool must require non-empty project.

Pytest gate introduced in R6 (BB phase). Prevents recurrence of the
R4 capture_decision isolation defect (caught post-round via audit).
Whenever a new audit tool is added, append a case to ISOLATION_CASES
and update test_isolation_case_count expected length.
"""

import pytest

from musu_writer.tools.audit_canon_drift import audit_canon
from musu_writer.tools.audit_cliffhanger import audit_cliff
from musu_writer.tools.audit_dialogue_tone import audit_dialogue
from musu_writer.tools.audit_reference_density import audit_density
from musu_writer.tools.audit_scene_turn import audit_turn
from musu_writer.tools.audit_tone_drift import audit_tone
from musu_writer.tools.compare_to_reference import compare_refs
from musu_writer.tools.decisions_to_brief import decisions_to_brief
from musu_writer.tools.promote_canon_candidate import promote


# (name, callable) — callable invokes the tool with project=""
ISOLATION_CASES = [
    ("audit_canon_drift", lambda: audit_canon("", "CH01")),
    ("audit_cliffhanger", lambda: audit_cliff("")),
    ("audit_dialogue_tone", lambda: audit_dialogue("")),
    ("audit_reference_density", lambda: audit_density("")),
    ("audit_scene_turn", lambda: audit_turn("")),
    ("audit_tone_drift", lambda: audit_tone("", "CH01")),
    ("compare_to_reference", lambda: compare_refs("")),
    ("decisions_to_brief", lambda: decisions_to_brief("")),
    ("promote_canon_candidate", lambda: promote("", "x.md", "y.md", "by_section")),
]


@pytest.mark.parametrize(
    "tool_name,call",
    ISOLATION_CASES,
    ids=[c[0] for c in ISOLATION_CASES],
)
def test_tool_rejects_empty_project(tool_name, call):
    """project='' must return a dict with 'error' key mentioning 'project'."""
    result = call()
    assert isinstance(result, dict), f"{tool_name}: result not dict, got {type(result)}"
    assert "error" in result, f"{tool_name}: missing 'error' key, got {result!r}"
    err = result["error"]
    assert isinstance(err, str) and "project" in err.lower(), (
        f"{tool_name}: error msg should mention 'project', got {err!r}"
    )


def test_isolation_case_count():
    """Gate count lock — R6 종료 9/9. 신규 도구 추가 시 본 테스트도 갱신."""
    assert len(ISOLATION_CASES) == 9, (
        f"expected 9 isolation cases (R6 lock), got {len(ISOLATION_CASES)}"
    )
