# Detail Plan — Core / Worker / UI / Diagnostics Boundary Enforcement (2026-04-09)

## 목표

MUSU의 역할 경계를 `core / worker / UI / diagnostics` 4층으로 고정하고, heavy runtime이 core 안으로 스며들지 않게 하는 실행 계획을 만든다.

## 현재 truth

- 현재 문서상 원칙은 있다.
  - core는 가볍게
  - heavy work는 worker로
  - diagnostics는 상시 생성하지 않음
- 하지만 code ownership / import boundary / process boundary / service boundary가 아직 강하게 명시되지 않았다.
- 이 상태로 기능이 쌓이면 `musu-core`나 control-plane이 비대화될 위험이 있다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/musu-port`
- `/home/hugh51/musu-functions/musu-worker`
- `/home/hugh51/musu-functions/musu-connects`
- `/home/hugh51/musu-functions/MUSU-CRT`
- `/home/hugh51/musu-functions/scripts/systemd`
- `/home/hugh51/musu-functions/INSTALL.md`

## 범위

- 역할 경계 정의
- 금지 import/runtime 예시 정의
- process/service 분리 원칙 정의
- acceptance evidence 정의

## 제외 범위

- 실제 모듈 분리 리팩터
- 새 service 생성
- CI import-lint 도입

## 구현 작업 목록

1. 4층 경계 표 작성
   - core: control-plane, queue/policy/state metadata
   - worker: execution, transform, inference, indexing
   - UI: sampled status/read surface
   - diagnostics: on-demand proof/audit
2. 금지 경계 정의
   - core에서 금지할 GPU/LLM/indexing runtime
   - UI에서 금지할 상시 deep polling
   - diagnostics에서 금지할 always-on dump
3. OS-level 분리 원칙 정리
   - systemd unit
   - cgroup budget
   - restart/cleanup/log retention
4. follow-up enforcement 후보 정리
   - import lint
   - process split
   - runtime flags

## 검증 명령

```bash
rg -n "torch|onnx|transformers|sentence_transformers|qwen|llama|whisper" /home/hugh51/musu-functions
rg -n "subprocess|Popen|spawn|exec" /home/hugh51/musu-functions/musu-port /home/hugh51/musu-functions/musu-worker
systemctl --user cat musu-worker.service 2>/dev/null || true
```

## 기대 artifact / evidence

- 4-layer responsibility matrix
- forbidden runtime/import list
- service/process boundary note
- follow-up enforcement backlog

## 리스크 / 보류 항목

- 현재 repo 구조상 일부 경계는 논리적으로만 존재하고 물리적으로는 섞여 있을 수 있다.
- 따라서 1차 목표는 강제 구현이 아니라 **경계 계약을 고정**하는 것이다.

## 완료 기준

- “무거운 일은 worker로, core는 orchestration only”가 구조 문서로 고정된다.
- follow-up enforcement가 backlog 단위로 잘린다.

## 다음 handoff 또는 TODO 연결

- parent packet: `/home/hugh51/musu-functions/plans/83_lightweight_control_plane_execution_master_2026-04-09.md`
