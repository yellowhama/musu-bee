# Plan 89 — musu-relay Server (Wave 1)

**목표:** 로컬 musu-bridge ↔ musu.pro 사이의 WS 터널 브로커

## 파일 구조
```
musu-relay/
├── src/server.ts     — 메인 릴레이 서버
├── package.json
├── tsconfig.json
├── Dockerfile
└── railway.json
```

## 프로토콜

**터널 연결 (musu-bridge → relay):**
- `WS /tunnel`, Header: `Authorization: Bearer {MUSU_TOKEN}`
- 연결 후 첫 메시지: `{"type": "hello", "node_id": "hughsecond"}`
- relay 응답: `{"type": "hello_ack", "node_id": "hughsecond"}`

**요청 프레임 (relay → musu-bridge):**
```json
{"id": "uuid", "method": "GET", "path": "/api/agents", "headers": {}, "body": null}
```

**응답 프레임 (musu-bridge → relay):**
```json
{"id": "uuid", "status": 200, "headers": {"content-type": "application/json"}, "body": "base64..."}
```

**프록시 요청 (musu.pro → relay):**
- `{METHOD} /proxy/{nodeId}/{path}` (Bearer MUSU_RELAY_SECRET)
- relay가 해당 nodeId 터널로 프레임 전송, 응답 대기(30s), HTTP 반환

## 환경변수
- `MUSU_RELAY_PORT=9900`
- `MUSU_RELAY_SECRET` — musu.pro → relay 인증 시크릿

## 검증
```bash
cd musu-relay && npm run dev
# 다른 터미널: wscat -c ws://localhost:9900/tunnel -H "Authorization: Bearer test"
# send: {"type":"hello","node_id":"test-node"}
# expect: {"type":"hello_ack","node_id":"test-node"}
```
