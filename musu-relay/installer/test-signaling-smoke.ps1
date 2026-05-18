# musu-relay/installer/test-signaling-smoke.ps1
# V23.4 T2-F (wiki/433): 2-PC LAN handshake validator.
# Per OQ-CRIT-3 (resolves Critic C-T2F-H4).
#
# Prereq: 2 PCs already paired via musu installer.
#   - PC-A:  installed with -MakeMeRendezvous
#   - PC-B:  installed with -RendezvousUrl http://<PC-A>:9900
#
# Why tcpdump and NOT dnsmasq: dnsmasq logs only the DNS resolutions that
# go through dnsmasq itself. WSL2 distros may bypass dnsmasq for /etc/hosts
# entries, systemd-resolved stub paths, or Windows host DNS (mirrored mode).
# tcpdump on -i any observes the actual L3/L4 traffic and is the authoritative
# instrument. Root is required inside the musu WSL distro (already root for
# service management; acceptable).

Param(
    [Parameter(Mandatory = $true)][string]$PeerAddr,   # PC-A IP:9900 from PC-B's perspective
    [int]$CaptureSeconds = 30
)

Import-Module "$PSScriptRoot/Musu-Common.psm1" -Force -DisableNameChecking

function Step($n, $msg) { Write-MusuInfo "[Step $n] $msg" }

# (a) Both PCs paired? (operator-asserted; we just print the assumption)
Step 1 "Assuming PC-A + PC-B already paired via installer."

# (b) On PC-A: musu-signaling service running
Step 2 "Verifying musu-signaling service is running on PC-A (must be run on PC-A)."
$status = wsl.exe -d musu -- rc-service musu-signaling status 2>&1
if ($status -notmatch "started") {
    Write-MusuErr "musu-signaling not started on this PC. Run: wsl -d musu -- rc-service musu-signaling start"
    exit 1
}
Write-MusuOk "musu-signaling status: started"

# (c) On PC-B: export MUSU_SIGNALING_URL and restart musu-gateway (operator step)
Step 3 "On PC-B run BEFORE this script: setx MUSU_SIGNALING_URL http://$PeerAddr (then restart musu-gateway)."

# (d) tcpdump for $CaptureSeconds — must show ZERO traffic to signaling.musu.pro
Step 4 "Running tcpdump for $CaptureSeconds seconds — capturing any traffic to signaling.musu.pro."
$out = wsl.exe -d musu -u root -- timeout $CaptureSeconds tcpdump -i any -nn host signaling.musu.pro 2>&1
$hits = ($out | Select-String -Pattern "signaling\.musu\.pro" -AllMatches).Matches.Count

# (e) PASS/FAIL summary
Step 5 "Result"
if ($hits -eq 0) {
    Write-MusuOk "PASS: zero packets to signaling.musu.pro during $CaptureSeconds s capture."
    exit 0
} else {
    Write-MusuErr "FAIL: $hits packets to signaling.musu.pro observed. Self-host not effective."
    Write-Host $out
    exit 1
}
