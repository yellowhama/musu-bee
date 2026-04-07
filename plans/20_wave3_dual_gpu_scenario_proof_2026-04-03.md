# Wave 3 Dual GPU Scenario Proof

## 목표

강한 GPU 머신과 보조 GPU 머신을 역할 분담으로 묶어 MUSU의 대표 시나리오를 proof artifact 기준으로 닫는다.

## 대표 시나리오

1. strong GPU desktop
   - generation workload 실행
2. support GPU desktop
   - vision QA / tagging 실행
3. cafe laptop
   - operator review / retry / next dispatch

## 구현 범위

1. workload routing contract
   - 어떤 workload가 어떤 capability로 가는지 명시
2. artifact handoff contract
   - generation output -> QA/tagging -> operator review 경로 고정
3. failure / retry handoff
   - QA reject, tagging incomplete, operator retry를 같은 chain 안에서 표현
4. scenario runbook
   - 최소 1개의 canonical scenario replay command 집합 작성

## 선행 조건

- `MUS-29` lane-4 artifact 확보
- `MUS-50` operator integration 완료

## 검증

1. generation artifact 생성
2. QA/tagging artifact 생성
3. operator review artifact 생성
4. 세 artifact가 같은 chain id 또는 equivalent run context로 연결됨을 확인

## 완료 기준

- "카페 노트북 -> 집 GPU 2대" 사용자 시나리오가 runbook과 artifact로 재현된다.
- MUSU가 단일 capability가 아니라 personal on-prem AI operation이라는 점이 proof로 남는다.
