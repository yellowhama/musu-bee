# 02 Peer Identity And Discovery

## 목표

기기와 peer의 identity 모델, trust scope, discovery lifecycle을 고정한다.

## 참조 문서

- [/home/hugh51/musu-functions/musu-connects/README.md](/home/hugh51/musu-functions/musu-connects/README.md)
- [/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)
- [/home/hugh51/musu-functions/musu-connects/PEER_IDENTITY_AND_DISCOVERY.md](/home/hugh51/musu-functions/musu-connects/PEER_IDENTITY_AND_DISCOVERY.md)

## 이번 단계 범위

- device identity
- peer identity
- trust level
- discovery lifecycle

## 제외 범위

- transport implementation
- auth provider integration
- UI/UX 확정

## 구현 작업 목록

- device/peer field 정의
- trust level 정의
- discovery 단계 정의
- open question 분리

## 검증 방법

- 문서 리뷰
- contract consistency 확인
- `musu-port` route contract와 연결성 검토

## 보류 항목

- bootstrap discovery source
- trust elevation flow

## 완료 기준

- peer를 어떤 기준으로 발견/신뢰/기억하는지 문서로 설명 가능
