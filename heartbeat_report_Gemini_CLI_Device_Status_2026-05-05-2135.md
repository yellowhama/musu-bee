# Heartbeat Report - 2026년 5월 5일 화요일

**System Status Report**

This report contains real-time device status information gathered using standard Linux commands.

## Directory Contents (`ls -la`):

```
total 603536
drwxr-xr-x  48 hugh51 hugh51     12288  5월  5 21:20  .
drwxr-x--- 116 hugh51 hugh51     12288  5월  5 18:47  ..
drwxr-xr-x   3 hugh51 hugh51      4096  4월  3 04:20  .agents
-rw-r--r--   1 hugh51 hugh51       237  4월 13 03:23  .canon.json
drwxr-xr-x   4 hugh51 hugh51      4096  4월 21 09:21  .claude
-rw-r--r--   1 hugh51 hugh51      1780  4월 28 15:48  .clinerules
-rw-r--r--   1 hugh51 hugh51       182  4월 13 03:23  .cto_ping.json
drwxr-xr-x   3 hugh51 hugh51      4096  4월 28 15:48  .cursor
-rw-r--r--   1 hugh51 hugh51      2023  4월 13 03:23  .design_refs_comment.json
-rw-r--r--   1 hugh51 hugh51      1980  4월 13 03:23  .design_refs_comment.md
-rw-r--r--   1 hugh51 hugh51      4557  4월 15 16:17  .env.example
drwxr-xr-x   2 hugh51 hugh51      4096  4월 28 15:48  .gemini
drwxr-xr-x   8 hugh51 hugh51      4096  5월  5 21:33  .git
drwxr-xr-x   3 hugh51 hugh51      4096  4월 13 15:35  .github
-rw-r--r--   1 hugh51 hugh51      2525  4월 29 04:55  .gitignore
drwxrwxr-x   3 hugh51 hugh51      4096  4월 27 08:18  .musu
-rw-r--r--   1 hugh51 hugh51 590401536  5월  5 20:52  .musu_dev.db
-rw-r--r--   1 hugh51 hugh51     65536  5월  5 21:33  .musu_dev.db-shm
-rw-r--r--   1 hugh51 hugh51  25226792  5월  5 21:33  .musu_dev.db-wal
drwxr-xr-x   2 hugh51 hugh51      4096  4월 13 04:57  .paperclip-snapshots
drwxr-xr-x   4 hugh51 hugh51      4096  4월 13 00:13  .para
drwxr-xr-x   3 hugh51 hugh51      4096  4월  7 22:28  .pytest_cache
drwxr-xr-x   4 hugh51 hugh51     12288  4월 14 05:52  .qa-artifacts
drwxr-xr-x   3 hugh51 hugh51      4096  4월 12 23:42  .vibe
-rw-r--r--   1 hugh51 hugh51      1780  4월 28 15:48  .windsurfrules
drwxr-xr-x   5 hugh51 hugh51      4096  4월 14 06:27  .worktrees
-rw-r--r--   1 hugh51 hugh51      2863  4월 28 15:48  AGENTS.md
-rw-r--r--   1 hugh51 hugh51      6453  4월  1 08:05  BILINGUAL_RUNTIME_ARCHITECTURE.md
-rw-rw-r--   1 hugh51 hugh51      1734  5월  5 13:48  BUTLER_DIAGNOSIS_2026-05-05.md
-rw-r--r--   1 hugh51 hugh51       834  4월 28 22:59  BUTLER_FINAL_REPORT_2026-04-28.md
-rw-rw-r--   1 hugh51 hugh51       984  5월  5 13:48  BUTLER_FINAL_REPORT_2026-05-05.md
-rw-r--r--   1 hugh51 hugh51      2435  4월 28 22:48  BUTLER_REPORT_2026-04-28.md
-rw-r--r--   1 hugh51 hugh51      1636  4월 28 23:01  BUTLER_STATUS_REPORT_2026-04-28.md
-rw-rw-r--   1 hugh51 hugh51       811  5월  5 13:39  BUTLER_STATUS_REPORT_2026-05-05.md
-rw-rw-r--   1 hugh51 hugh51      4127  5월  5 13:22  CLAUDE.md
-rw-r--r--   1 hugh51 hugh51     10079  4월  1 09:28  CODEX.MD
-rw-r--r--   1 hugh51 hugh51      2713  4월  9 14:15  CODE_AUDIT_2026-04-08.md
-rw-r--r--   1 hugh51 hugh51      6713  4월 15 20:52  CODE_AUDIT_2026-04-15.md
-rw-r--r--   1 hugh51 hugh51      2847  4월  2 09:21  COMPANY_CAPABILITY_REPATRIATION_MAP.md
-rw-r--r--   1 hugh51 hugh51      1514  4월  2 12:42  COMPANY_STRATEGY.md
-rw-r--r--   1 hugh51 hugh51      1387  4월 13 15:35  CONTRIBUTING.md
-rw-r--r--   1 hugh51 hugh51     22215  4월 15 20:53  CURRENT_STATE.md
-rw-r--r--   1 hugh51 hugh51      1667  4월  2 09:18  DOGFOODING_PRODUCT_MODEL.md
drwxr-xr-x   2 hugh51 hugh51      4096  4월 13 07:07  EVID_DIR_PLACEHOLDER
-rw-r--r--   1 hugh51 hugh51      1412  4월  2 12:42  EXECUTION_STRATEGY.md
-rw-r--r--   1 hugh51 hugh51     18129  4월 14 06:40  HEARTBEAT.md
-rw-r--r--   1 hugh51 hugh51     10903  4월 13 23:09  INSTALL.md
-rw-r--r--   1 hugh51 hugh51      2185  4월 28 14:29  ISSUE_DIAGNOSIS_2026-04-28.md
-rw-r--r--   1 hugh51 hugh51      3202  4월  8 22:17  LOCAL_WORKER_STATUS_REPORT.md
-rw-r--r--   1 hugh51 hugh51      1164  4월  2 12:42  MARKET_AND_REVENUE_MODEL.md
-rw-r--r--   1 hugh51 hugh51     13560  4월 28 13:45  MASTER_BACKLOG_2026-04-14.md
-rw-r--r--   1 hugh51 hugh51     11246  4월  9 22:31  MASTER_PLAN.md
-rw-r--r--   1 hugh51 hugh51      2438  4월  2 12:02  MODULE_REPATRIATION_EXECUTION_SEQUENCE.md
drwxr-xr-x   6 hugh51 hugh51      4096  4월  2 10:42  MUSU-AS-MCP
drwxr-xr-x   9 hugh51 hugh51      4096  4월 13 08:53  MUSU-CRT
drwxr-xr-x   9 hugh51 hugh51      4096  4월  7 14:37  MUSU-WORKS
-rw-r--r--   1 hugh51 hugh51     10822  4월  9 14:21  MUSU_BLUEPRINT.md
-rw-r--r--   1 hugh51 hugh51      4522  4월  2 21:45  NEXT_SESSION_REBOOT_RECOVERY_AND_WORK_PLAN_2026-04-02.md
-rw-r--r--   1 hugh51 hugh51      4284  4월 13 22:00  NEXT_STEPS.md
-rw-r--r--   1 hugh51 hugh51      1661  4월 28 22:35  PAPERCLIP_API_FAILURE_REPORT.md
drwxr-xr-x   5 hugh51 hugh51      4096  4월 28 13:57  PAPERCLIP_OPERATIONS
-rw-r--r--   1 hugh51 hugh51      1931  4월  3 08:50  PAPERCLIP_PROGRAM_REVIEW_2026-04-03.md
-rw-r--r--   1 hugh51 hugh51      1455  4월  2 09:21  PRODUCTIZATION_SEQUENCE.md
-rw-r--r--   1 hugh51 hugh51      2589  4월  9 14:20  PRODUCT_CONTROL_SURFACE_MAP.md
-rw-r--r--   1 hugh51 hugh51      4928  4월 13 16:37  PRODUCT_CORE.md
-rw-r--r--   1 hugh51 hugh51      3733  4월 29 12:11  PRODUCT_README.md
-rw-r--r--   1 hugh51 hugh51      1964  4월  9 14:20  PRODUCT_STRATEGY.md
-rw-rw-r--   1 hugh51 hugh51     26038  4월 25 03:56  PRODUCT_VISION.md
-rw-r--r--   1 hugh51 hugh51     11555  4월  7 19:57 'PaperClip + Hermes Agent + Gemma4.md'
-rw-r--r--   1 hugh51 hugh51      1953  4월 29 12:12  QUICKSTART.md
-rw-rw-r--   1 hugh51 hugh51      7301  4월 25 03:56  README.md
-rw-r--r--   1 hugh51 hugh51      5672  4월  9 15:12  REFERENCES_INDEX.md
-rw-r--r--   1 hugh51 hugh51      9809  4월  3 08:52  ROOT_ACCEPTANCE_BUNDLE_2026-04-03.md
-rw-r--r--   1 hugh51 hugh51      1280  4월  2 10:41  ROOT_PRODUCTIZATION_BACKLOG.md
-rw-r--r--   1 hugh51 hugh51      1600  4월  2 10:44  ROOT_PRODUCT_CONTROL_LAYER_MODEL.md
-rw-r--r--   1 hugh51 hugh51      1421  4월  2 10:44  ROOT_RUNTIME_CAPABILITY_MODEL.md
-rw-r--r--   1 hugh51 hugh51     12513  4월  9 14:15  SECURITY_AUDIT_2026-04-08.md
-rw-r--r--   1 hugh51 hugh51      2069  4월  7 13:10  SETUP_REMOTE_NODE.md
-rw-r--r--   1 hugh51 hugh51       654  4월  2 12:42  WHAT_WE_CAN_DO_HERE_NOW.md
-rw-r--r--   1 hugh51 hugh51      1665  4월  2 10:41  WORKFORCE_PLANE_PRODUCTIZATION_MAP.md
drwxr-xr-x   4 hugh51 hugh51      4096  4월 24 06:56  _archived
-rw-r--r--   1 hugh51 hugh51      4410  5월  5 13:29  agents.json
drwxr-xr-x 213 hugh51 hugh51     20480  4월 14 07:18  artifacts
drwxr-xr-x   2 hugh51 hugh51      4096  4월 27 21:18  bin
-rw-rw-r--   1 hugh51 hugh51      2508  5월  5 00:48  butler_script.py
-rw-r--r--   1 hugh51 hugh51      4501  4월 28 21:47  ceo-board-update-2026-04-28.md
-rw-r--r--   1 hugh51 hugh51      1830  4월 28 21:59  ceo_board_report_2026-04-28.md
-rw-rw-r--   1 hugh51 hugh51      1867  5월  5 13:51  ceo_board_report_2026-05-05.md
-rw-r--r--   1 hugh51 hugh51       129  4월 28 22:03  coherence_report.json
-rw-r--r--   1 hugh51 hugh51       434  4월 28 22:03  coherence_report.md
-rw-rw-r--   1 hugh51 hugh51       938  5월  5 12:46  create_paperclip_issue.py
drwxr-xr-x   2 hugh51 hugh51      4096  5월  5 21:34  data
drwxr-xr-x   3 hugh51 hugh51      4096  4월 23 02:12  design-handoff
-rw-r--r--   1 hugh51 hugh51         0  4월 26 16:25  dev.db
drwxr-xr-x  13 hugh51 hugh51      4096  4월 29 12:37  docs
-rw-rw-r--   1 hugh51 hugh51        76  5월  5 20:31  get_company_id.py
-rw-rw-r--   1 hugh51 hugh51      6318  5월  5 21:15  heartbeat_report.md
-rw-r--r--   1 hugh51 hugh51      1708  4월 28 22:51  heartbeat_report_2026-04-28.md
-rw-r--r--   1 hugh51 hugh51       115  4월 28 21:46  heartbeat_report_2026-04-28.md.response
-rw-rw-r--   1 hugh51 hugh51      2862  5월  5 14:19  heartbeat_report_2026-05-05.md
-rw-rw-r--   1 hugh51 hugh51       834  5월  5 13:16  heartbeat_report_Gemini_CLI.md
-rw-rw-r--   1 hugh51 hugh51      4673  5월  5 19:25  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-192518.md
-rw-rw-r--   1 hugh51 hugh51      4652  5월  5 19:52  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-195204_AGENT.md
-rw-rw-r--   1 hugh51 hugh51      4673  5월  5 20:15  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-201534.md
-rw-rw-r--   1 hugh51 hugh51      4652  5월  5 20:42  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-204228_AGENT.md
-rw-rw-r--   1 hugh51 hugh51      6759  5월  5 20:46  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-204616.md
-rw-rw-r--   1 hugh51 hugh51       478  5월  5 20:52  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-205207.md
-rw-rw-r--   1 hugh51 hugh51      2784  5월  5 21:20  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05-212044.md
-rw-rw-r--   1 hugh51 hugh51      8901  5월  5 20:56  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05.md
-rw-rw-r--   1 hugh51 hugh51      1298  5월  5 21:10  heartbeat_report_Gemini_CLI_Device_Status_2026-05-05_NEW_REPORT.md
-rw-rw-r--   1 hugh51 hugh51       828  5월  5 19:05  heartbeat_report_Gemini_CLI_Self_Generated_2026-05-05-154900.md
-rw-rw-r--   1 hugh51 hugh51       797  5월  5 17:25  heartbeat_report_Gemini_CLI_Self_Generated_2026-05-05.md
-rwxr-xr-x   1 hugh51 hugh51     27256  4월 29 14:57  install.sh
-rw-r--r--   1 hugh51 hugh51       635  4월 28 22:59  issues_full.json
-rw-r--r--   1 hugh51 hugh51      2399  4월 29 12:18  justfile
drwxr-xr-x   2 hugh51 hugh51      4096  4월 24 03:57  linked_projects
drwxr-xr-x   2 hugh51 hugh51      4096  5월  5 00:00  logs
drwxr-xr-x   3 hugh51 hugh51      4096  4월  4 20:25  musu-ai
drwxr-xr-x  18 hugh51 hugh51      4096  4월 30 14:00  musu-bee
drwxr-xr-x  13 hugh51 hugh51      4096  5월  3 08:16  musu-bridge
drwxr-xr-x   7 hugh51 hugh51      4096  4월 25 12:29  musu-control
drwxr-xr-x   7 hugh51 hugh51      4096  4월 17 16:10  musu-core
drwxr-xr-x  12 hugh51 hugh51      4096  4월 27 06:14  musu-indexer
-rw-r--r--   1 hugh51 hugh51      1625  4월  1 11:51  musu-indexer-guide.md
drwxr-xr-x   8 hugh51 hugh51      4096  4월  9 02:07  musu-plugin
drwxr-xr-x  14 hugh51 hugh51      4096  4월 14 16:31  musu-port
drwxr-xr-x   6 hugh51 hugh51      4096  4월 24 03:16  musu-relay
drwxr-xr-x   5 hugh51 hugh51      4096  4월  7 23:04  musu-supervisor
drwxr-xr-x   6 hugh51 hugh51      4096  4월 17 06:02  musu-worker
-rw-r--r--   1 hugh51 hugh51      1037  4월 25 12:47  musu.toml.template
-rw-r--r--   1 hugh51 hugh51       217  4월 28 15:48  opencode.json
-rw-rw-r--   1 hugh51 hugh51       788  5월  5 12:45  paperclip_checker.py
drwxr-xr-x   2 hugh51 hugh51     20480  4월 28 13:57  plans
-rw-rw-r--   1 hugh51 hugh51        63  4월 22 23:15  pytest.ini
drwxr-xr-x   3 hugh51 hugh51      4096  4월 12 03:51  qa-artifacts
drwxr-xr-x   8 hugh51 hugh51      4096  4월 15 09:14  references
lrwxrwxrwx   1 hugh51 hugh51        26  4월  7 13:50  references_AI -> /home/hugh51/references_AI
-rwxr-xr-x   1 hugh51 hugh51      2843  4월 27 21:15  remote-node-update.sh
-rwxrwxr-x   1 hugh51 hugh51        49  5월  5 13:24  restart.sh
drwxr-xr-x   5 hugh51 hugh51      4096  4월 29 22:31  scripts
-rwxr-xr-x   1 hugh51 hugh51      1194  4월 29 05:56  setup.sh
drwxr-xr-x   4 hugh51 hugh51      4096  4월 10 15:14  skills
-rw-r--r--   1 hugh51 hugh51   1257086  5월  5 13:18  temp_log.txt
drwxr-xr-x   3 hugh51 hugh51      4096  5월  5 13:42  tests
drwxr-xr-x   4 hugh51 hugh51      4096  4월 27 04:58  tools
drwxr-xr-x   2 hugh51 hugh51      4096  4월  1 10:25  viewer
-rw-r--r--   1 hugh51 hugh51    151552  4월 13 22:26  wiki.db
-rw-r--r--   1 hugh51 hugh51     32768  4월 30 14:18  wiki.db-shm
-rw-r--r--   1 hugh51 hugh51         0  4월 30 14:18  wiki.db-wal
drwxr-xr-x  81 hugh51 hugh51      4096  4월 15 16:32  work
-rw-r--r--   1 hugh51 hugh51         0  4월  1 09:28 '새 텍스트 문서.txt'
```

