# Main-PC 설정 가이드 (MUSU Mesh Phase 2)
> 작성: 2026-04-16 | second-pc에서 QUIC 연결을 완성하기 위해 main-pc에서 실행할 것

---

## 전제 조건

- `/home/hugh51/musu-functions` 최신 코드 pull 완료
- Rust toolchain 설치됨
- `~/.musu/bridge_token` 파일 존재

---

## Step 1: 코드 pull

```bash
cd /home/hugh51/musu-functions
git pull origin main
```

---

## Step 2: musu-connectsd 빌드

```bash
cd /home/hugh51/musu-functions/musu-connects

# WSL2 GCC 경로 설정 (필요 시)
source ../musu-port/scripts/linux-rust-env.sh

cargo build --release -p musu-connectsd
```

빌드 성공 확인:
```bash
./target/release/musu-connectsd --help
# 출력에 "bridge-proxy" 명령어 있어야 함
```

---

## Step 3: musu-connectsd bridge-proxy 시작

```bash
mkdir -p /home/hugh51/musu-functions/logs

nohup /home/hugh51/musu-functions/musu-connects/target/release/musu-connectsd \
  bridge-proxy \
  --quic-port 4433 \
  --http-port 9443 \
  --bridge-url http://127.0.0.1:8070 \
  > /home/hugh51/musu-functions/logs/musu-connectsd.log 2>&1 &

echo "PID=$!"
sleep 2

# 상태 확인
curl -sf http://127.0.0.1:9443/health && echo " ← QUIC proxy OK"
```

정상 로그:
```
[bridge-proxy] QUIC server listening on UDP 0.0.0.0:4433
[bridge-proxy] HTTP proxy listening on http://127.0.0.1:9443
[bridge-proxy] bridge-url = http://127.0.0.1:8070
```

---

## Step 4: musu-bridge 재시작 (QUIC proxy URL 포함)

```bash
# 기존 bridge 종료
pkill -f "python.*server.py" 2>/dev/null; sleep 1

# 재시작
cd /home/hugh51/musu-functions
MUSU_BRIDGE_TOKEN=$(cat ~/.musu/bridge_token) \
MUSU_NODE_NAME=hugh-main-1 \
MUSU_QUIC_PROXY_URL=http://127.0.0.1:9443 \
MUSU_BRIDGE_PUBLIC_URL=http://$(cat /home/hugh51/musu-functions/musu-bridge/.env 2>/dev/null | grep BRIDGE_HOST | cut -d= -f2 || echo "100.121.211.106"):8070 \
PYTHONPATH=/home/hugh51/musu-functions/musu-core/src:/home/hugh51/musu-functions/musu-bridge \
  nohup python3 musu-bridge/server.py \
  >> /home/hugh51/musu-functions/logs/musu-bridge.log 2>&1 &

sleep 3
curl -sf http://127.0.0.1:8070/health && echo " ← bridge OK"
```

---

## Step 5: second-pc에서 검증 (second-pc 터미널에서)

second-pc에서 아래 실행:

```bash
# QUIC 직접 연결 테스트
curl -s --max-time 10 \
  -X POST http://127.0.0.1:9443/forward \
  -H "Content-Type: application/json" \
  -d '{"peer_url":"http://100.121.211.106:8070","channel":"engineer","sender_id":"test","text":"QUIC hello from second-pc"}'
```

응답 예시 (성공):
```json
{"response": "...", "agent_id": "engineer", "status": "ok"}
```

---

## Step 6: musu.pro 연결 (선택 — Phase 1 peer discovery)

MUSU_TOKEN을 갖고 있다면 bridge 재시작 시 추가:

```bash
MUSU_TOKEN=<your-token> \
MUSU_NODE_NAME=hugh-main-1 \
... (위와 동일)
```

musu.pro에서 노드 확인:
```bash
curl -H "Authorization: Bearer <token>" https://musu.pro/api/v1/nodes
```

---

## 방화벽 포트 오픈 (iptables)

UDP 4433이 차단되어 있으면:

```bash
sudo iptables -I INPUT -p udp --dport 4433 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 8070 -j ACCEPT

# 영구 적용 (Ubuntu/Debian)
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

---

## 문제 해결

### QUIC 연결 타임아웃
```bash
# main-pc에서 UDP 4433 수신 확인
ss -ulnp | grep 4433

# 외부에서 UDP 접근 가능 여부 (second-pc에서)
nc -zuv 100.121.211.106 4433 2>&1
```

### bridge-proxy 로그
```bash
tail -f /home/hugh51/musu-functions/logs/musu-connectsd.log
```

### musu-bridge 로그
```bash
tail -f /home/hugh51/musu-functions/logs/musu-bridge.log
```
