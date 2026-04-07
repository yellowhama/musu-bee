# PLAN 01: Company Domain Model

## 목적

`회사 -> 프로젝트` 모델을 PaperClip 아이디어와 MUSU 원본 코드 truth에 맞게 고정한다.

## 왜 지금 하는가

지금 `MUSU-WORKS`는 비전만 있고, 구현의 기준이 되는 회사 domain contract가 없다. 이게 없으면 이후 UI, MCP, persistence, approval 모델이 전부 흔들린다.

## 입력

- [PAPERCLIP.MD](/home/hugh51/musu-functions/MUSU-WORKS/PAPERCLIP.MD)
- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- 원본 코드:
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-node-bridge/src/`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/orchestrator/`
  - `/mnt/f/Aisaak/Projects/Musu-new/engines/vibecoding-helper/crates/gate/src/`

## 고정해야 할 것

1. 회사 ownership
2. 프로젝트 ownership
3. agent attachment 모델
4. approval / policy 레벨
5. memory 분리
6. persistence draft
7. MCP read surface 후보

## 산출물

- 회사/프로젝트 domain model 문서
- 최소 schema 초안
- UI 정보 구조 초안
- MCP surface 후보 목록

## 완료 조건

- "회사란 무엇인가"가 한 문장으로 정의되어 있다.
- 프로젝트와의 ownership boundary가 명확하다.
- agent가 회사 소속인지 프로젝트 소속인지 모호하지 않다.
- approval / audit / policy가 어느 레벨에 있는지 정리돼 있다.
- 다음 mock 구현 플랜으로 내려갈 수 있다.
