# Windows Helper Service Install

## 목표

resident Windows helper를 "필요할 때 Explorer에서 띄우는 수동 프로세스"가 아니라
Windows login lifecycle에 묶인 startup-managed runtime으로 승격한다.

이 단계의 최종 상태는 다음이다.

- helper 설치 여부를 명시적으로 조회할 수 있다.
- helper를 install / uninstall / restart 할 수 있다.
- Scheduled Task를 우선 사용한다.
- Scheduled Task가 막히면 Startup folder `.cmd` fallback으로 내려간다.
- WSL 쪽 status surface가 runtime 상태와 install 상태를 함께 보여준다.

## 배경

현재 상태:

- `windows-bridge-helper.ps1`는 동작한다.
- `helper-lifecycle.ps1`로 `start/status/stop/restart`는 가능하다.
- 하지만 helper는 여전히 "세션 운영자가 직접 띄워야 하는 도구"에 가깝다.
- direct interop가 flaky한 환경에서는 helper가 사실상 primary reliability path인데,
  install 모델이 수동이면 운영 표준이 약하다.

OpenClaw 참고 패턴:

- Windows service lifecycle은 `schtasks`를 우선 사용한다.
- `schtasks`가 막히거나 timeout이면 Startup folder launcher로 fallback한다.
- runtime status와 install state를 분리하지 않고 함께 보여준다.

## 이번 단계 범위

- helper install/uninstall/status surface 설계 및 구현
- Scheduled Task install path 추가
- Startup folder fallback path 추가
- helper lifecycle/status를 install state aware 하게 확장
- README / runbook / TODO / handoff 정렬

## 제외 범위

- action runner의 spawn policy 재설계
- browser/CDP split-host action 추가
- helper queue protocol 변경
- Windows UI automation 일반화

## 설계 방향

### 1. helper runtime과 helper install을 분리한다

runtime state:

- `online`
- `offline`
- `stale`

install state:

- `manual`
- `scheduled-task`
- `startup-folder`
- `not-installed`

status는 이 둘을 같이 보여줘야 한다.

예:

- `install_state=scheduled-task`, `runtime_state=online`
- `install_state=startup-folder`, `runtime_state=offline`

### 2. Scheduled Task를 우선 경로로 둔다

이유:

- 로그인 이후 자동 기동에 가장 자연스럽다.
- 상태/재기동/종료 표면을 명시적으로 다룰 수 있다.
- 수동 `.cmd` 실행보다 운영 설명이 쉬워진다.

예상 동작:

1. helper install 시 task script/cmd를 생성
2. `schtasks /Create`로 current-user logon trigger 등록
3. install 직후 helper를 한 번 시작
4. status에서 task 존재 여부와 현재 helper heartbeat를 함께 읽음

### 3. Scheduled Task 실패 시 Startup folder fallback을 둔다

fallback 조건:

- access denied
- `schtasks` timeout
- `schtasks` no-output hang

fallback 동작:

1. Startup folder용 `.cmd` launcher 생성
2. install 직후 helper를 바로 1회 실행
3. status에서 Startup folder launcher 존재를 install state로 노출

### 4. helper lifecycle surface를 install-aware로 확장한다

현재:

- `start/status/stop/restart`

추가:

- `install`
- `uninstall`
- `install-status`

Windows 측 surface 후보:

- `install-helper.cmd`
- `uninstall-helper.cmd`
- `status-helper.cmd`
  - runtime + install combined status

WSL 측 surface:

- `status-helper.sh`
  - install state
  - runtime state
  - recommended next action

## 구현 작업 목록

### Track 1. Windows Install Manager

- `helper-lifecycle.ps1`를 확장하거나 별도 `helper-service.ps1` 추가
- action:
  - `install`
  - `uninstall`
  - `status`
  - `start`
  - `stop`
  - `restart`
- install mode 판단:
  - Scheduled Task 존재 여부
  - Startup folder launcher 존재 여부

### Track 2. Scheduled Task Surface

- helper용 task name 결정
- helper용 task script/launcher 생성
- `schtasks` create/query/delete/run/end wrapper 추가
- timeout/access denied detection 추가

### Track 3. Startup Fallback Surface

- Startup folder path 계산
- fallback `.cmd` launcher 생성
- remove path 추가
- fallback runtime 즉시 launch 추가

### Track 4. Status Unification

- Windows `status-helper.cmd`
  - install state + runtime state + pid + heartbeat age
- WSL `status-helper.sh`
  - queue/processing/results/logs count와 함께 install state 출력
- handoff 문서에서 "helper installed?"를 첫 질문으로 만들기

### Track 5. Documentation

- `MASTER_PLAN.md`
- `TODO.md`
- `WINDOWS_BRIDGE_STANDARD.md`
- `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
- `README.md`

## 검증 방법

### Windows install path

1. install 실행
2. status에서 `scheduled-task` 또는 `startup-folder` 확인
3. helper runtime `online` 확인

### Restart / stop / uninstall

1. restart 후 heartbeat 갱신 확인
2. stop 후 runtime `offline` 확인
3. uninstall 후 install state `not-installed` 확인

### Fallback path

1. `schtasks` create를 일부러 실패시키는 test path 준비
2. Startup folder launcher 생성 확인
3. fallback launcher로 helper 기동 확인

### WSL visibility

1. `status-helper.sh`에서 install state 확인
2. helper offline인데 install state는 있는 경우 recommended action 확인

## 완료 기준

- helper가 Windows login-managed runtime으로 설치 가능하다.
- install state와 runtime state가 분리되어 보인다.
- `schtasks` failure가 생겨도 Startup fallback으로 자동 전환된다.
- direct interop가 죽어 있어도 operator가 "helper가 설치돼 있는가?"부터 빠르게 판단할 수 있다.

