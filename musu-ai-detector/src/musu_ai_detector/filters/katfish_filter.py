"""Korean pre-filter using KatFishNet-style linguistic feature extraction.

Extracts statistical features from Korean text using morpheme analysis:
1. Comma usage patterns (rate, position, segment length, POS diversity)
2. POS n-gram diversity (1-gram through 5-gram)

These features are then combined into a heuristic score.
LLM-generated Korean text typically shows:
- Higher comma regularity (lower diversity)
- Lower POS n-gram diversity (more repetitive structures)
- More uniform spacing patterns
"""

from __future__ import annotations

import numpy as np

from ..models import FilterResult


def _split_sentences(text: str) -> list[str]:
    """Split Korean text into sentences."""
    try:
        import kss

        raw = kss.split_sentences(text)
        sentences = []
        for s in raw:
            sentences.extend(s.split("\n"))
        return [s.strip() for s in sentences if s.strip()]
    except ImportError:
        # Fallback: split on sentence-ending punctuation
        import re

        return [s.strip() for s in re.split(r"[.!?。]\s*", text) if s.strip()]


def _pos_tag(sentences: list[str]) -> tuple[list[list[str]], list[list[str]]]:
    """Run POS tagging on sentences. Returns (morphs_per_sentence, pos_per_sentence)."""
    try:
        from konlpy.tag import Kkma

        kkma = Kkma()
    except ImportError:
        # Fallback: character-level pseudo-POS
        morphs_all = []
        pos_all = []
        for sent in sentences:
            chars = list(sent)
            morphs_all.append(chars)
            pos_all.append(["NNG"] * len(chars))  # dummy tags
        return morphs_all, pos_all

    morphs_all = []
    pos_all = []
    for sent in sentences:
        try:
            tagged = kkma.pos(sent)
            morphs = [t[0] for t in tagged]
            pos = [t[1] for t in tagged]
        except Exception:
            morphs = list(sent)
            pos = ["NNG"] * len(morphs)
        morphs_all.append(morphs)
        pos_all.append(pos)

    return morphs_all, pos_all


def _analyze_comma_features(
    morphs_per_sent: list[list[str]],
    pos_per_sent: list[list[str]],
) -> dict:
    """Extract comma usage features (adapted from KatFishNet)."""
    num_sentences = len(morphs_per_sent)
    if num_sentences == 0:
        return {}

    comma_include_count = 0
    comma_usage_rates = []
    relative_positions = []
    segment_lengths = []
    pos_diversity_scores = []

    for morphs, pos in zip(morphs_per_sent, pos_per_sent):
        commas = [i for i, m in enumerate(morphs) if m == ","]
        num_commas = len(commas)

        if num_commas > 0:
            comma_include_count += 1

            # Comma usage rate
            comma_usage_rates.append(num_commas / len(morphs) if morphs else 0)

            # Relative positions
            rel_pos = [c / len(morphs) for c in commas]
            relative_positions.append(np.mean(rel_pos))

            # Segment lengths
            boundaries = [0] + commas + [len(morphs)]
            segs = [boundaries[i + 1] - boundaries[i] for i in range(len(boundaries) - 1)]
            segment_lengths.append(np.mean(segs))

            # POS diversity before/after commas
            patterns = []
            for c in commas:
                if 0 < c < len(pos) - 1:
                    patterns.append((pos[c - 1], pos[c + 1]))
            if patterns:
                pos_diversity_scores.append(len(set(patterns)) / len(patterns))
            else:
                pos_diversity_scores.append(0)
        else:
            comma_usage_rates.append(0)
            relative_positions.append(0)
            segment_lengths.append(0)
            pos_diversity_scores.append(0)

    return {
        "comma_include_rate": comma_include_count / num_sentences,
        "avg_comma_usage_rate": float(np.mean(comma_usage_rates)),
        "avg_relative_position": float(np.mean(relative_positions)),
        "std_relative_position": float(np.std(relative_positions)),
        "avg_segment_length": float(np.mean(segment_lengths)),
        "std_segment_length": float(np.std(segment_lengths)),
        "avg_pos_diversity": float(np.mean(pos_diversity_scores)),
    }


def _analyze_pos_ngram_diversity(pos_per_sent: list[list[str]]) -> dict:
    """Extract POS n-gram diversity features (adapted from KatFishNet)."""
    results = {}

    for n in range(1, 6):
        diversities = []
        for pos in pos_per_sent:
            if len(pos) < n:
                diversities.append(0)
                continue
            ngrams = [tuple(pos[i : i + n]) for i in range(len(pos) - n + 1)]
            if ngrams:
                diversities.append(len(set(ngrams)) / len(ngrams))
            else:
                diversities.append(0)

        results[f"avg_pos_{n}gram_diversity"] = float(np.mean(diversities))
        results[f"std_pos_{n}gram_diversity"] = float(np.std(diversities))

    return results


def _features_to_score(comma_features: dict, ngram_features: dict) -> float:
    """Convert extracted features to a 0-1 AI probability score.

    Heuristic based on KatFishNet findings:
    - LLM text has LOWER POS diversity (more repetitive)
    - LLM text has MORE UNIFORM comma patterns (lower std)
    - LLM text has HIGHER comma usage rate

    This is a rule-based approximation. The LLM judge (stage 2) does
    the real classification using these features as evidence.
    """
    signals = []

    # Low POS 3-gram diversity → more likely AI
    div3 = ngram_features.get("avg_pos_3gram_diversity", 0.5)
    if div3 < 0.6:
        signals.append(0.7)  # suspicious
    elif div3 < 0.75:
        signals.append(0.5)  # neutral
    else:
        signals.append(0.3)  # likely human

    # Low POS 5-gram diversity → more likely AI
    div5 = ngram_features.get("avg_pos_5gram_diversity", 0.5)
    if div5 < 0.7:
        signals.append(0.7)
    elif div5 < 0.85:
        signals.append(0.5)
    else:
        signals.append(0.3)

    # Low comma position std → uniform → more likely AI
    comma_std = comma_features.get("std_relative_position", 0.1)
    if comma_std < 0.05:
        signals.append(0.7)
    elif comma_std < 0.1:
        signals.append(0.5)
    else:
        signals.append(0.3)

    # Low POS diversity around commas → more likely AI
    pos_div = comma_features.get("avg_pos_diversity", 0.5)
    if pos_div < 0.4:
        signals.append(0.7)
    elif pos_div < 0.6:
        signals.append(0.5)
    else:
        signals.append(0.3)

    return float(np.mean(signals)) if signals else 0.5


def run_katfish(text: str) -> FilterResult:
    """Run KatFishNet-style feature extraction on Korean text.

    Returns FilterResult with score 0.0 (human) to 1.0 (AI).
    """
    try:
        sentences = _split_sentences(text)
        if not sentences:
            return FilterResult(filter_name="katfish", score=0.5)

        morphs, pos = _pos_tag(sentences)

        comma_features = _analyze_comma_features(morphs, pos)
        ngram_features = _analyze_pos_ngram_diversity(pos)

        score = _features_to_score(comma_features, ngram_features)

        all_features = {**comma_features, **ngram_features}

        return FilterResult(
            filter_name="katfish",
            score=score,
            features=all_features,
        )

    except Exception as e:
        return FilterResult(
            filter_name="katfish",
            score=0.5,
            features={"error": str(e)},
        )
