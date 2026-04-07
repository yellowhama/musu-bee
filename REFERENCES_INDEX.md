# References Index (보물창고)

> `references_AI/` → `/home/hugh51/references_AI/` (심링크)
> 새로 만들지 말고 여기서 먼저 찾는다.

---

## 레포 목록 + MUSU 매핑

| 레포 | 뭔지 | MUSU에서 쓸 곳 |
|------|------|---------------|
| **paperclip-main** | AI 회사 control plane (이슈, 에이전트, 거버넌스) | MUSU-WORKS 참고 (프로젝트/거버넌스 구조) |
| **openclaw-full** | AI 비서 앱 (iOS/Android/macOS) | 메신저 UI 구조 참고, 모바일 앱 구조 |
| **nanoclaw-main** | 컨테이너 기반 AI 에이전트 런타임 | 파트장 AI 실행 환경, 작업 큐/스케줄러, 채널 시스템 |
| **gstack** | Claude Code 스킬 27개 (Garry Tan) | 이미 설치됨. 스킬 시스템 구조 참고 |
| **gstack-main** | gstack 원본 (위와 동일) | 위와 동일 |
| **CLI-Anything** | 모든 소프트웨어를 AI가 쓸 수 있게 CLI화 | MCP/도구 관리, 환경 매니페스트 참고 |
| **rtk-ai** | Rust Token Killer (토큰 절감 CLI) | 이미 설치됨 |
| **claude-code** | Claude Code 소스코드 | 어댑터 구현, MCP 연동 참고 |
| **codex-plugin-cc-main** | Codex를 Claude Code 안에서 쓰는 플러그인 | 멀티 AI 연동 참고 |
| **BitNet-main** | 1-bit LLM 런타임 | 로컬 모델 참고 (지금은 안 씀) |
| **just-bash** | TypeScript로 만든 가상 bash (인메모리) | 샌드박스 실행 환경 참고 |
| **autoresearch_wsl** | Karpathy의 자율 AI 연구 에이전트 | 자율 실행 패턴 참고 |

---

## MUSU "아예 안 된 것" ↔ 레퍼런스 매핑

### 1. 메신저 UI ← nanoclaw, openclaw

**nanoclaw-main**이 가장 가까움:
- `src/channels/` — 채널 시스템 (Slack 채널과 유사)
- `src/group-queue.ts` — 그룹별 작업 큐
- `src/task-scheduler.ts` — 작업 스케줄러
- `src/remote-control.ts` — 원격 제어
- `src/router.ts` — 메시지 라우팅
- `src/ipc.ts` — 프로세스 간 통신
- 컨테이너 기반 에이전트 격리

**openclaw-full**:
- `apps/` — iOS/Android/macOS 네이티브 앱
- 채팅 UI 패턴 참고 (모바일 메신저 구조)

### 2. 파트장 AI (에이전트 런타임) ← nanoclaw, paperclip

**nanoclaw-main**:
- `src/container-runner.ts` — 에이전트를 컨테이너에서 실행
- `src/container-runtime.ts` — 런타임 관리
- `groups/` — 에이전트 그룹 관리
- `config-examples/` — 에이전트 설정 예시

**paperclip-main**:
- `packages/adapters/` — claude-local, codex-local 등 어댑터
- `server/src/services/agents.ts` — 에이전트 라이프사이클 (pause/resume/terminate)
- `server/src/services/budgets.ts` — 예산 관리

### 3. 작업 큐/분배 ← nanoclaw, paperclip

**nanoclaw-main**:
- `src/task-scheduler.ts` — **이게 핵심.** 작업 스케줄링
- `src/group-queue.ts` — 그룹별 큐
- `src/routing.ts` — 메시지/작업 라우팅

**paperclip-main**:
- `server/src/services/routines.ts` — 반복 작업
- `server/src/services/approvals.ts` — 승인 워크플로우

### 4. 환경 매니페스트 (도구/설정 중앙 관리) ← CLI-Anything, gstack

**CLI-Anything**:
- `registry.json` — 도구 레지스트리 (이름, 설치법, 버전)
- `cli-hub-meta-skill/` — 메타 스킬 (도구 설치/관리 자동화)
- `cli-anything-plugin/` — 플러그인 시스템
- 각 도구 폴더 (blender, gimp, obs 등) — 도구별 래퍼 패턴

**gstack**:
- `bin/gstack-update-check` — 자동 업데이트 체크
- `setup/` — 설치/셋업 스크립트
- 스킬별 SKILL.md — 도구 정의 표준

### 5. MCP 통합 게이트웨이 ← CLI-Anything, claude-code

**CLI-Anything**:
- 모든 소프트웨어를 CLI로 래핑 → AI가 쓸 수 있게
- 이 패턴을 MCP로 바꾸면 = 통합 게이트웨이

**claude-code**:
- MCP 서버 연결 구조
- `mcp-servers.json` 설정 패턴

### 6. 자원 모니터링 (GPU/CPU/RAM) ← 오픈소스 필요

references_AI에 **없음.** 외부에서 찾아야 함:
- `nvidia-smi` 래퍼
- `psutil` (Python 시스템 모니터링)
- 또는 Rust 기반: `sysinfo` 크레이트 (musu-port에 추가)

### 7. 사장 로테이션 ← 새로 만들어야 함 (간단)

references에 없음. 하지만 로직 자체가 단순:
- 유저가 접속한 기기의 파트장 = 사장
- 접속 기기 변경 시 사장 교체
- musu-port에 "현재 사장" 상태 추가하면 됨

---

## 우선순위: 뭘 먼저 가져올까

1. **nanoclaw** → 채널 시스템 + 작업 스케줄러 + 라우팅 (메신저 뼈대)
2. **CLI-Anything** → 도구 레지스트리 + 환경 관리 패턴
3. **paperclip** → 에이전트 라이프사이클 + 거버넌스 (이미 참고 중)
4. **openclaw** → 모바일/데스크탑 앱 구조 (나중에)
5. **sysinfo 크레이트** → musu-port에 자원 모니터링 추가
