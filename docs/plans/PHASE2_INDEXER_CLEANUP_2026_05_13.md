# Phase 2 — WSL indexer 완전 종료 (2026-05-13)

> Master plan [BOUNDARY_MASTER_PLAN_2026_05_13.md](./BOUNDARY_MASTER_PLAN_2026_05_13.md) §Phase 2.
>
> 사용자 결정: WSL 의 musu-indexer 운영 (cron auto-index, MCP servers, ad-hoc sync 등) 을 완전히 꺼서 Windows 측 indexer 만 truth 가 되도록.

## 목표

WSL 측의 모든 musu-indexer 자동화 + 진행 중 프로세스 를 종료하고, 향후 Windows 측만 indexer 운영. WSL `.musu_dev.db` 는 그대로 보존 (사용자 일상 데이터의 일부일 수 있음 — 함부로 삭제 안 함).

## 사전 진단

현재 WSL 에 있는 자동화:

| Trigger | 명령 | 결과 |
|---|---|---|
| cron `0 * * * *` | `~/musu-functions/scripts/auto-index.sh` | 매시 정각 indexer sync — DB 키우는 주요 원인 |
| MCP server (HTTP :9701) | `musu-indexer mcp --http --port 9701` (PID 1730725) | AI 도구가 codebase 검색용 — 옛 root 봄 |
| MCP server (stdio) | `musu-indexer mcp` (PID 3852401) | Claude Code 등이 stdio 로 attach |
| systemd user 서비스 | `musu-autoupdate.timer`, `musu-backup.timer`, etc. | musu-functions 의 별 자동화 (indexer 아님) — 건드리지 않음 |

진행 중 sync (Phase 1 시작 시 봤던 stuck 프로세스들):
- `4098547/4098548` — musu-scanner index, WSL root, 1시간 째 도는 중
- `4101047` — `/home/hugh51/bin/musu-indexer-linux index ~/.musu_dev.db ...` (홈 디렉토리 index)

## 안 건드릴 것

- **WSL `.musu_dev.db` 파일들** — 사용자 데이터. 보존.
- **`~/musu-functions` working tree** — 사용자 다른 branch 작업.
- **systemd `musu-*.timer` / `.service`** — bridge/worker/autoupdate 등 인덱서 무관 서비스.
- **`musu_corp` healthcheck/self-heal cron** — paperclip 영역, indexer 아님.

## 단계

1. **현재 도는 indexer 프로세스 전부 kill** — `pkill -9 -f 'musu-indexer'` + `pkill -9 -f 'musu-scanner'`.
2. **WSL cron 의 `auto-index.sh` 라인 disable** — comment out (`#` prefix), 그대로 두면 사용자가 나중에 복구 쉬움. crontab edit.
3. **`scripts/opencode-session-archive.sh` cron 도 같이 확인** — indexer 가 아닌 것 같지만 30분마다 도는 거라 영향 점검.
4. **MCP servers stop 후 autostart 추적** — kill 후 5초 뒤 다시 살아나는지. 살아나면 어디서 launch 하는지 (.bashrc / autostart) 찾아서 disable.
5. **DB lock 해소 검증** — `lsof | grep .musu_dev.db` 또는 `fuser .musu_dev.db-wal` 가 empty 인지.
6. **Windows clone 에서 sync 재실행** — Phase 1 이 깨지지 않았는지 확인. lock 없는 상태에서 깨끗하게 sync.

## 위험

- **MCP server 자동 재시작 메커니즘이 systemd 단위로 있을 수 있음**: `systemctl --user list-units | grep musu-indexer` 확인 필요. 있으면 stop + disable.
- **사용자가 다른 터미널 / IDE 에서 MCP server 에 의존할 수 있음**: Claude Code 가 stdio 로 attach 한 게 그것일 가능성. kill 시 그 세션 깨짐 — 사용자 수용.
- **DB 파일은 보존하지만 WAL 가 stale 일 수 있음**: WAL 만 별도 backup 후 truncate 도 옵션. 다만 사용자 데이터 보존 우선 → WAL 그대로.

## 검증

- [ ] `pgrep -af musu-indexer` empty (PATH 의 user binary 포함)
- [ ] `pgrep -af musu-scanner` empty
- [ ] crontab 의 `auto-index.sh` 라인 commented out
- [ ] systemd 의 indexer 관련 unit 없음 (확인)
- [ ] WSL `~/.musu_dev.db-wal` 의 LWT 가 5분 이상 안 갱신 (idle)
- [ ] Windows indexer sync 가 DB lock 없이 작동

## Status — COMPLETE

- [x] 1. kill 모든 indexer/scanner 프로세스 (`pkill -9`, 3개 죽음: 2 WSL scanner + 1 home-dir indexer)
- [x] 2. crontab `auto-index.sh` 라인 disable (commented out + backup `/tmp/crontab-backup-20260513-210559.txt`)
- [x] 3. opencode-session-archive 영향 점검 — indexer 와 무관 (opencode DB archive 전용), 그대로 둠
- [x] 4. MCP server autostart 추적 — 15s 후 부활 없음. bashrc/profile/autostart 도 indexer 참조 없음. = 사용자 도구 (Claude Code 등) 가 직접 launch 했던 것. 자동 부활 없음.
- [x] 5. DB lock 검증 — Windows 측에 stuck PID 33072 (background sync 잔재) 발견, kill 후 lock 풀림
- [x] 6. Windows sync 재실행 — exit 0, `scanned=14027 changed=744 reused=13283`, 47s
- [ ] commit (다음, Phase 5 closure 와 묶거나 즉시)

## 추가 발견

- **Windows 측에도 stuck indexer process 존재**: Phase 1 의 background sync 가 silently failed 했지만 PID 33072 (scanner) 가 zombie 로 lock 잡고 있었음. WSL kill 했어도 Windows 측이 lock 보유. → kill 필요.
- **WSL `~/.musu_dev.db-wal` checkpoint**: WSL DB 의 WAL 가 indexer kill 후 자동으로 truncate/flush. 명시적 checkpoint 안 해도 SQLite 가 처리.
- **MCP servers 가 systemd 가 아닌 ad-hoc launch**: bashrc/autostart 어디에도 등록 안 됨. **사용자가 IDE/CLI 에서 직접 시작** = 다음에 그 IDE/CLI 켜면 다시 살아남. 영구 종료 아닌 "이번 세션에서 종료". Phase 4 의 BOUNDARY doc 에 사용자가 그 도구 설정 변경 가이드 필요.

## 다음

Phase 3 — Scheduled Task LogonType S4U 전환.
