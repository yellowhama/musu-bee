System Status Report for 2026-05-07 05:57:58

## System Information
Linux hughsecond 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux

## Disk Usage
Filesystem                                Size  Used Avail Use% Mounted on
none                                       12G     0   12G   0% /usr/lib/modules/6.6.87.2-microsoft-standard-WSL2
none                                       12G  4.0K   12G   1% /mnt/wsl
none                                       12G  2.9M   12G   1% /mnt/wsl/docker-desktop/shared-sockets/host-services
/dev/sde                                  129M   66M   54M  55% /mnt/wsl/docker-desktop/docker-desktop-user-distro
/dev/loop0                                716M  716M     0 100% /mnt/wsl/docker-desktop/cli-tools
drivers                                   931G  837G   94G  90% /usr/lib/wsl/drivers
/dev/sdd                                 1007G  305G  652G  32% /
none                                       12G  408K   12G   1% /mnt/wslg
none                                       12G     0   12G   0% /usr/lib/wsl/lib
rootfs                                     12G  2.7M   12G   1% /init
none                                       12G 1004K   12G   1% /run
none                                       12G     0   12G   0% /run/lock
none                                       12G  1.2M   12G   1% /run/shm
none                                       12G   76K   12G   1% /mnt/wslg/versions.txt
none                                       12G   76K   12G   1% /mnt/wslg/doc
C:\                                       931G  837G   94G  90% /mnt/c
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
C:\Program Files\Docker\Docker\resources  931G  837G   94G  90% /Docker/host

## Running Processes (Top 10 by CPU)
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
hugh51       599 55.9  0.6 1541732 155280 ?      Sl    5월05 1474:43 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51    696745 26.7  1.0 27405608 262864 ?     Sl   05:57   0:07 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e
hugh51   3479260 22.3  2.1 76681232 524984 pts/4 Sl+   5월06 110:12 claude --resume bf9a02b6-72fc-4185-8184-f86a0ea27e89
hugh51   1958372 19.7  2.5 76841188 628852 pts/6 Sl+   5월06 241:36 claude
hugh51    696182 10.6  1.1 10632360 272380 ?     Sl   05:57   0:03 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e
hugh51    697330  3.0  0.2 211188 54060 ?        Sl   05:57   0:00 /home/hugh51/musu-functions/musu-writer/.venv/bin/python3 /home/hugh51/musu-functions/musu-writer/.venv/bin/musu-writer mcp
hugh51    697329  2.9  0.2 220776 57928 ?        Sl   05:57   0:00 /home/hugh51/musu-functions/musu-control/.venv/bin/python3 /home/hugh51/musu-functions/musu-control/.venv/bin/musu-control
hugh51   1895045  2.9  0.7 557120 185424 pts/5   Sl+   5월06  37:06 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex
hugh51    697331  2.8  0.2 211820 53608 ?        Sl   05:57   0:00 /home/hugh51/musu-functions/musu-ai-detector/.venv/bin/python3 /home/hugh51/musu-functions/musu-ai-detector/.venv/bin/musu-ai-detector mcp
hugh51   1958460  2.4  0.6 325060 156808 pts/6   Sl+   5월06  29:46 /home/hugh51/musu-functions/musu-indexer/.venv/bin/python3 /home/hugh51/musu-functions/musu-indexer/.venv/bin/musu-indexer mcp
