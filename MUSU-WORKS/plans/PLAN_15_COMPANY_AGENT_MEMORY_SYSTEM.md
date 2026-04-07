# PLAN 15: Company Agent Memory System

## 목표

`musu-indexer`와 기존 canonical contract를 연결해 `회사 -> agent -> 프로젝트 -> 세션` memory system 초안을 고정한다.

## 범위

- memory scope 정의
- category 체계 정의
- folder vs DB 전략 비교
- indexer 연동 방식 정의
- stability/evolution 효과 설명

## 현재 truth

- `musu-indexer`는 `.musu_dev.db`와 FTS5 기반 검색을 제공한다.
- `MUSU-WORKS`에는 company/project/role/session 계약이 있다.
- OpenClaw npm에는 memory runtime / embeddings 관련 축이 있다.

## 작업 목록

1. company/agent/project/session memory scope 정리
2. memory category 체계 정리
3. 인덱서 연결 방식 정의
4. persistence 후보 정리
5. backport relevance 정리

## 완료 기준

- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md) 가 생성된다.
- memory 구조가 `업무 안정성`과 `스스로 진화` 관점에서 설명된다.
- indexer와 canonical contract의 연결점이 문서화된다.
