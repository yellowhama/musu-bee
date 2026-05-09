--- System Status Report ---

### Uptime ###

 21:15:30 up  9:13,  2 users,  load average: 2.87, 3.48, 3.47

### Memory Usage ###

               total        used        free      shared  buff/cache   available
Mem:            23Gi       5.9Gi       1.4Gi        22Mi        16Gi        17Gi
Swap:          8.0Gi       4.5Mi       8.0Gi

### Disk Usage ###

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

### CPU Usage (snapshot) ###

%Cpu(s): 14.1 us,  8.2 sy,  0.0 ni, 75.3 id,  0.0 wa,  0.0 hi,  2.4 si,  0.0 st 

### Running Processes (count) ###

92

### Network Interfaces ###

1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet 10.255.255.254/32 brd 10.255.255.254 scope global lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host 
       valid_lft forever preferred_lft forever
2: eth0: <BROADCAST,MULTICAST> mtu 1500 qdisc mq state DOWN group default qlen 1000
    link/ether 00:f2:02:00:1c:7d brd ff:ff:ff:ff:ff:ff
3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether bc:fc:e7:cb:20:c5 brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.154/24 brd 192.168.1.255 scope global noprefixroute eth1
       valid_lft forever preferred_lft forever
    inet6 fe80::be85:7ac:7a00:632c/64 scope link nodad noprefixroute 
       valid_lft forever preferred_lft forever
4: loopback0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:15:5d:8d:5d:38 brd ff:ff:ff:ff:ff:ff
5: eth2: <BROADCAST,MULTICAST> mtu 1500 qdisc mq state DOWN group default qlen 1000
    link/ether 00:15:5d:74:9a:fe brd ff:ff:ff:ff:ff:ff
6: eth3: <BROADCAST,MULTICAST> mtu 1500 qdisc mq state DOWN group default qlen 1000
    link/ether 00:15:5d:6a:47:fe brd ff:ff:ff:ff:ff:ff
7: eth4: <BROADCAST,MULTICAST> mtu 1500 qdisc mq state DOWN group default qlen 1000
    link/ether 00:15:5d:5a:64:4a brd ff:ff:ff:ff:ff:ff
8: eth5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1280 qdisc mq state UP group default qlen 1000
    link/ether 00:15:5d:92:b1:2a brd ff:ff:ff:ff:ff:ff
    inet 169.254.83.107/16 brd 169.254.255.255 scope link noprefixroute eth5
       valid_lft forever preferred_lft forever
    inet6 fe80::7071:d719:cdf0:47f2/64 scope link nodad noprefixroute 
       valid_lft forever preferred_lft forever
9: eth6: <BROADCAST,MULTICAST> mtu 1500 qdisc mq state DOWN group default qlen 1000
    link/ether 00:15:5d:0a:04:2b brd ff:ff:ff:ff:ff:ff
10: eth7: <BROADCAST,MULTICAST> mtu 1500 qdisc mq state DOWN group default qlen 1000
    link/ether 00:15:5d:6e:f1:56 brd ff:ff:ff:ff:ff:ff
11: tailscale0: <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP> mtu 1280 qdisc fq_codel state UNKNOWN group default qlen 500
    link/none 
    inet 100.126.67.88/32 scope global tailscale0
       valid_lft forever preferred_lft forever
    inet6 fd7a:115c:a1e0::8e01:439d/128 scope global 
       valid_lft forever preferred_lft forever
12: eth8: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1420 qdisc mq state UP group default qlen 1000
    link/ether 00:15:5d:4e:ee:32 brd ff:ff:ff:ff:ff:ff
    inet 10.5.0.2/16 brd 10.5.255.255 scope global noprefixroute eth8
       valid_lft forever preferred_lft forever
    inet6 fe80::7071:d719:cdf0:47f2/64 scope link nodad noprefixroute 
       valid_lft forever preferred_lft forever
13: br-9a7f0505ef2b: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default 
    link/ether 1a:10:a4:cc:ff:31 brd ff:ff:ff:ff:ff:ff
    inet 172.18.0.1/16 brd 172.18.255.255 scope global br-9a7f0505ef2b
       valid_lft forever preferred_lft forever
14: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default 
    link/ether 7e:21:d1:74:5c:10 brd ff:ff:ff:ff:ff:ff
    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
       valid_lft forever preferred_lft forever