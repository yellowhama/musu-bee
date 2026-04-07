# 07 Discovery And Route Sync Baseline

## 목표

discovery -> trusted peer -> route publish/import baseline을 서비스 단위로 올린다.

## 참조 문서

- [PEER_IDENTITY_AND_DISCOVERY.md](/home/hugh51/musu-functions/musu-connects/PEER_IDENTITY_AND_DISCOVERY.md)
- [ADVERTISEMENT_IMPORT_PLANE.md](/home/hugh51/musu-functions/musu-connects/ADVERTISEMENT_IMPORT_PLANE.md)
- [ORIGINAL_CODE_REFERENCE_MAP.md](/home/hugh51/musu-functions/musu-connects/ORIGINAL_CODE_REFERENCE_MAP.md)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/discovery.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/discovery.rs)

## 이번 단계 범위

- discovery provider trait
- discovered peer registry
- advertised/imported registry merge/update
- refresh / stale transition baseline

## 제외 범위

- OS-specific discovery 최적화
- WAN relay discovery

## 구현 작업 목록

1. discovery provider trait 추가
2. in-memory discovered peer registry 추가
3. advertised/imported registry merge/update API 추가
4. route sync service baseline 추가
5. stale/refresh 테스트 추가

## 검증 방법

- `cargo test`
- registry merge/update unit test
- route sync service unit test

## 보류 항목

- mDNS 실제 바인딩
- SSDP/other discovery providers

## 완료 기준

- discovery와 route sync가 transport와 분리된 서비스 단위로 검증 가능하다.
