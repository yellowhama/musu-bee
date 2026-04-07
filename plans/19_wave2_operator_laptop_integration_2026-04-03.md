# Wave 2 Operator Laptop Integration

## 목표

lane 2 route plane과 lane 3 CRT surface를 묶어, 카페 노트북에서 원격 머신의 read/control surface가 하나의 operator flow로 보이게 한다.

## 선행 조건

- `MUS-45` GO verdict
- `MUS-48` GO verdict
- `MUS-27`, `MUS-28` blocked 해제

## 구현 범위

1. laptop operator entrypoint 정리
   - 어떤 local command / URL / artifact에서 시작하는지 고정
2. route selection과 CRT read path 연결
   - route alias / peer identity / session summary를 operator-visible surface에 묶기
3. artifact handoff 정리
   - generation output, QA output, operator note가 같은 run context를 공유하도록 정리
4. smoke proof 추가
   - operator laptop에서 remote read/control path가 최소 1회 end-to-end로 재현

## 제외 범위

- final autonomous scheduling policy 전체
- NAT traversal production hardening
- public multi-tenant onboarding

## 산출물

- operator integration harness or smoke command
- operator-visible summary artifact
- root/current-state and board update

## 검증

1. operator smoke command 1회 실행
2. route alias / peer identity / CRT summary가 같은 artifact에 찍히는지 확인
3. 실패 시 block reason이 operator-visible하게 남는지 확인

## 완료 기준

- laptop operator가 remote session/read path를 one-flow로 볼 수 있다.
- lane 2와 lane 3의 artifact가 하나의 operator context로 연결된다.
- 다음 dual-GPU scenario packet이 이 flow 위에서 시작될 수 있다.
