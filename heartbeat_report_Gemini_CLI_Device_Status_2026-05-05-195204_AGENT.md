System Status Report for 2026-05-05 19:52:04  ## System Information Linux hughsecond 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux  ## Disk Usage Filesystem                                Size  Used Avail Use% Mounted on
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
C:\Program Files\Docker\Docker\resources  931G  832G   99G  90% /Docker/host  ## Running Processes (Top 10 by CPU) USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
hugh51    544632  100  0.0   9452  4352 pts/6    R+   19:52   0:00 ps aux --sort=-%cpu
hugh51       599 38.2  0.9 1474632 222892 ?      Sl   12:11 176:26 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51    544626 33.3  0.0   5776  3584 pts/6    Ss+  19:52   0:00 /usr/bin/bash -c shopt -u promptvars nullglob extglob nocaseglob dotglob; { echo "System Status Report for $(date '+%Y-%m-%d %H:%M:%S')  ## System Information $(uname -a)  ## Disk Usage $(df -h)  ## Running Processes (Top 10 by CPU) $(ps aux --sort=-%cpu | head -n 11)" > heartbeat_report_Gemini_CLI_Device_Status_$(date '+%Y-%m-%d-%H%M%S')_AGENT.md; }; __code=$?; pgrep -g 0 >/tmp/shell_pgrep_5a63468e1d38.tmp 2>&1; exit $__code;
hugh51    543329 13.5  2.6 27942012 658656 ?     Sl   19:51   0:06 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51    543206  6.4  1.1 10633772 285312 ?     Sl   19:51   0:03 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51      6789  3.1  2.2 75480912 554968 pts/4 Sl+  12:15  14:33 claude
hugh51    161016  0.9  0.0   5776  3200 pts/5    S    15:12   2:37 /bin/bash /home/hugh51/.local/share/codex-mcp/rootless-computer-control/scrot-helper.sh
hugh51    160771  0.7  0.4 414136 119520 pts/5   Sl+  15:11   2:08 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex
hugh51    530220  0.5  0.4 477932 99736 ?        Ssl  19:42   0:03 /home/hugh51/musu-functions/musu-bridge/.venv/bin/python3 server.py
root         313  0.5  0.3 1322088 90980 ?       Ssl  12:11   2:35 /usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --port=41641
