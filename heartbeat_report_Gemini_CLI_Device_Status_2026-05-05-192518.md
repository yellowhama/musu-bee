System Status Report for 2026-05-05 19:25:18

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
hugh51       599 38.1  0.9 1474632 223148 ?      Sl   12:13 164:34 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51    502871 37.2  3.2 28081844 800852 ?     Sl   19:25   0:05 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51    503546 33.3  0.0   5776  3584 pts/6    Ss+  19:25   0:00 /usr/bin/bash -c shopt -u promptvars nullglob extglob nocaseglob dotglob; { echo "System Status Report for $(date '+%Y-%m-%d %H:%M:%S')  ## System Information $(uname -a)  ## Disk Usage $(df -h)  ## Running Processes (Top 10 by CPU) $(ps aux --sort=-%cpu | head -n 11)" > heartbeat_report_Gemini_CLI_Device_Status_$(date '+%Y-%m-%d-%H%M%S').md; }; __code=$?; pgrep -g 0 >/tmp/shell_pgrep_7ad66c54c43b.tmp 2>&1; exit $__code;
hugh51    502749 14.5  1.1 10632344 282888 ?     Sl   19:24   0:02 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51      6789  3.3  2.1 75480912 540828 pts/4 Sl+  12:18  14:22 claude
hugh51    500160  1.5  0.3 470656 92308 ?        Ssl  19:23   0:01 /home/hugh51/musu-functions/musu-bridge/.venv/bin/python3 server.py
hugh51    161016  0.9  0.0   5776  3200 pts/5    S    15:14   2:20 /bin/bash /home/hugh51/.local/share/codex-mcp/rootless-computer-control/scrot-helper.sh
hugh51    160771  0.7  0.4 412928 118288 pts/5   Sl+  15:14   1:56 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex
root         313  0.5  0.3 1322088 91236 ?       Ssl  12:13   2:23 /usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --port=41641
hugh51       565  0.2  0.1 1262144 36948 ?       Ssl  12:13   1:16 /usr/local/bin/cloudflared tunnel run musu-bee
