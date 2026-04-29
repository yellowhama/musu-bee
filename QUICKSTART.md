# MUSU Quick Start

5분이면 AI 에이전트 팀이 돌아간다.

## 1. 설치

```bash
curl -fsSL https://musu.pro/install | bash
```

브라우저가 열리면 musu.pro에서 디바이스 승인. 끝.

## 2. 상태 확인

```bash
musu status
```

Bridge, Bee(웹 UI), connectsd가 running이면 정상.

## 3. 첫 태스크 위임

```bash
musu-delegate engineer "auth.py의 로그인 버그를 고쳐줘. 테스트도 작성해."
```

결과 확인:
```bash
# 터미널에서
curl -s http://localhost:8070/api/tasks/<task_id> | python3 -m json.tool

# 또는 웹에서
open http://localhost:3001/app
```

## 4. 팀으로 일하기

CEO에게 큰 그림을 맡기면 알아서 분배:
```bash
musu-delegate ceo "이번 스프린트 목표: 인증 시스템 리팩터링. 이슈 분해하고 팀에 배분해."
```

CEO → Team Lead → Engineer → QA 파이프라인이 자동으로 돌아감.

## 5. Ralph Loop (무인 자율 운영)

이슈 보드에 할 일 적어놓으면 에이전트 팀이 알아서 처리:
```bash
# 이슈 생성
musu-delegate team_lead "이슈: 로그인 페이지 반응형 디자인"
musu-delegate team_lead "이슈: API rate limiting 구현"
musu-delegate team_lead "이슈: 사용자 프로필 페이지 추가"

# Ralph Loop 시작 (자동으로 이슈 소화)
just ralph <company_id>
```

밤새 돌려놓고 아침에 결과 확인.

## 6. 리서치

```bash
musu-delegate cto "React Server Components vs Client Components 비교 분석해서 wiki에 정리해"
```

결과는 `~/llm-wiki/wiki/`에 자동 저장.

## 7. 웹 대시보드

```
http://localhost:3001/app           메인
http://localhost:3001/app/wiki      위키 + 리서치
http://localhost:3001/app/dashboard 대시보드
http://localhost:3001/app/screen    기기 화면
```

## 다음 단계

- `just wiki-sync` — 기기 간 위키 동기화
- `just check-5070` — 다른 기기 상태 확인
- PRODUCT_README.md — 전체 기능 목록
