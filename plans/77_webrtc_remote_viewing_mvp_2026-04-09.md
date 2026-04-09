# Plan — WebRTC Screen Viewing MVP (Local → Pro) (2026-04-09)

목표: MUSU가 “여러 PC(노드)를 연결”하는 컨셉에서 한 단계 더 나아가, **브라우저에서 각 기기 화면을 볼 수 있는 기능**을 현실적으로 제품화한다.

참조 조사: `docs/REPORT_2026-04-09_webrtc_remote_desktop_oss_survey.md`

---

## 0) Scope (MVP는 어디까지?)

### MVP (이번)
- **View-only** 화면 스트림
- 디바이스 권한(Workspace ACL) + 감사로그(누가 어떤 디바이스 화면을 봤는지)
- NAT 환경 대응: **TURN fallback**

### Not in MVP (다음)
- 원격 입력(키/마우스)
- 녹화/재생
- 다중 시청자 확장(SFU)

---

## 1) Architecture (recommended)

### Local (Free)
- `musu-bee` UI: 노드 리스트 + “View Screen” 버튼
- 노드(각 PC): `musu-worker`와 별도로 `musu-screen`(가칭) 프로세스가 화면 송출
  - 옵션 A: noVNC로 빠른 실험(지연/품질 타협)
  - 옵션 B: Selkies 방식(WebRTC+HW encode)로 품질 기준선 확인

### Pro (musu.pro)
- Control Plane: workspace auth + device registry + audit log
- Signaling: cloud가 제공(HTTPS + WS)
- TURN: `coturn` 운영(필수)
- Device Agent: outbound only(클라우드에 연결) + 세션 승인/취소

---

## 2) Implementation Steps (Wave-based)

### Wave 0 — Spike (1~2일)
- Linux(개발 노드)에서 WebRTC 기반 화면 송출의 “품질/지연/CPU/GPU” 기준치를 측정
- TURN 유무에 따른 연결 성공률 테스트(가능한 최소 셋업)

Exit:
- 로컬에서 브라우저로 화면이 뜨고, 간단한 메트릭(fps/bitrate/latency)이 기록됨

### Wave 1 — Local UI integration (2~3일)
- `musu-bee`에 Nodes 화면에 “Screen(View)” 진입점 추가
- 세션 수/해상도/프레임 제한(로컬 정책) 도입

Exit:
- “Local control UI에서 노드 화면을 볼 수 있다”

### Wave 2 — Pro skeleton (1주)
- device registry + 권한(Operator/Viewer) + audit log
- device agent outbound tunnel(기본) + screen session 승인 흐름

Exit:
- `musu.pro`에서 로그인 후 특정 디바이스의 화면을 “시청”할 수 있다(최소 1대)

### Wave 3 — Hardening + Cost guardrails (1주)
- TURN 운영 모니터링(트래픽/동접/에러)
- Rate limit, abuse 방지, 감사 로그 강화
- 품질 프리셋(저/중/고) 도입

Exit:
- 운영 가능한 수준의 비용/보안 가드레일이 존재

---

## 3) Security Baseline (non-negotiable)

- 화면 세션은 무조건 인증/권한 체크 후 발급(무작위 URL 금지)
- 모든 시청 이벤트는 감사 로그에 남김
- 로컬 모드도 기본은 `127.0.0.1` 바인딩 + 필요 시 Tailscale/LAN 제한

---

## 4) CEO Decisions (pick 1~2)

1) MVP를 View-only로 확정할지(추천: YES)
2) Pro에서 TURN 운영을 “필수”로 즉시 인정할지(추천: YES)

