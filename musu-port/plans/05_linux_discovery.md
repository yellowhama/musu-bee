# 05 Linux Discovery

## 목표

Linux에서 unmanaged listener discovery를 원본 기준으로 재현한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`

## 이번 단계 범위

- `ss` 기반 snapshot
- 파싱
- 분류
- unmanaged endpoint 목록 생성

## 제외 범위

- macOS
- Windows
- promote persistence

## 구현 작업 목록

- `ss -ltnpH` 파서
- `ss -lunpH` 파서
- pid/process/user 추출
- signature/legacy signature 계산
- exposure/owner/severity 분류
- false-positive 판정
- managed port 제외

## 검증 방법

- 임시 HTTP/TCP/UDP listener 띄우기
- unmanaged 목록 확인
- ignore 적용 전후 비교

## 보류 항목

- OS 확장

## 완료 기준

- Linux listener 목록이 재현판에서 의미 있게 surface 됨

## 현재 결과

- 코드 구현 완료, live smoke 일부 보류
- 구현 완료:
  - `ss -ltnpH`
  - `ss -lunpH`
  - pid/process/user 파싱
  - signature / legacy signature
  - exposure / owner / severity / false-positive 분류
  - `/discovery` endpoint 연결
- 남은 검증:
  - 재기동 후 `/discovery` live 응답 확인
