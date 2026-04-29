from __future__ import annotations

class ComplexityScorer:
    """Estimates the complexity of a prompt to assist in model routing."""

    SIMPLE_KEYWORDS = {
        "list", "status", "show", "hello", "ping", "get", "read",
        "목록", "상태", "안녕", "조회", "읽기"
    }
    COMPLEX_KEYWORDS = {
        "fix", "refactor", "implement", "design", "solve", "create", "update",
        "debug", "migration", "architecture",
        "수정", "개선", "구현", "설계", "해결", "생성", "업데이트", "디버그", "마이그레이션", "아키텍처"
    }

    def score(self, text: str) -> float:
        """
        Returns a score between 0.0 (Simple) and 1.0 (Complex).
        """
        if not text:
            return 0.0

        text_lower = text.lower()
        words = text_lower.split()
        
        # 1. Keyword analysis
        simple_count = sum(1 for kw in self.SIMPLE_KEYWORDS if kw in text_lower)
        complex_count = sum(1 for kw in self.COMPLEX_KEYWORDS if kw in text_lower)

        # 2. Length analysis (longer prompts are usually more complex)
        length_score = min(len(text) / 1000.0, 1.0) * 0.3 # Max 0.3 weight for length

        # 3. Keyword-based base score
        base_score = 0.5
        if complex_count > simple_count:
            base_score = 0.7
        elif simple_count > complex_count:
            base_score = 0.2
        
        # Combine
        final_score = (base_score * 0.7) + length_score

        return max(0.0, min(final_score, 1.0))

    # ── Task-type-based adapter routing ──────────────────────────

    CODING_KEYWORDS = {
        "code", "implement", "fix", "bug", "refactor", "test", "function",
        "class", "module", "api", "endpoint", "deploy", "build", "compile",
        "코드", "구현", "수정", "버그", "리팩터", "테스트", "함수", "빌드",
    }
    RESEARCH_KEYWORDS = {
        "research", "search", "find", "investigate", "analyze", "compare",
        "report", "summary", "wiki", "document", "study",
        "조사", "검색", "찾기", "분석", "비교", "보고서", "요약", "문서",
    }
    AUTOMATION_KEYWORDS = {
        "automate", "schedule", "cron", "notify", "alert", "monitor",
        "send", "message", "email", "slack", "webhook", "pipeline",
        "자동화", "스케줄", "알림", "모니터", "전송", "파이프라인",
    }

    # Adapter preference by task type (ordered: first = preferred)
    _TASK_ADAPTER_MAP = {
        "coding": ["claude_local", "gemini_local", "codex_local"],
        "research": ["hermes", "gemini_local", "claude_local"],
        "automation": ["openclaw", "hermes", "process"],
        "general": ["gemini_local", "claude_local", "hermes"],
    }

    def classify_task(self, text: str) -> str:
        """Classify task type: coding, research, automation, or general."""
        if not text:
            return "general"
        text_lower = text.lower()
        coding = sum(1 for kw in self.CODING_KEYWORDS if kw in text_lower)
        research = sum(1 for kw in self.RESEARCH_KEYWORDS if kw in text_lower)
        automation = sum(1 for kw in self.AUTOMATION_KEYWORDS if kw in text_lower)

        scores = {"coding": coding, "research": research, "automation": automation}
        best = max(scores, key=scores.get)
        if scores[best] == 0:
            return "general"
        return best

    def recommend_adapter(self, text: str, available: list[str] | None = None) -> str | None:
        """Recommend best adapter for this task from available adapters.

        Returns adapter_type string or None if no recommendation.
        """
        task_type = self.classify_task(text)
        preferences = self._TASK_ADAPTER_MAP.get(task_type, self._TASK_ADAPTER_MAP["general"])
        if available:
            for pref in preferences:
                if pref in available:
                    return pref
        return preferences[0] if preferences else None
