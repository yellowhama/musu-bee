# Detail Plan — Event-Driven Refresh & Sampling Discipline (2026-04-09)

## 목표

polling/tick 중심 경로를 inventory화하고, event/delta/wake-on-demand 구조로 바꿀 우선순위를 고정한다.

## 현재 truth

- heartbeat/wake-on-demand 일부 설정은 이미 들어가 있다.
- 하지만 전체 repo 기준으로 어디가 polling/tick 기반인지 문서화된 inventory가 없다.
- UI/control plane/diagnostics가 실시간처럼 보이기 위해 과도한 refresh를 할 위험이 남아 있다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/musu-port`
- `/home/hugh51/musu-functions/musu-connects`
- `/home/hugh51/musu-functions/MUSU-CRT`
- `/home/hugh51/musu-functions/musu-bee`
- `/home/hugh51/musu-functions/scripts`

## 범위

- polling loop inventory
- delta/event 전환 우선순위
- UI sampling 규칙
- background/hidden view 감속 규칙

## 제외 범위

- 실제 loop 제거 구현
- 프론트엔드 대규모 리팩터
- 새 event bus 도입

## 구현 작업 목록

1. polling inventory 작성
   - fixed interval loop
   - status refresh
   - queue reorder
   - file/route sync poll
2. 전환 우선순위 분류
   - 즉시 전환
   - 유지 가능
   - fallback polling only
3. UI sampling 규칙 정의
   - active pane refresh interval
   - background tab pause
   - log virtualization
   - demand-load panels
4. evidence/diagnostics refresh 규칙 정의
   - 상태 변화 시 생성
   - burst mode vs idle mode

## 검증 명령

```bash
rg -n "setInterval|poll|tick|heartbeat|refresh" /home/hugh51/musu-functions/musu-port /home/hugh51/musu-functions/musu-connects /home/hugh51/musu-functions/MUSU-CRT /home/hugh51/musu-functions/musu-bee
curl -sf http://127.0.0.1:9700/stats
```

## 기대 artifact / evidence

- polling inventory table
- conversion priority table
- UI sampling policy note
- “event first, poll fallback” 운영 규칙

## 리스크 / 보류 항목

- 일부 loop는 외부 라이브러리/프레임워크 제약으로 즉시 제거하기 어렵다.
- 이 경우 주기 완화 + visibility gating을 우선 적용 대상으로 둔다.

## 완료 기준

- repo 안 polling hot spot 목록이 생긴다.
- 어떤 경로를 event/delta로 바꿀지 우선순위가 정해진다.
- UI가 실시간처럼 보여도 실제론 절제된 sampling을 쓰도록 정책이 고정된다.

## 다음 handoff 또는 TODO 연결

- 후속: `/home/hugh51/musu-functions/plans/86_core_worker_ui_boundary_enforcement_2026-04-09.md`
