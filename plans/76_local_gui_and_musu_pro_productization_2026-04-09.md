# Master Plan — Local GUI → MUSU Pro (musu.pro) + WebRTC Screens (2026-04-09)

요청: “기본은 localhost 웹 GUI(Paperclip처럼), 유료는 musu.pro 워크스페이스로 올려서 어디서든 접속 + 각 기기 화면(WebRTC)”.

## 0) Current Code State (what we already have)

### Local execution + multi-node
- `musu-worker` (FastAPI, `:9700`): 노드에서 실행 서버 역할.
  - `GET /health`, `GET /capabilities`, `POST /execute/process` 등.
  - `MUSU_WORKER_TOKEN` bearer auth 존재(토큰 파일 패턴도 이미 운영).
- `musu-core`: 로컬 오케스트레이터(SQLite 기반). `remote_process` / `remote_cli` 어댑터로 노드 작업 디스패치 가능.
- `scripts/musu_mesh_healthcheck.py`, `scripts/musu_remote_process.py`: 현재 멀티노드 proof 루프는 닫힘.

### Web surface
- `musu-bee` (Next.js, `:3001`): 이미 웹앱 형태(landing/pro/pricing/auth/api 등) 존재.
  - 하지만 “Paperclip 같은 운영 GUI(agents/issues/runs/nodes)”는 아직 제품 기능으로 고정돼 있지 않음.
- `musu-control`: MCP/툴링 서버(운영 제어/조회 도구). UI 백엔드로 재사용 가능한 후보.

## 1) Product Split (Free vs Pro)

### Free (Local)
목표: `localhost`에서만 접근하는 “MUSU Control Plane UI”.
- 접근: `127.0.0.1` 기본, 필요 시 Tailscale/LAN 제한적 허용.
- 계정/결제 없음(또는 로컬-only 키).
- 기능: 노드 상태/헬스, remote_process 실행, 로그/아티팩트 링크, 기본 “업무 보드”.

### Pro (musu.pro)
목표: 클라우드 워크스페이스에 올리고 어디서든 접속.
- 클라우드: 계정/워크스페이스/권한/감사로그/과금.
- 각 PC: Device Agent 설치(아웃바운드로만 클라우드에 연결).
- 화면: WebRTC로 각 노드 화면 스트림 제공(+ 원격 입력은 후순위).

## 2) Architecture (recommended)

### A) Control Plane (cloud)
- `musu.pro` web app: workspace, devices, agents, tasks, runs
- Auth: OAuth + workspace ACL
- Device registry: device_id, public key, last_seen, capabilities snapshot
- Audit log: “누가/언제/무슨 명령/어느 디바이스” 필수

### B) Device Agent (on each machine)
- outbound tunnel: WebSocket/gRPC over TLS (reverse tunnel)
- exposes:
  - safe remote_process (allowlist + rate limit)
  - logs/artifacts upload (signed URLs)
  - WebRTC screen publisher (SFU/TURN 연동)

### C) Local mode
- cloud 없이도 동일 UX 제공:
  - `musu-bee` UI를 로컬 백엔드(`musu-core` or `musu-control`)에 붙여서 localhost에서 동작
  - “Pro에서만 필요한 것”(계정/결제/TURN/SFU)은 feature-flag

## 3) WebRTC Screen Plan (MVP)

현실 체크:
- NAT 환경 “어디서든”은 TURN 없으면 실패하는 경우가 흔함 → Pro는 TURN 운영이 사실상 필수.

MVP 단계:
1) **View-only** 화면 스트림(원격 입력 X)
2) P2P(WebRTC) 우선 + TURN fallback
3) 동시 시청/다수 디바이스를 고려하면 SFU(예: livekit/mediasoup)로 확장

## 4) Security / Governance (non-negotiable)

- Device agent는 inbound 포트를 열지 않는다(아웃바운드 연결만).
- 명령 실행은:
  - 토큰/키 인증 + rate limit
  - allowlist (처음엔 “빌드/테스트/헬스체크”만)
  - secrets redaction + artifact-based logging
- Pro는 감사로그/권한(Operator vs Viewer) 분리가 필수.

## 5) Execution Plan (Waves)

### Wave 1 — Local GUI MVP (2–3일)
- `musu-bee`에 “Nodes” 페이지:
  - nodes.toml 기반 노드 리스트
  - `/health`/`/capabilities` 표시
  - remote_process “echo hello / health check” 버튼(서버 라우트로 프록시)
- 백엔드:
  - `musu-control` 또는 경량 API를 추가해 `musu-worker` 호출을 안전하게 프록시

Exit:
- 브라우저에서 2노드 상태 + 원격 커맨드 실행 결과를 1 화면에서 확인

### Wave 2 — Local multi-user / Auth hardening (2–4일)
- 로컬에서도 최소 auth (PIN / local-only JWT) 옵션
- 토큰/로그/아티팩트 기본값 강화

### Wave 3 — Pro control plane skeleton (1–2주)
- workspace + device registration + tunnel
- remote_process 제한 실행

### Wave 4 — WebRTC screens (1–2주)
- view-only screen streaming + TURN
- device-permissions + audit

## 6) CEO Decisions (pick 1–2)

1) Local GUI는 `musu-bee`를 “Control UI”로 확장할지(추천) vs 별도 새 UI.
2) Pro의 화면(WebRTC)은 MVP에 포함할지(추천: Wave4) vs 나중.

