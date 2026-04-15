# Incident Report: Multi-Machine Networking Issue
> 작성: 2026-04-16 | 상태: 미해결 (리서치 중)

## 증상

second-pc (100.126.67.88) → main-pc (100.121.211.106) Tailscale 연결에서:

```
ping 100.121.211.106   → OK (0% loss, 80ms RTT)
curl http://100.121.211.106:8070/health  → exit code 7 (Connection refused)
curl http://100.121.211.106:1355/health  → exit code 7 (Connection refused)
```

## 환경

| 항목 | second-pc | main-pc |
|------|-----------|---------|
| OS | WSL2 (Linux 6.6.87.2-microsoft-standard-WSL2) | WSL2 (동일) |
| Tailscale | 100.126.67.88 (linux, inactive) | 100.121.211.106 (linux, active, relay "tok") |
| 브리지 바인딩 | - | 0.0.0.0:8070 (BRIDGE_HOST 기본값) |
| musu-port | - | 빌드 중 → :1355 예정 |

### Tailscale status (second-pc에서)
```
100.126.67.88    hughsecond   linux    -
100.121.211.106  hugh-main-1  linux    active; relay "tok", tx 474676 rx 367736
100.72.246.84    hugh-main    windows  -
100.79.44.109    hugh-second  windows  -
```
- `hugh-main-1` = main-pc WSL2 인스턴스
- relay "tok" = 도쿄 DERP 릴레이 경유 (P2P 직연결 아님)

## 진단한 것

1. **ping 성공 / curl 실패** → 네트워크 연결은 있으나 포트가 안 열림
2. **브리지 0.0.0.0 바인딩 확인됨** → main-pc 에이전트 self-check 성공
3. **WSL2 + Tailscale 알려진 이슈** → Tailscale이 WSL2 내부에 설치돼 있어도
   외부에서 WSL2 서비스 포트로 들어오는 TCP 트래픽이 iptables에서 차단될 수 있음

## 시도한 것

- `iptables -I INPUT -p tcp --dport 8070 -j ACCEPT` 가이드 제공 (미실행)
- `scripts/setup-main-pc-remote.sh` 작성 (iptables + ufw 자동화)

## 가설

### 가설 A: iptables DROP 규칙
WSL2는 부팅 시 iptables FORWARD/INPUT에 DROP 규칙을 추가함.
Tailscale 패킷이 FORWARD 체인을 거칠 때 차단.

### 가설 B: Tailscale relay vs P2P
현재 relay "tok" 경유 → P2P 직연결이 아님.
DERP 릴레이 경유 시 UDP hole-punching 실패 케이스에서 TCP 포트 접근이 다르게 동작할 수 있음.

### 가설 C: Windows 방화벽
main-pc Tailscale이 WSL2 내부에 있더라도 Windows 방화벽이 포트를 막을 수 있음.
(WSL2 → Windows 호스트 → Tailscale 경로인 경우)

### 가설 D: Tailscale subnet routing 미설정
WSL2 내부 서비스를 Tailscale로 노출하려면 `--advertise-routes` 설정 필요할 수 있음.

## 리서치 필요 항목

1. WSL2에서 Tailscale으로 서비스 포트 노출하는 표준 방법
2. `relay "tok"` 상태에서 TCP 포트 접근 가능한지
3. WSL2 iptables vs Tailscale 인터페이스 순서 문제
4. `tailscale serve` / `tailscale funnel` 대안 고려
