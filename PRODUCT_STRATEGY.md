# MUSU Product Strategy

## 제품 정의

MUSU는 "AI 회사 운영체계 + 실행 capability" 제품이다.

유저는 채팅을 사는 게 아니라 다음을 산다.

- AI workforce 운영면
- 프로젝트 execution surface
- 로컬/원격 실행 capability
- self-observation / self-control surface
- memory / indexing / review loop

## 채팅/웹 GUI의 포지션 (중요)

채팅은 MUSU의 코어가 아니라 **원격 Web GUI surface**다.

- 기본 인터페이스: `Codex CLI` / `Claude Code` / `MCP`
- Pro 인터페이스: `musu.pro` Web GUI(필요 시 채팅형 UX 포함)로 어디서든 접속해 관측/지시/이어받기

관련 노트: `docs/NOTE_2026-04-09_chat_is_web_gui_not_core.md`

## 유저에게 주는 가치

### 개인 개발자 / 소규모 팀

- 혼자서도 AI 직원 조직처럼 일할 수 있다.
- backlog, implementation, QA, review를 계속 굴릴 수 있다.

### 원격 작업 / 운영 팀

- 로컬 컴퓨터와 원격 기기를 agent가 실제로 다룰 수 있다.
- browser / terminal / desktop / network capability를 운영면에서 연결할 수 있다.

### 기업 / 보안 민감 팀

- self-hosted / bounded runtime / approval flow가 가능하다.
- 사람 승인과 agent 실행을 분리할 수 있다.

## 제품 전략 우선순위

1. generic company operating system
2. product control surface
3. workforce runtime capability
4. bounded context별 실행 capability

## 지금 우선 완성해야 할 것

- `MUSU-WORKS`
  - company runtime / governance contract
- root control layer
  - control CLI / read surface / supervisor status
- root runtime capability
  - Codex / BitNet workforce plane
- `musu-computer-tools`
  - 실제 OS/browser interaction capability

## 제품 성공 기준

- 회사가 이 제품으로 자기 제품을 만들 수 있다.
- 유저가 "AI가 실제로 일을 이어서 한다"고 체감한다.
- capability가 chat demo가 아니라 실제 운영 도구로 작동한다.
