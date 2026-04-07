# Replication Plan: Musu Local AI Adapter

이 문서는 Paperclip의 `claude_local` 및 `codex_local` 어댑터 기능을 `musu-ai` 폴더에 재현하기 위한 구체적인 단계별 계획을 기술합니다.

## 1. 목표
- 로컬 CLI 도구(`claude`, `codex`)를 자식 프로세스로 제어하는 핵심 엔진 구축.
- 동적 스킬 주입 및 컨텍스트 바인딩 기능 구현.
- 무수(Musu) 전용 AI 실행 환경 제공.

## 2. 핵심 구성 요소 및 파일 구조

```text
musu-functions/musu-ai/
├── src/
│   ├── runner.ts          # CLI 실행 및 입출력 제어 (Core Engine)
│   ├── env.ts             # 환경 변수 및 컨텍스트 관리
│   ├── skills.ts          # 동적 스킬 바인딩 및 심볼릭 링크 처리
│   ├── adapters/
│   │   ├── claude.ts      # Claude Code 전용 설정 및 파싱
│   │   └── codex.ts       # OpenAI Codex 전용 설정 및 파싱
│   └── index.ts           # 통합 인터페이스
├── package.json           # 의존성 관리
└── README.md              # 사용 가이드
```

## 3. 단계별 구현 계획

### Phase 1: Core Runner 및 환경 구축 (Week 1)
- **[Task 1.1]** `package.json` 설정 및 필수 라이브러리 설치.
- **[Task 1.2]** `src/runner.ts`: `child_process.spawn`을 사용한 CLI 호출 엔진 구현. 
  - `stdin`으로 프롬프트 주입 기능.
  - `stdout`/`stderr` 실시간 스트리밍 및 캡처.
  - 타임아웃 및 프로세스 종료 제어.
- **[Task 1.3]** `src/env.ts`: Paperclip의 환경 변수 주입 로직(`PAPERCLIP_*`) 이식 및 무수용 변수 추가.

### Phase 2: 어댑터 특화 로직 구현 (Week 1-2)
- **[Task 2.1]** `src/adapters/claude.ts`: 
  - `--print -`, `--output-format stream-json` 옵션 적용.
  - Claude 특유의 에러 패턴(로그인 필요 등) 감지 로직.
- **[Task 2.2]** `src/adapters/codex.ts`:
  - `exec --json` 옵션 및 `CODEX_HOME` 환경 변수 관리.
  - `JSONL` 형식의 출력 파싱.

### Phase 3: 동적 스킬 바인딩 엔진 (Week 2)
- **[Task 3.1]** `src/skills.ts`: 임시 디렉토리를 생성하고 스킬들을 심볼릭 링크로 연결하는 로직 구현.
- **[Task 3.2]** `claude`의 `--add-dir` 및 `codex`의 `skills` 폴더 동기화 로직 연동.

### Phase 4: 테스트 및 검증 (Week 2)
- **[Task 4.1]** 실제 로컬 `claude` CLI를 사용한 무수 에이전트 호출 테스트.
- **[Task 4.2]** 컨텍스트 유지(Session Resume) 기능 확인.

## 4. Paperclip에서 가져올 핵심 코드 조각
- **Nesting Guard:** `CLAUDE_CODE_NESTING_VARS` 삭제 로직 (자식 프로세스 실행 방지 우회).
- **Template Rendering:** `{{agent.id}}` 등의 변수를 치환하는 `renderTemplate` 로직.
- **Path Resolution:** OS별 명령어 경로 탐색 및 실행 권한 체크 로직.

---
*작성일: 2026-04-04*
*작성자: Gemini CLI*
