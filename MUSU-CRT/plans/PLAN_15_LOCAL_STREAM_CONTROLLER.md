# PLAN 15: Local Stream Controller

## 목표

local polling path를 hook shell 바깥으로 이동할 controller 후보를 만든다.

## 범위

- start / pull / update / stop
- parser / metrics / reconnect 연결
- clipboard/gui 분기

## 작업 목록

1. local controller code 추가
2. existing extracted stream units와 연결
3. TODO / board 반영

## 완료 기준

- [extracted/stream/local_stream_controller.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_stream_controller.ts) 가 존재한다.