## Disk Usage (`df -h`):

```
Filesystem                                Size  Used Avail Use% Mounted on
none                                       12G     0   12G   0% /usr/lib/modules/6.6.87.2-microsoft-standard-WSL2
none                                       12G  4.0K   12G   1% /mnt/wsl
none                                       12G  2.9M   12G   1% /mnt/wsl/docker-desktop/shared-sockets/host-services
/dev/sde                                  129M   66M   54M  55% /mnt/wsl/docker-desktop/docker-desktop-user-distro
/dev/loop0                                716M  716M     0 100% /mnt/wsl/docker-desktop/cli-tools
drivers                                   931G  832G   99G  90% /usr/lib/wsl/drivers
/dev/sdd                                 1007G  301G  656G  32% /
none                                       12G  124K   12G   1% /mnt/wslg
none                                       12G     0   12G   0% /usr/lib/wsl/lib
rootfs                                     12G  2.7M   12G   1% /init
none                                       12G  992K   12G   1% /run
none                                       12G     0   12G   0% /run/lock
none                                       12G  168K   12G   1% /run/shm
none                                       12G   76K   12G   1% /mnt/wslg/versions.txt
none                                       12G   76K   12G   1% /mnt/wslg/doc
C:\                                       931G  832G   99G  90% /mnt/c
D:\                                       3.7T  3.7T  2.5G 100% /mnt/d
E:\                                       3.7T  3.7T   12G 100% /mnt/e
F:\                                       7.3T  626G  6.7T   9% /mnt/f
G:\                                       7.3T  7.2T   91G  99% /mnt/g
I:\                                       1.9T  4.0M  1.9T   1% /mnt/i
snapfuse                                   67M   67M     0 100% /snap/core24/1587
snapfuse                                   67M   67M     0 100% /snap/core24/1499
snapfuse                                   50M   50M     0 100% /snap/snapd/26865
snapfuse                                   49M   49M     0 100% /snap/snapd/26382
tmpfs                                     2.4G   36K  2.4G   1% /run/user/1000
tmpfs                                     2.4G   24K  2.4G   1% /run/user/0
C:\Program Files\Docker\Dockeresources  931G  832G   99G  90% /Docker/host
```

## Memory Usage (`free -h`):

```
               total        used        free      shared  buff/cache   available
Mem:            23Gi       6.4Gi       794Mi        22Mi        16Gi        17Gi
Swap:          8.0Gi       4.5Mi       8.0Gi
```

## System Uptime (`uptime`):

```
 21:35:33 up  9:35,  2 users,  load average: 2.57, 3.24, 3.22
```

## Operating System
- `linux`

## Current Date
- 2026년 5월 5일 화요일
