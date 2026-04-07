# Wave 2 Lane-3 Remote Session Health Coherence

## 목표

`MUS-58` 기준으로 CRT의 `remoteSessionHealth`가 route freshness/trust verdict와 일관되게 보이도록 정리한다.

## 문제 정의

현재 backlog 기준 Sev-2 gap은 stale/withdrawn route가 operator-visible artifact에서 여전히 healthy remote session처럼 보일 수 있다는 점이다.

## 범위

1. CRT read-path mapping 재정의
   - trusted + fresh
   - degraded
   - stale / withdrawn
2. deterministic fixture 또는 smoke artifact 추가
3. replay command와 artifact path를 root board와 lane-3 문서에 반영

## 제외 범위

- lane-2 transport proof 변경
- full screen-share UX 확장
- public relay / NAT traversal 배포

## 검증

1. trusted+fresh 상태 artifact 1개
2. degraded 상태 artifact 1개
3. stale/withdrawn 상태 artifact 1개
4. stale/withdrawn artifact에서 healthy session이 보이지 않는지 확인

## 완료 기준

- `remoteSessionHealth`가 trust/freshness verdict와 모순되지 않는다.
- `MUS-28` unblock 판단에 필요한 replay evidence가 준비된다.
