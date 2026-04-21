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
        final_score: QAScore | None = None

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
                task_prompt, contract, final_score, iteration
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
            qa_prompt = self._build_qa_prompt(contract, eng_result.summary)
            qa_req = RouteRequest(
                agent_id=self._qa_id,
                prompt=qa_prompt,
                task_id=task_id,
            )
            qa_result = await self._router.route(qa_req)
            qa_results.append(qa_result)

            # Parse score
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
            logger.info(
                "Iteration %d scores: func=%d corr=%d comp=%d qual=%d pass=%s",
                iteration,
                score.functionality, score.correctness,
                score.completeness, score.code_quality,
                score.pass_,
            )

            if score.pass_:
                return QALoopResult(
                    passed=True,
                    iterations_used=iteration,
                    final_score=score,
                    engineer_results=engineer_results,
                    qa_results=qa_results,
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
                )

        # Exhausted iterations without passing
        return QALoopResult(
            passed=False,
            iterations_used=self._max,
            final_score=final_score,
            escalated=False,
            engineer_results=engineer_results,
            qa_results=qa_results,
        )

    def _build_engineer_prompt(
        self,
        task_prompt: str,
        contract: SprintContract,
        prev_score: QAScore | None,
        iteration: int,
    ) -> str:
        parts: list[str] = []

        parts.append(contract.engineer_prompt_header())

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

    def _build_qa_prompt(self, contract: SprintContract, engineer_summary: str) -> str:
        parts: list[str] = [
            contract.qa_prompt_header(),
            "## Engineer Output Summary\n",
            engineer_summary,
            "",
        ]
        return "\n".join(parts)
