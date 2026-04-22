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
