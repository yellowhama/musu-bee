# Plan 93 — musu-relay Railway 배포 (Wave 5 / Track A)

**목표:** musu-relay를 Railway에 배포, 공개 WS 터널 URL 확보

## 환경변수 (미리 생성됨)
```
MUSU_RELAY_SECRET=a12cee60238dfbd8b859d62d71ab99c6b91c4fc8c3d4054a51921d7e03bc11d1
MUSU_RELAY_PORT=9900
```
이 SECRET은 Railway(relay) + Vercel(musu.pro) 양쪽에 동일하게 사용

## 실행 순서

### A-3. Railway 로그인 (사용자 직접 실행)
```bash
! railway login
# 브라우저가 열리면 musu.pro 계정으로 승인
```

### A-4. 프로젝트 생성 + 링크
```bash
cd /home/hugh51/musu-functions/musu-relay
railway init
# 프로젝트 이름: musu-relay
```

### A-5. 환경변수 설정
```bash
railway variables set MUSU_RELAY_SECRET=a12cee60238dfbd8b859d62d71ab99c6b91c4fc8c3d4054a51921d7e03bc11d1
railway variables set MUSU_RELAY_PORT=9900
```

### A-6. 배포
```bash
railway up --detach
# Dockerfile 빌드 + 배포 (--detach: 백그라운드)
```

### A-7. URL 확인 + 헬스체크
```bash
railway domain
# 또는: railway status
curl https://<railway-url>/health
# → {"status":"ok","tunnels":[]}
```

## 배포 후 필요한 값
- `MUSU_RELAY_URL_HTTP` = `https://<railway-url>` → Vercel용
- `MUSU_RELAY_URL_WS`  = `wss://<railway-url>/tunnel` → musu-bridge용

## 다음 단계
- Track B: musu-bridge/.env에 MUSU_RELAY_ENABLED + MUSU_RELAY_URL(wss) 추가
- Track C: Vercel에 MUSU_RELAY_URL(https) + MUSU_RELAY_SECRET 추가
