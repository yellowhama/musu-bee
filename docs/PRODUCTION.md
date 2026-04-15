# MUSU Production Deployment Guide

## 필수 환경변수 체크리스트

### musu-bridge (필수)
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MUSU_BRIDGE_TOKEN` | API 인증 토큰 **(필수)** | — (미설정 시 서버 시작 불가) |
| `MUSU_BRIDGE_ALLOWED_ORIGINS` | CORS/CSRF 허용 Origins | `https://musu.pro,http://localhost:3001` |
| `MUSU_DB_PATH` | SQLite DB 경로 | `~/.musu/musu.db` |
| `MUSU_MAX_CONCURRENT_TASKS` | 최대 동시 태스크 | `20` |
| `BRIDGE_PORT` | 포트 | `8070` |

### musu-port (선택)
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MUSU_PORT_TOKEN` | WS 인증 토큰 | — (미설정 시 인증 없음) |
| `MUSU_PORT_BRIDGE_URL` | Bridge URL | `http://localhost:8070` |

### musu-worker (필수)
| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MUSU_WORKER_TOKEN` | Worker 인증 토큰 | — |
| `MUSU_WORKER_HOST` | 바인딩 주소 | `127.0.0.1` |

## systemd 서비스 설치

### musu-bridge
```bash
bash scripts/install-musu-bridge-service.sh
# ~/.musu/bridge.env 에서 MUSU_BRIDGE_TOKEN 설정
systemctl --user start musu-bridge
```

### musu-port
```bash
# musu-port 빌드
cd musu-port && cargo build --release

# 서비스 설치
ln -sf "$PWD/scripts/systemd/musu-port.service" ~/.config/systemd/user/musu-port.service
systemctl --user daemon-reload
systemctl --user enable --now musu-port
```

### musu-worker
```bash
bash scripts/install-musu-worker-user-service.sh
```

## Nginx 리버스 프록시 설정

```nginx
# /etc/nginx/sites-available/musu.conf

server {
    listen 443 ssl http2;
    server_name musu.pro;

    # musu-bridge API
    location /api/ {
        proxy_pass http://127.0.0.1:8070;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 지원
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    # musu-port WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:1355;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    # musu-bee Next.js (선택: 직접 서빙 또는 Vercel 배포)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }
}
```

## 토큰 생성

```bash
# Bridge 토큰
openssl rand -hex 32

# Port 토큰
openssl rand -hex 32
```

## 헬스체크

```bash
# Bridge
curl http://localhost:8070/health

# SSE 연결 테스트
curl -N -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/tasks/events

# musu-port WS (wscat 필요)
wscat -c "ws://localhost:1355/ws/chat/test" \
  -H "Authorization: Bearer $MUSU_PORT_TOKEN"
```

## 서비스 상태 확인

```bash
systemctl --user status musu-bridge
systemctl --user status musu-port
systemctl --user status musu-worker

journalctl --user -u musu-bridge -f
```
