# Gemini CLI Device Status Report - 2026-05-05-230535

## System Uptime, Memory, and Disk Usage
```
  23:05:35 up 11:14,  2 users,  load average: 5.41, 4.81, 4.20
               total        used        free      shared  buff/cache   available
Mem:            23Gi       6.0Gi       1.1Gi        22Mi        16Gi        17Gi
Swap:          8.0Gi       4.5Mi       8.0Gi
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

## Top 5 CPU Consuming Processes
```
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
hugh51    894489  100  0.0   9452  4352 pts/6    R+   23:05   0:00 ps aux --sort=-%cpu
hugh51       599 39.3  0.9 1474632 222124 ?      Sl   11:51 264:59 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini
hugh51    892789 22.7  1.0 27397812 257324 ?     Sl   23:05   0:06 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51    892631  9.5  1.1 10633572 271952 ?     Sl   23:05   0:03 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo
hugh51      6789  2.2  2.2 75480912 544520 pts/4 Sl+  11:56  15:01 claude
```

## Network Connectivity (Google.com)
```
HTTP/1.1 301 Moved Permanently
```