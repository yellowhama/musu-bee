# CEO Product Review 2026-04-03

## 한 줄 결론

`musu-port`, `musu-connects`, `MUSU-CRT`는 MUSU 제품 코어 3단이다.

- `musu-port`는 로컬 ingress/control plane이다.
- `musu-connects`는 cross-device network plane이다.
- `MUSU-CRT`는 사용자가 체감하는 remote runtime surface다.

이 셋이 연결되어야 MUSU는 "AI 회사 운영 툴"이 아니라 "내 여러 컴퓨터와 서비스와 세션을 하나의 관리된 작업 표면으로 묶는 제품"이 된다.

## 왜 `musu-connects`가 핵심인가

`musu-port`만 있으면 로컬 기기 안에서 서비스 표면을 관리할 수 있다.

`musu-connects`가 붙어야:

1. 다른 기기의 managed route를 advertisement/import로 가져올 수 있다.
2. local managed ingress가 cross-device managed ingress로 확장된다.
3. peer identity, session, health, freshness를 제품의 일부로 다룰 수 있다.

즉 `musu-connects`는 선택 기능이 아니라 MUSU를 single-machine 도구에서 personal runtime mesh로 바꾸는 계층이다.

## 현재 평가

### 잘 된 점

- planning/contract 문서가 충분히 고정됐다.
- core domain scaffold가 작고 명확하다.
- discovery / pairing / route sync baseline이 코드로 들어가 있다.
- `musu-port`와의 책임 분리는 비교적 선명하다.

### 부족한 점

- `musu-port` adapter layer가 아직 없다.
- 실제 QUIC endpoint / dial / accept / control stream이 없다.
- 따라서 제품의 가장 강한 주장인 "cross-device managed ingress"가 아직 실제 경험으로 닫히지 않았다.
- 문서는 풍부하지만 "바로 시연 가능한 첫 완성 흐름"은 아직 약하다.

## 제품 우선순위 판단

`musu-connects`의 다음 단계는 문서 확대가 아니라 아래 두 축이다.

1. `musu-port` adapter integration
2. actual QUIC provider baseline

그 뒤에야 첫 product demonstration을 만들 수 있다:

1. `musu-port`에서 local route export
2. `musu-connects`에서 advertisement/pair/sync
3. remote imported route를 다른 기기에서 소비

## CEO 판단

`musu-connects`는 계속 separate bounded context로 유지하는 것이 맞다.

이유:

- 제품 레이어 분리가 명확해진다.
- `musu-port`를 오염시키지 않는다.
- cross-device plane의 책임을 고립시킬 수 있다.
- 나중에 supervisor/warden/runtime 계층과도 cleaner하게 붙일 수 있다.

하지만 이제는 "planning repo"가 아니라 "adapter/provider가 실제로 붙는 product repo"로 넘어가야 한다.

## 지금 당장 해야 할 일

1. `musu-port` route shape를 읽어 `musu-connects` local export adapter trait과 default mapper를 만든다.
2. imported route를 local service surface에 투영하는 import adapter trait과 merge policy를 만든다.
3. QUIC endpoint config, dial/accept baseline, control bi-stream shape를 추가한다.
4. Paperclip에서는 이 세 단위를 별도 issue로 쪼개고 `Founding Engineer`에게 실행시킨다.

## 성공 기준

아래 질문에 실제 코드와 demo 흐름으로 "예"라고 답할 수 있어야 한다.

- 다른 기기의 `musu-port` route를 MUSU가 가져올 수 있는가?
- imported route가 freshness / trust / collision 규칙을 가진 채 local surface로 들어오는가?
- QUIC session과 control stream이 실제 코드로 존재하는가?
- 이 흐름을 Paperclip issue execution으로 밀 수 있는가?
