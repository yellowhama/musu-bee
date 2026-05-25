**Wiki ID**: wiki/517

# Brainstorm: Multi-Machine Binding Architecture
**Date**: 2026-05-24

여러 대의 컴퓨터를 묶어서 마치 **'하나의 거대한 기계(단일 시스템 이미지, Single System Image)'**처럼 작동하게 만드는 것은 분산 컴퓨팅의 궁극적인 목표 중 하나입니다. 백지상태에서 "멀티머신 바인딩"을 구현하기 위한 아키텍처 관점의 접근입니다.

## 5 Layers of Architecture

### 1. Discovery (발견): 서로를 어떻게 찾을 것인가?
기기들이 서로의 존재를 알아채야 바인딩이 시작됩니다.

*   **로컬 네트워크(LAN) 환경:**
    *   **mDNS / Bonjour / ZeroConf:** 같은 와이파이나 공유기에 물려 있다면 브로드캐스트를 통해 "나 여기 있어(IP/Port)"라고 외치고 서로를 자동으로 찾는 방식이 가장 우아합니다. (애플의 AirDrop이나 스마트 TV 연결 방식)
*   **글로벌 네트워크(WAN) 환경:** (집에 있는 데스크톱과 카페에 있는 노트북을 묶을 때)
    *   **릴레이/랑데부 서버:** 가벼운 중앙 서버를 두어 서로의 공인 IP를 매칭해주는 방식.
    *   **DHT (분산 해시 테이블):** 토렌트처럼 중앙 서버 없이 P2P로 노드들을 찾아가는 방식.

### 2. Transport & Security (연결과 보안): 안전하게 터널 뚫기
기기들이 서로를 찾았다면, 물리적인 위치에 상관없이 언제든 통신할 수 있는 '가상의 전용선'을 깔아야 합니다.

*   **가상 사설망 (VPN/Overlay Network):** `WireGuard`나 `Tailscale` 같은 기술을 내장하여, 기기들이 전 세계 어디에 있든 같은 로컬 네트워크(예: `10.x.x.x` 대역)에 있는 것처럼 묶어버립니다. 이것이 바인딩의 물리적 기반이 됩니다.
*   **NAT Traversal (홀펀칭):** 공유기(방화벽) 뒤에 숨은 기기들끼리 직접 통신(P2P)하기 위해 `STUN/TURN` 서버나 `WebRTC` 기술을 사용하여 지연 시간을 최소화합니다.
*   **보안 (mTLS):** 기기 간 통신은 무조건 암호화되어야 합니다. 기기 바인딩 시 서로의 공개키(Public Key)를 교환하고, 이후에는 철저히 상호 인증된(mTLS) 통신만 허용해야 "내 기기 그룹"이 완성됩니다.

### 3. State & Consensus (두뇌 동기화): 하나의 뇌처럼 생각하기
바인딩의 핵심입니다. 한 기기에서 복사한 텍스트, 변경한 설정, 켜져 있는 앱의 상태가 다른 기기에도 즉각 똑같이 인지되어야 합니다.

*   **강한 일관성 (Raft / Paxos 알고리즘):** 기기 그룹의 핵심 설정이나 중요한 권한 정보는 모두가 완벽히 동일한 상태를 유지해야 합니다. 분산 키-밸류 스토어(`etcd`, `Consul` 같은 개념)를 내장하여 "마스터 상태"를 유지합니다.
*   **최종 일관성 (CRDTs - Conflict-free Replicated Data Types):** 네트워크가 끊겼다가 다시 연결되어도 충돌 없이 데이터가 병합되는 기술입니다. 클립보드 공유, 실시간 문서 동시 편집, 임시 상태 공유 등에 완벽하게 작동합니다.

### 4. Resource Virtualization (자원 추상화): 무엇을 하나로 묶을 것인가?
네트워크와 뇌가 연결되었다면, 실제 사용자가 체감할 수 있는 '자원'들을 추상화해서 하나로 합쳐야 합니다.

*   **I/O 바인딩 (입출력):** 
    *   마우스와 키보드 하나로 모든 화면의 커서를 넘나들 수 있어야 합니다. (KVM 소프트웨어 방식)
    *   한 기기에서 재생되는 소리를 다른 기기로 자연스럽게 넘기거나 합칠 수 있어야 합니다.
*   **파일 시스템 바인딩 (분산 FS):**
    *   각 기기의 디스크를 논리적인 하나의 거대한 드라이브로 묶습니다. A 기기에 저장한 파일을 B 기기에서 로컬 파일처럼 열어볼 수 있어야 합니다. (IPFS, Ceph, GlusterFS 개념 차용)
*   **컴퓨팅(프로세스) 바인딩:**
    *   노트북(가벼운 기기)에서 무거운 렌더링이나 빌드 명령을 내리면, 바인딩된 데스크톱(무거운 기기)의 CPU/GPU 자원을 끌어다 쓰고 결과만 노트북으로 가져오는 식의 작업 스케줄링(Actor Model, Kubernetes 축소판)이 필요합니다.

### 5. UX / Abstraction (사용자 경험): 기계의 경계 지우기
시스템적으로 아무리 잘 묶여 있어도, 사용자가 "지금 내가 A 컴퓨터를 쓰는지 B 컴퓨터를 쓰는지" 의식해야 한다면 진정한 바인딩이 아닙니다.

*   **Universal Clipboard & Drag-and-Drop:** 기기 간 클립보드 공유와 화면을 가로지르는 파일 드래그 앤 드롭은 필수입니다.
*   **작업(Context)의 연속성:** A 기기에서 보던 브라우저 탭, 열어둔 에디터의 커서 위치가 B 기기를 켜면 그대로 나타나는 식의 '핸드오프(Handoff)' 기능.
*   **단일 제어 센터:** 모든 기기의 배터리, CPU 점유율, 저장 공간을 마치 하나의 기기 제어판에서 보듯 통합 관리할 수 있어야 합니다.

## 요약

"무수(Musu)"가 여러 대를 하나의 기계로 묶는다는 것은, 밑단에서는 WireGuard + mDNS + CRDTs를 조합해 투명하고 안전한 P2P 데이터 버스를 만들고, 그 윗단에서 I/O와 파일 시스템, 컴퓨팅 자원을 가상화하여 사용자에게는 그저 "모니터만 여러 개인 하나의 엄청나게 강력한 컴퓨터"를 쓰는 듯한 환상을 만들어내는 아키텍처가 되어야 합니다.

## 6. Open Source References for Implementation

### 6.1 Interactive Terminal (PTY)
- **Backend**: `portable-pty` (WezTerm's cross-platform library) or `tokio-pty-process`.
- **Frontend**: `xterm.js` (Industry standard, used by VS Code) + `xterm-addon-attach` for WebSockets.
- **Architecture Reference**: `tty-web`, `webterm`.

### 6.2 Remote File Explorer (Directory Tree)
- **Frontend Tree Components**: 
  - **React Arborist**: Highly recommended. Provides VS Code-like interaction, drag-and-drop, and virtualized rendering for huge trees.
  - **React Complex Tree**: Unopinionated, good for highly custom multi-select enterprise environments.

### 6.3 Multi-Machine Fleet Cockpit UI
- **Metrics & Layout**: `Tremor` (modular dashboard UI), `Recharts` (data visualization).
- **Node Lists**: `TanStack Table` (headless, high performance data grids).
- **UX/Architecture Inspiration**: 
  - **RustDesk / Portainer / Proxmox**: Split-pane layouts with node list on the left and selected terminals/VNC on the right.
  - **TailAdmin / React Admin**: Good starting points for dashboard scaffolding.
