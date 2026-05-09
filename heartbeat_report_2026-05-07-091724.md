System Status Report for 2026-05-07 09:17:24

## System Information
Linux hughsecond 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux

## Disk Usage
Filesystem                                Size  Used Avail Use% Mounted on
none                                       12G     0   12G   0% /usr/lib/modules/6.6.87.2-microsoft-standard-WSL2
none                                       12G  4.0K   12G   1% /mnt/wsl
none                                       12G  2.9M   12G   1% /mnt/wsl/docker-desktop/shared-sockets/host-services
/dev/sde                                  129M   66M   54M  55% /mnt/wsl/docker-desktop/docker-desktop-user-distro
/dev/loop0                                716M  716M     0 100% /mnt/wsl/docker-desktop/cli-tools
drivers                                   931G  854G   77G  92% /usr/lib/wsl/drivers
/dev/sdd                                 1007G  305G  651G  32% /
none                                       12G  408K   12G   1% /mnt/wslg
none                                       12G     0   12G   0% /usr/lib/wsl/lib
rootfs                                     12G  2.7M   12G   1% /init
none                                       12G 1004K   12G   1% /run
none                                       12G     0   12G   0% /run/lock
none                                       12G  1.2M   12G   1% /run/shm
none                                       12G   76K   12G   1% /mnt/wslg/versions.txt
none                                       12G   76K   12G   1% /mnt/wslg/doc
C:\                                       931G  854G   77G  92% /mnt/c
D:\                                       3.7T  3.7T  2.5G 100% /mnt/d
E:\                                       3.7T  3.7T  6.9G 100% /mnt/e
F:\                                       7.3T  637G  6.7T   9% /mnt/f
G:\                                       7.3T  7.2T   91G  99% /mnt/g
I:\                                       1.9T  4.0M  1.9T   1% /mnt/i
snapfuse                                   67M   67M     0 100% /snap/core24/1587
snapfuse                                   67M   67M     0 100% /snap/core24/1499
snapfuse                                   50M   50M     0 100% /snap/snapd/26865
snapfuse                                   49M   49M     0 100% /snap/snapd/26382
tmpfs                                     2.4G   36K  2.4G   1% /run/user/1000
tmpfs                                     2.4G   24K  2.4G   1% /run/user/0
C:\Program Files\Docker\Docker\resources  931G  854G   77G  92% /Docker/host

## Running Processes (Top 10 by CPU)
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
hugh51       599 55.2  0.6 1541732 155176 ?      Sl    5월05 1577:08 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51   1958372 16.9  2.4 76841188 609896 pts/6 Sl+   5월06 243:53 claude
hugh51   3479260 15.6  2.0 76681552 516668 pts/4 Sl+   5월06 111:10 claude --resume bf9a02b6-72fc-4185-8184-f86a0ea27e89
hugh51    971359  7.9  1.2 27419216 298520 ?     Sl   09:15   0:09 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e
hugh51   1895045  2.6  0.7 554568 183028 pts/5   Sl+   5월06  38:44 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex
hugh51    971247  2.5  0.8 10502200 202324 ?     Sl   09:15   0:03 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e
hugh51   1958460  2.0  0.6 325060 156808 pts/6   Sl+   5월06  29:46 /home/hugh51/musu-functions/musu-indexer/.venv/bin/python3 /home/hugh51/musu-functions/musu-indexer/.venv/bin/musu-indexer mcp
hugh51    969001  1.1  0.3 466956 87884 ?        Ssl  09:13   0:02 /home/hugh51/musu-functions/musu-bridge/.venv/bin/python3 -m uvicorn server:app --host 0.0.0.0 --port 8070
hugh51   1895384  0.9  0.0   5776  3456 pts/5    S     5월06  14:50 /bin/bash /home/hugh51/.local/share/codex-mcp/rootless-computer-control/scrot-helper.sh
root         313  0.8  0.3 1322216 87312 ?       Ssl   5월05  23:58 /usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --port=41641
