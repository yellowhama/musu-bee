# Product Control Surface Map

## 목적

`musu_corp`에서 도그푸딩된 control surface를 `musu-functions`의 정식 제품 control layer 후보로 고정한다.

## 채팅/웹 GUI의 포지션 (중요)

채팅은 MUSU의 코어가 아니라 **원격 Web GUI surface**다.

- 기본 사용: `Codex CLI` / `Claude Code` / `MCP`
- Pro 사용: `musu.pro` Web GUI(필요 시 채팅형 UX 포함)로 control surface를 “어디서든” 접근 가능하게 만든다.

관련 노트: `docs/NOTE_2026-04-09_chat_is_web_gui_not_core.md`

## source surfaces

- `musu_corp_cli.py`
- queue list / queue create
- lane status / lane logs
- run scheduler / executor / heartbeat / watchdog / supervisor / morning-review / bitnet-server
- approval decide
- report latest

## product interpretation

이 surface는 단순 회사 스크립트가 아니라, MUSU 제품이 자기 자신과 회사 runtime을 읽고 제어하는 기본 control plane 후보다.

즉 제품 관점에서는 아래처럼 읽는다.

### read surfaces

- queue status
- lane status
- runtime artifact / report status
- watchdog / supervisor / morning review summary

### control surfaces

- scheduler tick
- executor tick
- watchdog ensure
- supervisor run
- approval decision
- low-cost worker service ensure

## target owner

- 1차 owner: `musu-functions` 루트 product control layer
- 이후 wrapping 후보:
  - CLI
  - MCP tool surface
  - desktop self-control surface
  - (Pro) `musu.pro` Web GUI surface (optional chat UI)

## translation layer (필수)

유저의 “요청(자연어/지시)”이 곧바로 control surface 명령으로 실행되는 것이 아니라,
중간에 반드시 다음 번역이 필요하다.

- 요청(자연어 or CLI 명령) → `Task/Run/Approval/Policy`로 정규화 → queue/lane/watchdog/supervisor 명령군으로 실행

이 번역 계층이 있어야 “웹 GUI(채팅형 가능)”와 “제품 control layer”가 서로 분리된 채로도 일관된 실행이 가능하다.

## `MUSU-WORKS`와의 관계

- `MUSU-WORKS`는 company domain과 governance contract owner다.
- 하지만 control surface 그 자체는 루트 product control capability가 먼저 가진다.
- `MUSU-WORKS`는 이 surface가 읽고 쓰는 domain object를 제공하는 쪽이 맞다.

## first productization cut

1. queue/lane/report read surface
2. runtime run surface
3. approval/report review surface

## note

- 실제 customer/company data는 `musu_corp` 인스턴스에 남을 수 있다.
- 하지만 control surface의 구조와 명령 체계는 제품 capability로 환원돼야 한다.
