# Plan 90 — musu-bridge Relay Client (Wave 2)

**목표:** musu-bridge가 musu-relay WS 터널에 연결, 포워딩된 HTTP 요청 처리

## 변경 파일
- `musu-bridge/relay_client.py` (신규)
- `musu-bridge/config.py` (MUSU_RELAY_URL, MUSU_RELAY_ENABLED 추가)
- `musu-bridge/server.py` (lifespan에 relay_loop 태스크 추가)

## relay_client.py 핵심 로직
1. `wss://{MUSU_RELAY_URL}/tunnel` WS 연결 (Bearer MUSU_TOKEN)
2. hello handshake: `{"type":"hello","node_id":node_name}`
3. hello_ack 수신 → 연결 확립
4. 요청 프레임 수신 → `http://localhost:8070{path}` 포워딩
5. 응답 프레임 전송 (base64 body)
6. 연결 끊기면 5초 후 재연결 (무한 루프)

## 환경변수
- `MUSU_RELAY_URL=wss://your-relay.railway.app` (ws:// for local dev)
- `MUSU_RELAY_ENABLED=false` (기본 off)

## 검증
```bash
MUSU_RELAY_ENABLED=true MUSU_RELAY_URL=ws://localhost:9900 \
  MUSU_TOKEN=test MUSU_NODE_NAME=test-node python server.py
# relay 로그: "tunnel connected: test-node"
# curl http://localhost:9900/proxy/test-node/health -H "Authorization: Bearer $SECRET"
```
