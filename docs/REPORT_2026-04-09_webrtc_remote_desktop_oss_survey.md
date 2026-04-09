# WebRTC Remote Desktop OSS Survey (for MUSU) — 2026-04-09

목표: “Google Remote Desktop처럼 브라우저에서 각 기기 화면을 볼 수 있게(WebRTC)”를 MUSU의 `Local GUI → Pro(musu.pro)` 로드맵에 현실적으로 끼워 넣기 위한 **오픈소스 레퍼런스 조사 요약**.

> 로컬 레퍼런스 클론 위치(개발용): `/home/hugh51/references_AI/webrtc_remote_desktop_oss/`
> - 이 디렉토리는 ‘학습/조사’ 목적이며, MUSU 제품 레포에 vendoring 하지는 않는 것을 기본으로 권장.

---

## 1) 결론(사장/의사결정자용)

### 추천 접근
- **Linux 화면(WebRTC) View-only**는 “직접 처음부터 만들기”보다, **Selkies 계열 아키텍처(캡처 → HW 인코딩 → WebRTC 송출)**를 레퍼런스로 삼는 게 가장 빠름.
- “기기 fleet + 에이전트 설치 + 웹에서 원격 데스크탑”이라는 제품 단위는 **MeshCentral**이 레퍼런스로 가장 가까움(에이전트/권한/감사/릴레이/네트워크 우회 포함).
- WebRTC가 아니더라도 “브라우저에서 화면 보기”를 빨리 닫으려면 **noVNC**/**Guacamole** 같은 HTML5 원격 데스크탑이 즉시성과 안정성이 높음(대신 지연/품질/확장성에서 WebRTC 대비 한계).

### Pro(어디서든 접속)에서 피할 수 없는 현실
- NAT/방화벽 환경에서 “어디서든”을 보장하려면 **TURN 운영**이 사실상 필수.
- 다수 시청자/다수 디바이스/세션 녹화까지 가면 P2P만으로는 한계 → **SFU(예: LiveKit/mediasoup 계열) 고려**.

### CEO가 지금 고르면 좋은 결정 2개
1) **MVP 범위**: 화면은 **View-only**로 시작(원격 입력은 다음 웨이브).
2) **운영 방식**: Pro에서는 **TURN을 1차 필수 인프라**로 인정하고 설계(“없으면 되겠지”로 시작하면 일정이 무너짐).

---

## 2) OSS 레퍼런스 4종 비교(핵심만)

### A) Selkies (WebRTC Linux remote desktop streaming)
- Repo: `selkies-project/selkies-gstreamer`
- 포지션: “Linux X11, GPU/CPU 가속, 저지연 WebRTC 원격 데스크탑 스트리밍”.
- 강점
  - “캡처/인코딩/전송” 파이프라인이 매우 명확함.
  - 컨테이너/Kubernetes/HPC까지 고려되어 있어 “노드 운영”에 강함.
  - MUSU가 원하는 “각 기기 화면을 브라우저에서”의 기술 코어를 직접적으로 보여줌.
- 약점/리스크
  - 커뮤니티 유지보수 필요를 명시(유지보수력/버전 추종 리스크).
  - Windows/macOS는 별도 전략 필요.
- MUSU가 배울 포인트(바로 가져와야 하는 것)
  - **GStreamer 기반 캡처/인코딩 설계**
  - **NVIDIA HW encode(NVENC) 활용**
  - WebRTC signaling/ICE/TURN fallback 설계 방향

### B) MeshCentral (Fleet + agent + web remote desktop)
- Repo: `Ylianst/MeshCentral`
- 포지션: “서버(웹) + 에이전트 설치 + 웹에서 remote desktop/terminal/file”.
- 강점
  - 제품 구조(사용자/디바이스 그룹/권한/릴레이/감사)가 MUSU Pro에 매우 가까움.
  - 문서에서 **browser-to-agent relay + WebRTC**를 명시(아키텍처 가이드 존재).
  - “에이전트 → 서버” 패턴은 MUSU Pro(Device Agent outbound) 설계와 정합.
- 약점/리스크
  - 기능이 넓고 범용 제품이라 “필요한 것만” 추출하려면 분석 비용.
- MUSU가 배울 포인트
  - **Device enrollment + 그룹/권한 모델**
  - **중계(릴레이) 및 reverse proxy 설계**
  - 보안 기능(2FA/SSO/필터링/브랜딩) 중 “MVP에 필요한 최소 세트”

### C) Apache Guacamole (HTML5 remote desktop gateway)
- Repo: `apache/guacamole-server`, `apache/guacamole-client`
- 포지션: “guacd 프록시가 RDP/VNC/SSH 등을 Guacamole 프로토콜로 변환, 브라우저에서 HTML5로 접속”.
- 강점
  - 프로덕션에서 많이 검증된 “게이트웨이형” 아키텍처.
  - “브라우저에서 원격 데스크탑”을 빠르게 제공 가능.
- 약점/리스크
  - WebRTC가 핵심이 아니라, WebRTC low-latency/고품질 목표에는 한계.
  - 운영/배포(guacd, tomcat/war, 프로토콜 의존성)가 복잡해질 수 있음.
- MUSU가 배울 포인트
  - **프록시/게이트웨이 분리(guacd) 구조**
  - 다중 프로토콜 지원/세션 관리/권한 분리 패턴

### D) noVNC (browser VNC client)
- Repo: `novnc/noVNC`
- 포지션: “브라우저 VNC 클라이언트(라이브러리+앱)”.
- 강점
  - 구현 난이도 대비 빠르게 ‘화면 보기’를 제공.
  - 표준 VNC 서버와 조합 가능.
- 약점/리스크
  - WebRTC 대비 지연/대역폭 효율/네트워크 우회(ICE/TURN)에서 불리.
- MUSU가 배울 포인트
  - “브라우저 화면 보기 UX”의 최소 기능 집합(키/마우스/클립보드/리사이즈 등)

---

## 3) MUSU에 맞는 “현실적” 통합 청사진

### 공통 원칙
- Device Agent는 **인바운드 포트 오픈 금지**(기본은 outbound 연결).
- 명령 실행과 화면 스트리밍은 **분리된 권한/감사 범위**로 취급.
- Pro 환경에서는 “운영자(Operator)”와 “시청자(Viewer)”를 분리하고, 모든 시청을 감사 로그로 남김.

### Local(무료) MVP
- 목표: `localhost`에서 “노드 화면 보기(View-only)”를 실험적으로 제공.
- 추천: 처음엔 WebRTC 강제하지 말고(개발 비용), 아래 중 택1
  1) noVNC 기반 빠른 프로토타입(지연 OK)
  2) Selkies를 로컬 단일 노드로 띄워서 “WebRTC quality bar” 확인

### Pro(musu.pro) 방향
- 목표: 어디서든 접속 + 여러 기기 + 여러 시청자.
- 구성
  - Signaling: `musu.pro` (workspace auth 기반)
  - TURN: `coturn` (운영 필수)
  - 필요 시 SFU: 동시 시청/다중 세션 확장 시점에 도입

---

## 4) 기술 리스크(미리 인정해야 하는 것)

- **TURN 비용/운영**: 트래픽이 곧 돈(특히 화면 스트리밍).
- **보안**: 화면은 개인정보/비밀정보가 섞여 나오는 채널 → ACL/감사/녹화/마스킹 논의 필요.
- **플랫폼별 캡처**: Linux(X11/Wayland)/Windows/macOS가 구현 난이도가 크게 다름.
- **원격 입력**: View-only 대비 공격면이 급증(키로깅/권한 상승/업무 시스템 오조작).

---

## 5) 다음 액션(실행 가능한 체크리스트)

1) “View-only”를 Wave4로 두고, Wave1~3에서 디바이스 등록/권한/감사를 먼저 닫는다.
2) Linux 노드 기준으로 Selkies 방식의 파이프라인을 분석해, MUSU Device Agent에 필요한 컴포넌트 최소치를 정의한다.
3) Pro에서 TURN을 1차 인프라로 확정하고, **초기 비용 가드레일(해상도/프레임/비트레이트/동시 시청 제한)**을 제품 정책으로 둔다.

