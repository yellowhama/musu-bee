# 14 Windows Process Metadata Provider

## 목표

Windows discovery provider의 process attribution을 `pid only` 수준에서

- process name
- process user

수준까지 올린다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`
- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`

## 이번 단계 범위

- Windows discovery provider의 `tasklist.exe /V /FO CSV` 메타데이터 파싱
- `process_user` surface 채우기
- Windows CSV parser unit test 추가

## 제외 범위

- PowerShell/WMI 기반 owner lookup
- 권한 부족 프로세스에 대한 고급 보정
- Windows live smoke 완주

## 구현 작업 목록

- `WindowsProcessMetadata` 캐시 구조 추가
- `tasklist.exe` verbose 모드 파싱
- `process_user`를 `DiscoveredEndpoint`에 연결
- CSV quoted comma 처리 테스트 추가

## 검증 방법

- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`

## 보류 항목

- 권한 제한 때문에 tasklist가 username을 숨기는 케이스
- PowerShell owner lookup fallback

## 완료 기준

- Windows provider가 name + user를 같은 provider contract로 반환한다
- parser/unit tests가 추가된다
