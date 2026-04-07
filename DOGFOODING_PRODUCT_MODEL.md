# MUSU Dogfooding Product Model

## 핵심 정의

- `musu_corp` = 현재 MUSU의 회사 개념을 강하게 도그푸딩하는 company instance
- `musu-functions` = 그 회사가 실제로 만드는 제품 프로젝트
- `Musu-new` = reference monolith

즉 지금까지 만든 회사 운영 기능은 “버릴 임시물”이 아니라, 제품 기능 후보를 실제 운영으로 검증하는 장치다.

## 현재 해석

지금 `musu_corp`에는 원래 MUSU 본체에 있어야 할 기능도 일부 섞여 있다.

예:

- queue / approval / escalation / watchdog / supervisor
- Codex / BitNet workforce split
- morning review / board decision surface
- company runtime / lane state / worker result

이건 이상한 게 아니라, 현재 단계가 `company-first dogfooding`이기 때문이다.

## 다음 원칙

1. `musu_corp`에서 먼저 운영으로 검증한다
2. 검증된 기능을 `musu-functions`의 정식 capability로 환원한다
3. 회사 인스턴스에만 남길 것과 제품 capability로 올릴 것을 분리한다

## 제품으로 환원될 가능성이 높은 것

- company/project/agent runtime model
- queue / worker / supervisor / watchdog control surface
- approval / escalation / review surface
- low-cost local worker + manager worker split
- control CLI / MCP wrapping 후보

## 회사 인스턴스에 남길 것

- 실제 운영 데이터
- 실제 board decisions
- 실제 overnight run artifacts
- 실제 customer/project-specific policy

## 루트에서 해야 할 일

1. `musu_corp -> musu-functions` capability mapping 고정
2. 어떤 bounded context로 되돌릴지 결정
3. 각 모듈 플랜에 우선순위로 연결
