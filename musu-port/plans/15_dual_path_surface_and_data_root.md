# 15 Dual Path Surface And Data Root

## 목표

Windows/WSL 바이링구얼 제품에서 data/report 위치를 하나의 계약으로 정리하고,
`metadata_dual_path_status`를 실제 값으로 채운다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`

## 이번 단계 범위

- `MUSU_PORT_DATA_ROOT` contract 추가
- default metadata/connect report dir를 `data_root` 기준으로 고정
- `/coverage.metadata_dual_path_status`를 실제 dual-path object로 채움

## 제외 범위

- Windows AppData / Linux XDG 최종 정책
- cross-device synced data root

## 구현 작업 목록

- config에 `data_root` 추가
- state default report dir를 `data_root` 기준으로 전환
- linux/runtime/windows path view builder 추가
- `metadata_dual_path_status` JSON object 생성

## 검증 방법

- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`

## 보류 항목

- 최종 사용자 데이터 위치 정책
- Windows native live export smoke

## 완료 기준

- data root 기준이 코드에 존재한다
- coverage payload에서 dual path surface를 실제로 확인할 수 있다
