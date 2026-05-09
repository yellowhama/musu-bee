System Status Report for 2026-05-06 00:51:43

## System Information
Linux hughsecond 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux

## Disk Usage
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
C:\Program Files\Docker\Docker\resources  931G  832G   99G  90% /Docker/host

## Running Processes (Top 10 by CPU)
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
hugh51       599 76.7  0.8 1475016 214792 ?      Sl    5월05 606:56 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51   1089294 22.0  1.0 27324844 253128 ?     Sl   00:51   0:05 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51   1089168  8.8  1.1 10632052 276648 ?     Sl   00:51   0:02 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51   1078389  2.8  1.2 27347008 303840 ?     Sl   00:46   0:09 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt ## 진단 결과 (자동 감지)  최근 2시간 실패 태스크 2개   - [4060-CEO] Agent unavailable. Please try again later.   - [team_lead] Agent unavailable. Please try again later. 오래된 workspace 1개 정리  위 이슈를 확인하고 필요 시 create_issue로 등록한 후, 개발 루프를 진행하라.  ---  집사 루프 실행 (wiki/010): 1. 시스템 점검: get_dashboard(), list_nodes() 2. 문제 감지 → 선제 처리 (stuck task cancel, offline 노드 기록) 3. 회사 확인: list_goals(), list_issues() 4. 위임: delegate_task 후 즉시 종료. 폴링 루프 금지. 5. #ceo-board에 상태 보고 --model gemini-2.5-pro --yolo
hugh51      6789  2.0  2.2 75480912 557580 pts/4 Sl+   5월05  16:27 claude
hugh51    161016  0.9  0.0   5776  3200 pts/5    S     5월05   5:41 /bin/bash /home/hugh51/.local/share/codex-mcp/rootless-computer-control/scrot-helper.sh
hugh51    160771  0.7  0.4 415280 120352 pts/5   Sl+   5월05   4:26 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex
hugh51   1065256  0.6  0.4 478128 99816 ?        Ssl  00:42   0:03 /home/hugh51/musu-functions/musu-bridge/.venv/bin/python3 server.py
root         313  0.6  0.3 1322088 91108 ?       Ssl   5월05   4:54 /usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --port=41641
hugh51       565  0.2  0.1 1262144 36948 ?       Ssl   5월05   2:18 /usr/local/bin/cloudflared tunnel run musu-bee
