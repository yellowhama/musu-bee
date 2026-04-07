# Remote Session Canonical Plan

작성일: 2026-04-02

## 목적

`Slice 3 - remote session controller`를 원본 repo 이전에 `MUSU-CRT` canonical harness 안에서 먼저 닫는다.

## 범위

- remote session fixture
- attach / close 상태 전이
- canonical harness panel
- smoke script check

## 비범위

- relay / auth / room orchestration
- production signaling infra
- multi-peer coordination

## 완료 기준

- remote session fixture가 있다
- canonical harness가 remote state panel을 렌더한다
- smoke script가 remote session check를 통과한다
