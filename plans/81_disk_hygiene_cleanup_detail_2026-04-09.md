# Detail Plan — Disk hygiene (TTL/size caps + cleanup command) (2026-04-09)

목표: MUSU를 “보조 프로그램”으로 상시 운용할 때, 로그/런파일/아티팩트가 누적되어 **디스크가 꽉 차는** 사고를 예방한다.

---

## 1) What we clean (safe scope)

기본 대상은 **사용자 홈 내부**만:
- `~/.musu/logs`
- `~/.musu/run`
- `~/.musu/artifacts`

레포(`~/musu-functions/work`, `test-results/` 등)는 기본 cleanup 대상에서 제외(개발 흔적 삭제 사고 방지).

---

## 2) Policy defaults (override via env)

Dry-run 기본. `--apply`가 있어야 삭제.

- TTL
  - logs: 7 days (`MUSU_CLEANUP_LOGS_TTL_DAYS`)
  - run: 3 days (`MUSU_CLEANUP_RUN_TTL_DAYS`)
  - artifacts: 14 days (`MUSU_CLEANUP_ARTIFACTS_TTL_DAYS`)
- Size caps
  - logs: 1024MB (`MUSU_CLEANUP_LOGS_SIZE_CAP_MB`)
  - run: 100MB (`MUSU_CLEANUP_RUN_SIZE_CAP_MB`)
  - artifacts: 2048MB (`MUSU_CLEANUP_ARTIFACTS_SIZE_CAP_MB`)
- Min age safety
  - do not delete files modified in last 10 minutes (`MUSU_CLEANUP_MIN_AGE_MINUTES`)

---

## 3) Tooling

- Cleanup command (dry-run default): `scripts/musu_cleanup.py`
  - `./scripts/musu_cleanup.py` (summary)
  - `./scripts/musu_cleanup.py --json` (JSON report)
  - `./scripts/musu_cleanup.py --apply --json` (apply deletions)
- Optional user timer:
  - `scripts/systemd/musu-cleanup.{service,timer}`
  - env: `scripts/systemd/cleanup.env.example` → `~/.musu/cleanup.env`
  - installer: `scripts/install-musu-cleanup-user-timer.sh`

---

## 4) Verification

- dry-run에서 planned_delete가 의도대로 계산됨
- `--apply` 시 실제 삭제되고 bytes_freed가 증가
- timer는 daily로 실행되고 journal에 로그가 남음
