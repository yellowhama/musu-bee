"""QA evaluation loop wrapping Router.

Runs Engineer → QA → Engineer (repeat) up to MAX_ITERATIONS.
If the same error appears MAX_ITERATIONS times in a row, escalates to CTO.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from musu_core.qa_score import QAScore, MAX_ITERATIONS
from musu_core.router import Router, RouteRequest, RouteResult
from musu_core.sprint_contract import SprintContract
from musu_core.experience import ExperienceStore
from musu_core.task_workspace import TaskWorkspace

logger = logging.getLogger(__name__)


@dataclass
class QALoopResult:
    """Outcome of a complete QA loop run."""

    passed: bool
    iterations_used: int
    final_score: QAScore | None
    escalated: bool = False
    escalation_reason: str = ""
    engineer_results: list[RouteResult] = field(default_factory=list)
    qa_results: list[RouteResult] = field(default_factory=list)
    all_scores: list[QAScore] = field(default_factory=list)


class QALoop:
    """
    CEO/CTO hands a task to QALoop.run().

    Flow per iteration:
      1. Route task to Engineer agent (with sprint contract header prepended)
      2. Route diff/result to QA agent (with QA prompt header)
      3. Parse QAScore from QA output
      4. If pass → done. If fail → feed back to Engineer, repeat.

    Circuit breaker: if the same failing criteria appear 3x, escalate to CTO.
    """

    def __init__(
        self,
        router: Router,
        engineer_agent_id: str,
        qa_agent_id: str,
        max_iterations: int = MAX_ITERATIONS,
    ) -> None:
        self._router = router
        self._engineer_id = engineer_agent_id
        self._qa_id = qa_agent_id
        self._max = max_iterations

    async def run(
        self,
        task_prompt: str,
        contract: SprintContract,
        task_id: str | None = None,
        engineer_session_id: str | None = None,
    ) -> QALoopResult:
        """
        Execute the full Engineer→QA loop.

        Args:
            task_prompt: Raw task description from CEO/CTO.
            contract: Sprint Contract with acceptance criteria.
            task_id: Optional task ID to link executions.
            engineer_session_id: Resume an existing Engineer session if provided.
        """
        engineer_results: list[RouteResult] = []
        qa_results: list[RouteResult] = []
        all_scores: list[QAScore] = []
        final_score: QAScore | None = None

        # Per-task workspace for file-based agent communication
        workspace: TaskWorkspace | None = None
        if task_id:
            workspace = TaskWorkspace(task_id)
            workspace.create()
            workspace.write_contract(contract.to_dict() if hasattr(contract, "to_dict") else {
                "task": contract.task,
                "scope": contract.scope,
                "acceptance_criteria": contract.acceptance_criteria,
            })

        # Session ID is threaded through all Engineer iterations to preserve context.
        # The Engineer remembers what it built; QA feedback is appended each round.
        active_engineer_session: str | None = engineer_session_id

        # Circuit breaker: track failing criteria strings
        _last_failure_key: str | None = None
        _consecutive_same_failure = 0

        for iteration in range(1, self._max + 1):
            logger.info("QA loop iteration %d/%d", iteration, self._max)

            # ── Engineer phase ────────────────────────────────────────────
            engineer_prompt = self._build_engineer_prompt(
                task_prompt, contract, final_score, iteration, workspace
            )
            eng_req = RouteRequest(
                agent_id=self._engineer_id,
                prompt=engineer_prompt,
                task_id=task_id,
                session_id=active_engineer_session,
            )
            eng_result = await self._router.route(eng_req)
            engineer_results.append(eng_result)
            # Persist session ID so subsequent iterations resume the same context
            if eng_result.session_id:
                active_engineer_session = eng_result.session_id

            if not eng_result.success:
                logger.warning("Engineer failed on iteration %d: %s", iteration, eng_result.error)
                # Non-recoverable engineer failure → escalate
                return QALoopResult(
                    passed=False,
                    iterations_used=iteration,
                    final_score=None,
                    escalated=True,
                    escalation_reason=f"Engineer failed: {eng_result.error}",
                    engineer_results=engineer_results,
                    qa_results=qa_results,
                )

            # ── QA phase ──────────────────────────────────────────────────
            # If engineer wrote workspace file, include it in QA context
            eng_workspace_data = workspace.read_engineer_output() if workspace else None
            eng_summary = eng_result.summary
            if eng_workspace_data:
                eng_summary += f"\n\n## Structured Engineer Output (from workspace)\n```json\n{__import__('json').dumps(eng_workspace_data, indent=2, ensure_ascii=False)}\n```"
            qa_prompt = self._build_qa_prompt(contract, eng_summary, workspace)
            qa_req = RouteRequest(
                agent_id=self._qa_id,
                prompt=qa_prompt,
                task_id=task_id,
            )
            qa_result = await self._router.route(qa_req)
            qa_results.append(qa_result)

            # Parse score — prefer workspace file, fallback to text parsing
            score: QAScore | None = None
            qa_ws_data = workspace.read_qa_feedback() if workspace else None
            if qa_ws_data and "scores" in qa_ws_data:
                try:
                    s = qa_ws_data["scores"]
                    score = QAScore(
                        functionality=s.get("functionality", 0),
                        correctness=s.get("correctness", 0),
                        completeness=s.get("completeness", 0),
                        code_quality=s.get("code_quality", 0),
                        feedback=qa_ws_data.get("feedback", ""),
                        iteration=iteration,
                        raw_output=qa_result.summary if qa_result.success else "",
                    )
                except (KeyError, TypeError):
                    score = None
            if score is None:
                raw_output = qa_result.summary if qa_result.success else ""
                score = QAScore.parse_agent_output(raw_output, iteration=iteration)

            if score is None:
                logger.warning("QA returned unparseable output on iteration %d", iteration)
                # Treat unparseable output as full failure, continue loop
                score = QAScore(
                    functionality=0, correctness=0, completeness=0, code_quality=0,
                    feedback="QA output could not be parsed as JSON",
                    iteration=iteration,
                    raw_output=raw_output,
                )

            final_score = score
            all_scores.append(score)
            logger.info(
                "Iteration %d scores: func=%d corr=%d comp=%d qual=%d pass=%s",
                iteration,
                score.functionality, score.correctness,
                score.completeness, score.code_quality,
                score.pass_,
            )

            if score.pass_:
                # Level 2 self-improvement: save successful trajectory
                try:
                    exp = ExperienceStore()
                    exp.save(
                        channel="engineer",
                        task_summary=task_prompt[:500],
                        result_summary=eng_result.summary[:500] if eng_result.summary else "",
                        scores={
                            "functionality": score.functionality,
                            "correctness": score.correctness,
                            "completeness": score.completeness,
                            "code_quality": score.code_quality,
                        },
                        tags=[contract.task[:50]] if hasattr(contract, "task") else [],
                    )
                except Exception:
                    pass  # non-fatal
                return QALoopResult(
                    passed=True,
                    iterations_used=iteration,
                    final_score=score,
                    engineer_results=engineer_results,
                    qa_results=qa_results,
                    all_scores=all_scores,
                )

            # Circuit breaker check
            failure_key = ",".join(sorted(score.failing_criteria))
            if failure_key == _last_failure_key:
                _consecutive_same_failure += 1
            else:
                _consecutive_same_failure = 1
                _last_failure_key = failure_key

            if _consecutive_same_failure > self._max:
                reason = (
                    f"Same failure repeated {_consecutive_same_failure}x: {failure_key}. "
                    "Escalating to CTO."
                )
                logger.error(reason)
                return QALoopResult(
                    passed=False,
                    iterations_used=iteration,
                    final_score=score,
                    escalated=True,
                    escalation_reason=reason,
                    engineer_results=engineer_results,
                    qa_results=qa_results,
                    all_scores=all_scores,
                )

        # Exhausted iterations without passing
        return QALoopResult(
            passed=False,
            iterations_used=self._max,
            final_score=final_score,
            escalated=False,
            engineer_results=engineer_results,
            qa_results=qa_results,
            all_scores=all_scores,
        )

    def _build_engineer_prompt(
        self,
        task_prompt: str,
        contract: SprintContract,
        prev_score: QAScore | None,
        iteration: int,
        workspace: TaskWorkspace | None = None,
    ) -> str:
        parts: list[str] = []

        # Level 2: inject similar past experiences as few-shot context
        if iteration == 1:
            try:
                exp = ExperienceStore()
                similar = exp.find_similar("engineer", task_prompt, limit=2)
                if similar:
                    parts.append("## Past Successful Experiences (참고용)\n")
                    for i, s in enumerate(similar, 1):
                        parts.append(f"### Example {i}\n**Task**: {s['task'][:200]}\n**Result**: {s['result'][:200]}\n**Scores**: {s.get('scores', {})}\n")
                    parts.append("위 경험을 참고하되, 현재 태스크에 맞게 적용하라.\n\n---\n")
            except Exception:
                pass

        parts.append(contract.engineer_prompt_header())

        if workspace:
            parts.append(f"## Task Workspace\n\nPath: `{workspace.path}`")
            parts.append(
                "Read `sprint_contract.json` for acceptance criteria. "
                "Before finishing, write `engineer_output.json` with: "
                '`{"files_changed": [...], "assumptions": [...], "blockers": [...], '
                '"test_results": {"passed": N, "failed": N}, "commit_hash": "", "summary": ""}`\n'
            )

        if iteration > 1 and prev_score is not None:
            parts.append("## QA Feedback — Please Fix These Issues\n")
            parts.append(f"**Failing criteria**: {', '.join(prev_score.failing_criteria)}\n")
            parts.append(f"**Feedback**: {prev_score.feedback}\n")
            parts.append(
                f"This is iteration {iteration}/{self._max}. "
                "Fix only the issues listed above. Do not change passing areas.\n"
            )

        parts.append(f"## Task\n\n{task_prompt}")
        return "\n".join(parts)

    def _build_qa_prompt(
        self, contract: SprintContract, engineer_summary: str, workspace: TaskWorkspace | None = None
    ) -> str:
        parts: list[str] = [
            contract.qa_prompt_header(),
            "## Engineer Output Summary\n",
            engineer_summary,
        ]
        if workspace:
            parts.append(f"\n## Task Workspace\n\nPath: `{workspace.path}`")
            parts.append(
                "Read `engineer_output.json` for structured output. "
                "After scoring, write `qa_feedback.json` with: "
                '`{"pass": bool, "scores": {"functionality": N, "correctness": N, '
                '"completeness": N, "code_quality": N}, "feedback": "...", '
                '"failing_criteria": [...], "suggestions": [...], "iteration": N}`\n'
            )
        parts.append("")
        return "\n".join(parts)
