# Company Capability Repatriation Map

## 목적

`musu_corp`에서 도그푸딩으로 검증된 회사 기능을 `musu-functions`의 정식 제품 capability로 다시 배치한다.

핵심 원칙:

- `musu_corp`는 company instance다.
- `musu-functions`는 product codebase다.
- 따라서 회사 운영으로 먼저 검증된 기능은 다시 제품 bounded context로 환원되어야 한다.

## capability map

| 도그푸딩 기능 | 현재 위치 | 제품 target | 이유 | 우선순위 |
|---|---|---|---|---|
| company/project/agent runtime model | `musu_corp`, `MUSU-WORKS` | `MUSU-WORKS` | 회사/프로젝트/에이전트 모델의 정식 도메인 | P0 |
| queue item / lane state / worker result contract | `musu_corp` | `MUSU-WORKS` + 루트 runtime contract | 회사 운영 모델과 실행 상태를 함께 관리해야 함 | P0 |
| supervisor / watchdog / bounded loop | `musu_corp` | 루트 runtime capability, 이후 `musu-port`/`MUSU-WORKS` 연결 | 제품 전체를 운영하는 control surface이기 때문 | P0 |
| approval / escalation / morning review | `musu_corp` | `MUSU-WORKS` | governance / review / board surface는 company ops 도메인 | P0 |
| control CLI | `musu_corp` | 루트 product control surface | 이후 MCP wrapping의 기반 | P0 |
| Codex / BitNet workforce split | `musu_corp` | 루트 runtime capability + `MUSU-WORKS` policy | worker routing은 회사 정책이면서 제품 runtime 기능이기도 함 | P1 |
| low-cost local worker service | `musu_corp` | 루트 runtime capability | 제품 전체에서 재사용 가능한 worker plane | P1 |
| board decision log / inbox / reports | `musu_corp` | `MUSU-WORKS` | 실제 회사 운영 surface와 직접 연결 | P1 |
| company memory/indexer wiring | `musu_corp` | `MUSU-WORKS` + `musu-indexer` | 회사 메모리는 works, 검색은 indexer가 맡아야 함 | P1 |
| watchdog alert -> review coupling | `musu_corp` | 루트 runtime + `MUSU-WORKS` | 운영 signal과 회사 governance를 잇는 경계 | P1 |
| persistent BitNet employee service | `musu_corp` | 루트 runtime capability | bounded context 공통 infra 성격 | P1 |

## instance-only로 남길 것

- 실제 queue data
- 실제 archived tasks
- 실제 board decisions
- 실제 overnight artifacts
- 실제 운영 policy override

즉 `musu_corp`는 제품 기능의 샘플/운영 인스턴스로 남고, 기능 그 자체의 최종 소유자는 `musu-functions`가 된다.

## first repatriation cuts

1. control CLI surface
2. supervisor / watchdog runtime contract
3. queue / lane / worker result schema
4. approval / escalation / review model
5. worker routing policy

## note

- 지금 단계에서는 실제 코드 이동보다 target context와 우선순위를 먼저 고정한다.
- 각 모듈 구현은 이후 각 bounded context의 마스터 플랜에서 이어간다.
