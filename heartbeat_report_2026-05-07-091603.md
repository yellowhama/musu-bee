System Status Report for 2026-05-07 09:16:03

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
hugh51       599 55.3  0.6 1541732 155176 ?      Sl    5월05 1576:44 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51    971359 26.2  1.0 27408516 268916 ?     Sl   09:15   0:07 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e
hugh51   1958372 16.9  2.4 76841188 610240 pts/6 Sl+   5월06 243:52 claude
hugh51   3479260 15.6  2.0 76681552 516552 pts/4 Sl+   5월06 111:10 claude --resume bf9a02b6-72fc-4185-8184-f86a0ea27e89
hugh51    971247  9.2  1.1 10633528 273112 ?     Sl   09:15   0:02 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e
hugh51    971543  3.0  0.2 211180 54528 ?        Sl   09:15   0:00 /home/hugh51/musu-functions/musu-writer/.venv/bin/python3 /home/hugh51/musu-functions/musu-writer/.venv/bin/musu-writer mcp
hugh51    971542  3.0  0.2 220784 58044 ?        Sl   09:15   0:00 /home/hugh51/musu-functions/musu-control/.venv/bin/python3 /home/hugh51/musu-functions/musu-control/.venv/bin/musu-control
hugh51    971544  2.8  0.2 211824 53692 ?        Sl   09:15   0:00 /home/hugh51/musu-functions/musu-ai-detector/.venv/bin/python3 /home/hugh51/musu-functions/musu-ai-detector/.venv/bin/musu-ai-detector mcp
hugh51   1895045  2.6  0.7 554572 183028 pts/5   Sl+   5월06  38:43 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex
hugh51   1958460  2.0  0.6 325060 156808 pts/6   Sl+   5월06  29:46 /home/hugh51/musu-functions/musu-indexer/.venv/bin/python3 /home/hugh51/musu-functions/musu-indexer/.venv/bin/musu-indexer mcp
