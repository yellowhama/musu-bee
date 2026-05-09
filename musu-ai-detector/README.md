# musu-ai-detector

MUSU 에이전트(Claude/Codex/Gemini)가 사용하는 AI 텍스트 탐지 MCP 도구.

**이 도구는 판정을 하지 않는다.** 통계 특징만 추출해서 에이전트한테 넘긴다.
에이전트가 특징을 보고 직접 AI/사람 판단 + span 마킹을 한다.

## 구조

```
에이전트 (Claude/Codex/Gemini)
    │
    ├─ detect_ai(text) → 통계 특징 반환
    │   ├─ KO: KatFishNet (형태소 분석, 쉼표 패턴, POS n-gram 다양성)
    │   └─ EN: ZipPy (압축률 비교)
    │
    ├─ 에이전트가 직접 판정 + span 마킹
    │
    └─ detect_ai_fix(run_id, spans) → 윤문 workspace 생성
        ├─ KO: im-not-ai _workspace/ 에 findings 작성
        └─ EN: agent-direct workspace 생성
```

## MCP Tools

| Tool | 역할 |
|------|------|
| `detect_ai` | 통계 특징 추출. 에이전트가 판정 |
| `detect_ai_report` | 이전 결과 조회 (run_id) |
| `detect_ai_fix` | 에이전트가 마킹한 span 기반 윤문 workspace 생성 |

## Install

```bash
cd musu-ai-detector
python3 -m venv .venv
.venv/bin/pip install -e ".[all,dev]"
```

## MCP 등록 (~/.claude.json)

```json
{
  "musu-ai-detector": {
    "type": "stdio",
    "command": "/path/.venv/bin/musu-ai-detector",
    "args": ["mcp"],
    "env": {
      "IM_NOT_AI_PATH": "/path/to/im-not-ai",
      "MUSU_DETECTOR_STORE": "~/.musu/ai-detector"
    }
  }
}
```

## 에이전트 사용 흐름

```
1. detect_ai("텍스트") → features + score
2. 에이전트가 features 분석 → AI/사람 판정 + span 마킹
3. detect_ai_fix(run_id, spans) → im-not-ai workspace 생성
4. (한국어) im-not-ai 스킬로 윤문 실행
```

## 한국어 특징 (KatFishNet)

- 쉼표 포함 문장 비율
- 쉼표 사용률 / 상대 위치 / 분절 길이
- 쉼표 전후 POS 다양성
- POS 1~5-gram 다양성 (평균 + 표준편차)

## 영어 특징 (ZipPy)

- LZMA/Brotli/Zlib 압축률 비교
- AI 생성 텍스트는 압축률이 높음 (패턴 반복)

## Tests

```bash
.venv/bin/pytest tests/ -v
```
