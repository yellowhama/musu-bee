# Detail Plan — systemd/cgroup Guardrails for `musu-worker` (2026-04-09)

목표: MUSU는 “주가 되는 프로그램이 아닌 보조 프로그램”이므로, 상시 실행 시에도 머신을 잡아먹지 않게 **OS 레벨에서 강제 제한**을 건다.

---

## 1) Approach

- `systemctl --user` 기반 user service로 설치(머신별/계정별 분리, sudo 불필요)
- 기본값은 “안전한 사이드카” 수준:
  - `CPUQuota=30%`
  - `MemoryMax=4096M`
  - `TasksMax=128`
  - `Nice=10`, `IOSchedulingPriority=7`
- 설정은 개인 로컬 파일 `~/.musu/worker.env`로(레포 hardcode 금지)

---

## 2) Files

- unit: `scripts/systemd/musu-worker.service`
- env template: `scripts/systemd/worker.env.example`
- installer: `scripts/install-musu-worker-user-service.sh`

---

## 3) Install / Operate

```bash
cd ~/musu-functions
./scripts/install-musu-worker-user-service.sh
```

Tune(더 낮게/높게):
```bash
systemctl --user edit musu-worker
# drop-in에서 CPUQuota/MemoryMax/TasksMax 조절
systemctl --user restart musu-worker
```

---

## 4) Verification

- idle 상태 CPU 0% 근처(요청 없으면 거의 사용 없음)
- 동시 실행 cap + CPUQuota로 폭주 시에도 OS 프리징 최소화

