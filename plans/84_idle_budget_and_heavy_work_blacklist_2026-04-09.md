# Detail Plan — Idle Budget & Heavy-Work Blacklist (2026-04-09)

## 목표

MUSU core의 idle 비용 목표를 숫자로 고정하고, core에서 금지할 heavy-work를 blacklist로 명문화한다.

## 현재 truth

- 현재 worker 보호장치는 일부 구현됐지만, “core는 어느 정도까지 가벼워야 하는가”가 숫자로 닫히지 않았다.
- 문서상 원칙은 분명하다.
  - MUSU는 보조 운영층이다.
  - heavy compute는 밖으로 보내야 한다.
- 하지만 금지 목록과 acceptance budget이 아직 표준화되지 않았다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/musu-port`
- `/home/hugh51/musu-functions/musu-connects`
- `/home/hugh51/musu-functions/MUSU-CRT`
- `/home/hugh51/musu-functions/musu-worker`
- `/home/hugh51/musu-functions/INSTALL.md`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`

## 범위

- idle / normal / stress budget 제안
- heavy-work blacklist 명시
- baseline 측정 명령과 evidence 형식 정의

## 제외 범위

- 실제 profiler 도입
- 실제 코드 최적화 구현
- worker/job queue 재설계

## 구현 작업 목록

1. idle budget 정의
   - CPU
   - RAM
   - GPU
   - disk write
   - network heartbeat
2. normal/stress 상태 정의
   - UI open
   - multi-node metadata view
   - worker burst under cap
3. heavy-work blacklist 정의
   - core에서 금지할 연산 목록
   - worker/service로 보내야 할 연산 목록
4. 측정 기준/증거 형식 정의
   - sampling duration
   - snapshot format
   - replay commands

## 검증 명령

```bash
curl -sf http://127.0.0.1:9700/stats
ps -eo pid,pcpu,pmem,rss,cmd | rg 'musu|worker|bridge'
free -h
df -h
nvidia-smi --query-gpu=name,memory.used,utilization.gpu --format=csv,noheader
```

## 기대 artifact / evidence

- idle budget 표
- heavy-work blacklist 표
- baseline measurement note
- owner별 acceptance gate

## 리스크 / 보류 항목

- GPU/GUI 환경 차이로 절대 수치는 머신별 편차가 있을 수 있다.
- 따라서 1차는 “절대 상한 + 운영 목표” 형태로 정의한다.

## 완료 기준

- “core가 어느 정도까지 먹어도 되는지”가 숫자로 명시된다.
- “무슨 일은 절대 core에서 하지 않는다”가 blacklist로 문서화된다.

## 다음 handoff 또는 TODO 연결

- 후속: `/home/hugh51/musu-functions/plans/85_event_driven_refresh_and_sampling_2026-04-09.md`
- 후속: `/home/hugh51/musu-functions/plans/86_core_worker_ui_boundary_enforcement_2026-04-09.md`
