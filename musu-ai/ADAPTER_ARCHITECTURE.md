# Musu AI: Local AI Adapter Architecture Guide

이 문서는 Paperclip의 `claude_local` 및 `codex_local` 어댑터가 로컬에 설치된 AI CLI 도구(Claude Code, OpenAI Codex 등)를 어떻게 고성능 에이전트 레이어로 활용하는지 상세히 기술합니다. 이 아키텍처를 `musu-ai`에 적용하여 무수(Musu) 전용 AI 실행 레이어를 구축할 수 있습니다.

## 1. 핵심 메커니즘: CLI 가상화 (CLI Virtualization)

Paperclip의 어댑터는 단순히 API를 호출하지 않고, **기존의 강력한 CLI 도구를 "자식 프로세스"로 실행**하며 다음과 같은 레이어를 씌웁니다.

### A. 컨텍스트 주입 (Context Injection)
- **환경 변수 통신:** `PAPERCLIP_RUN_ID`, `PAPERCLIP_API_KEY`, `PAPERCLIP_WORKSPACE_CWD` 등을 환경 변수로 주입하여 실행 중인 CLI가 현재 어떤 작업(Issue, Run)에 소속되어 있는지 인식하게 합니다.
- **부트스트랩 프롬프트:** 실행 시 표준 입력(stdin)으로 "당신은 에이전트 OOO입니다. 현재 작업은 XXX입니다."와 같은 컨텍스트를 미리 밀어넣어 AI가 즉시 상황을 파악하게 합니다.

### B. 동적 스킬 바인딩 (Dynamic Skill Binding)
- **임시 디렉토리 생성:** 실행 시마다 `/tmp/musu-skills-XXXX`와 같은 임시 폴더를 만듭니다.
- **심볼릭 링크 활용:** 전역 스킬 디렉토리에 있는 기능들을 이 임시 폴더 내의 `.claude/skills/` 등에 심볼릭 링크로 연결합니다.
- **--add-dir 옵션:** AI CLI 실행 시 이 임시 폴더를 `--add-dir` 옵션으로 넘겨, 해당 실행 세션에서만 유효한 전용 스킬셋을 동적으로 구성합니다.

### C. 출력 스트림 파싱 (Output Stream Parsing)
- **JSON Stream 모드:** `--output-format stream-json`과 같은 옵션을 사용하여 AI가 내뱉는 중간 과정(생각, 도구 호출, 결과)을 실시간으로 캡처합니다.
- **오류 감지 및 복구:** AI가 로그인이 필요하거나(`claude login`), 사용량이 초과되었을 때 발생하는 특정 에러 패턴을 감지하여 사용자에게 명확한 가이드를 제공합니다.

## 2. Musu-AI에 적용하는 전략 (Application to Musu)

무수(Musu) 프로젝트에서 이 방식을 사용하려면 다음과 같은 레이어 구성이 필요합니다.

### Step 1: `musu-ai-runner` (실행기)
- 로컬에 설치된 `claude` 또는 `codex` CLI를 호출하는 Node.js/Python 래퍼.
- `child_process.spawn`을 사용하여 입출력을 파이핑하고, `stdio: ['pipe', 'pipe', 'pipe']`로 제어합니다.

### Step 2: `musu-context-bridge` (브릿지)
- 무수의 현재 파일 상태(Git, Workspace)와 Paperclip의 이슈 상태를 AI가 이해할 수 있는 환경 변수와 프롬프트로 변환하는 변환기.

### Step 3: `musu-skill-overlay` (오버레이)
- 무수 전용 도구(예: `musu-connects`, `musu-port`)를 `MCP(Model Context Protocol)` 또는 심볼릭 링크 스킬 형태로 AI에게 노출시키는 레이어.

## 3. 예시: Claude를 무수 에이전트로 호출하는 법

```bash
# musu-ai-runner가 내부적으로 실행할 명령어 예시
claude \
  --bare \
  --print - \
  --output-format stream-json \
  --add-dir /home/hugh51/musu-functions/musu-ai/skills \
  --append-system-prompt "당신은 무수(Musu)의 엔지니어입니다. 현재 /home/hugh51/ 프로젝트를 관리 중입니다."
```

## 4. 장점
1. **성능:** 로컬에서 이미 인증된 계정을 사용하므로 응답 속도가 빠릅니다.
2. **비용 효율:** 기존에 구독 중인 CLI 계정(Claude Code 등)의 쿼터(Quota)를 그대로 활용할 수 있습니다.
3. **확장성:** 새로운 AI CLI가 나오면 어댑터만 추가하여 즉시 무수의 능력을 확장할 수 있습니다.

---
*작성일: 2026-04-04*
*작성자: Gemini CLI (Musu AI Strategy)*
