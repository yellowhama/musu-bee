# PLAN 19: Indexer Memory Wiring

## 목표

`musu-indexer`를 회사 / 프로젝트 / 에이전트 메모리 구조와 연결하는 최소 wiring contract를 고정한다.

## 범위

- preset tree와 indexer sync root 대응
- memory category별 path convention
- search / sync / log_action 사용 흐름
- 회사 메모리와 프로젝트 메모리의 search boundary 규칙

## 현재 truth

- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md) 에 memory 계층은 있다.
- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md) 와 preset examples는 있다.
- `musu-indexer`는 `.musu_dev.db`, `sync_workspace`, `search_codebase`, `log_action`를 제공한다.

## 입력 문서

- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md)
- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md)
- [PRESET_MOCKS_STATUS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PRESET_MOCKS_STATUS_2026-04-01.md)
- [/home/hugh51/musu-functions/musu-indexer/README.md](/home/hugh51/musu-functions/musu-indexer/README.md)

## 작업 목록

1. company / agent / project / session memory path mapping 정의
2. indexer sync root와 metadata convention 정의
3. search boundary와 logging rule 정의
4. example preset에 대한 indexing runbook 작성

## 완료 기준

- `INDEXER_MEMORY_WIRING.md`가 생성된다.
- preset tree를 indexer로 읽는 path rule이 문서로 고정된다.
- viewer / original app parity와 별개로 memory plane contract가 독립적으로 설명된다.
