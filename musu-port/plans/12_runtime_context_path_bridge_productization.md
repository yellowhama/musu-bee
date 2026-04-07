# 12 Runtime Context Path Bridge Productization

## 목표

`musu-port`의 Windows/WSL productization 첫 구현 슬라이스로

- runtime context detection
- path bridge
- executable resolver

를 실제 코드에 연결한다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`
- `/home/hugh51/musu-functions/musu-port/plans/10_windows_wsl_bilingual_adapter_plan.md`

## 이번 단계 범위

- `platform/context.rs` 추가
- `platform/path_bridge.rs` 추가
- `platform/runtime_resolver.rs` 추가
- config/env path 입력을 runtime-aware normalization으로 전환
- metadata/export/report 경로 표면에 translator 결과 반영
- `/health`, metadata report에 runtime/productization 상태 노출

## 제외 범위

- Windows listener discovery provider 구현
- Windows process metadata provider 구현
- 실제 launcher/bootstrap binary 선택 로직 연결
- dual install packaging 자동화

## 구현 작업 목록

- runtime context를 `windows`, `linux`, `wsl`로 감지
- working dir 기준 filesystem context를 `windows_native`, `linux_native`, `wsl_windows_mount`로 감지
- Windows drive path와 `\\\\wsl.localhost\\...` path를 WSL/Linux path로 번역
- WSL path를 Windows drive / UNC path로 역변환
- `.exe` / ELF / AppImage binary kind 판단 및 resolver 규칙 추가
- `MUSU_PORT_SEED_SERVICES`, `MUSU_PORT_STATE_DB` 입력 경로 정규화
- metadata export / connect probe 결과 경로를 runtime-aware display string으로 기록

## 검증 방법

- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`
- unit test:
  - WSL env/proc 기반 runtime detection
  - Windows <-> WSL path translation
  - runtime별 executable preference

## 보류 항목

- Windows runtime에서 실제 `.exe` launcher 호출
- Windows provider split 후 `/discovery` parity 재검증
- shared data dir contract 최종 경로 정책

## 완료 기준

- WSL/Linux 바이너리가 Windows path 입력을 받아도 정상 동작한다
- metadata/health surface에서 현재 runtime/binary/path context를 확인할 수 있다
- 다음 단계에서 discovery/provider를 runtime context 기반으로 분리할 준비가 된다
