# PLAN 11: Execution Aware Viewer

## 목표

root-level viewer를 `read-only company viewer`에서 role template, attached agents, active sessions, isolation/runtime notes까지 보여주는 execution-aware control plane viewer로 확장한다.

## 범위

- root viewer navigation/sections 확장
- role templates section 추가
- project cards에 attachment/session 정보 반영
- contract notes에 runtime/isolation reference 반영

## 현재 truth

- root viewer는 company/org/approvals/projects/contract notes만 표시한다.
- role/session fixture는 아직 연결되지 않았다.

## 입력 파일

- `/home/hugh51/musu-functions/viewer/index.html`
- `/home/hugh51/musu-functions/viewer/app.js`
- `/home/hugh51/musu-functions/viewer/styles.css`
- `/home/hugh51/musu-functions/MUSU-WORKS/mock/*.json`

## 작업 목록

1. 새 fixture file 로드
2. role template section 추가
3. project execution metadata 표시
4. control-plane summary에 active sessions/runtime channels 반영
5. contract note를 role/session/isolation-aware하게 갱신

## 완료 기준

- root viewer가 role template와 active session 정보를 표시한다.
- viewer가 execution-aware company plane으로 보인다.
- fixture source 목록에 새 file들이 나타난다.

