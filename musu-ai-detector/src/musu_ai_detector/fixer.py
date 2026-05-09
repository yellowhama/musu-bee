"""Humanization workspace preparation.

Korean → creates im-not-ai workspace with pre-computed findings
English → creates workspace for agent to process

NO API calls. The agent does the actual rewriting.
"""

from __future__ import annotations

import json
import os
import time

from .models import DetectionResult, FixResult


async def prepare_fix_workspace(result: DetectionResult) -> FixResult:
    """Create workspace for humanization.

    For Korean: writes to im-not-ai _workspace/ for pipeline pickup.
    For all languages: writes findings JSON for agent reference.
    """
    im_not_ai_path = os.environ.get(
        "IM_NOT_AI_PATH",
        os.path.expanduser("~/writer/사용도구/im-not-ai"),
    )

    store_dir = os.environ.get(
        "MUSU_DETECTOR_STORE",
        os.path.expanduser("~/.musu/ai-detector"),
    )

    run_tag = f"{time.strftime('%Y-%m-%d')}-{result.run_id[:8]}"

    # For Korean: use im-not-ai workspace
    if result.language in ("ko", "mixed"):
        workspace = os.path.join(im_not_ai_path, "_workspace")
        run_dir = os.path.join(workspace, run_tag)
        os.makedirs(run_dir, exist_ok=True)

        # Write input text
        input_path = os.path.join(run_dir, "01_input.txt")
        with open(input_path, "w", encoding="utf-8") as f:
            f.write(result.text)

        # Write detection findings from agent's span annotations
        findings = []
        for i, span in enumerate(result.spans):
            findings.append(
                {
                    "id": f"f{i+1:03d}",
                    "category": span.category,
                    "category_label": span.reason,
                    "severity": span.severity,
                    "scope": "span",
                    "text_span": span.text,
                    "start": span.start,
                    "end": span.end,
                    "reason": span.reason,
                    "suggested_fix": span.suggested_fix,
                }
            )

        detection_path = os.path.join(run_dir, "02_detection.json")
        with open(detection_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "meta": {
                        "run_id": run_tag,
                        "source": "musu-ai-detector",
                        "input_length": len(result.text),
                        "detected_count": len(findings),
                        "pre_filter_score": result.score,
                        "language": result.language,
                    },
                    "findings": findings,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        return FixResult(
            run_id=result.run_id,
            original_text=result.text,
            fixed_text="",
            changes=[
                {
                    "action": "workspace_created",
                    "path": run_dir,
                    "method": "im-not-ai",
                    "next_step": "Run im-not-ai humanize-korean skill on this workspace",
                }
            ],
            method="im-not-ai",
        )

    # For English: create workspace in detector store
    run_dir = os.path.join(store_dir, "fix", run_tag)
    os.makedirs(run_dir, exist_ok=True)

    input_path = os.path.join(run_dir, "01_input.txt")
    with open(input_path, "w", encoding="utf-8") as f:
        f.write(result.text)

    findings_path = os.path.join(run_dir, "02_findings.json")
    with open(findings_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "meta": {
                    "run_id": run_tag,
                    "source": "musu-ai-detector",
                    "input_length": len(result.text),
                    "detected_count": len(result.spans),
                    "pre_filter_score": result.score,
                    "language": result.language,
                },
                "spans": [s.to_dict() for s in result.spans],
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    return FixResult(
        run_id=result.run_id,
        original_text=result.text,
        fixed_text="",
        changes=[
            {
                "action": "workspace_created",
                "path": run_dir,
                "method": "agent-direct",
                "next_step": "Rewrite the text using the span findings as guide",
            }
        ],
        method="agent-direct",
    )
