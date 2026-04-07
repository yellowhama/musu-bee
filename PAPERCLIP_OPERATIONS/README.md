# Paperclip Operations

## 목적

`musu-functions`에서 `Paperclip`을 실제 control plane으로 써서 일을 태우고, 다음 세션에서도 바로 이어갈 수 있게 운영 상태와 재개 절차를 고정한다.

이 폴더는 세 가지를 기록한다.

1. 현재 live 회사 상태
2. 핵심 프로젝트별 Paperclip 매핑
3. 다시 틀었을 때 바로 이어가는 명령/절차

## 현재 운영 원칙

- `Paperclip`은 회사 control plane이다.
- 실제 제품 구현 저장소는 각 프로젝트 폴더에 남긴다.
- 로컬 플랜 문서와 `Paperclip` 이슈 상태가 다르면, 먼저 `Paperclip` live 상태를 확인하고 로컬 문서를 맞춘다.
- blocked 이슈는 이유가 코드인지, 툴체인인지, workspace drift인지 명확히 comment로 남긴다.
- 구현 packet이 끝나면 다음 packet 또는 proof refresh packet을 새 issue로 만든다.

## 현재 핵심 프로젝트

- `musu-functions root`
  - goal: `MUSU Personal On-Prem AI Operation`
  - goal id: `aece03ed-39c0-4af6-9cd2-de13730f33a8`
  - project id: `23f06292-f513-4261-ba4a-d30fe37a9e0b`
  - 실제 작업 루트: `/home/hugh51/musu-functions`
- `musu-connects`
  - goal: `MUSU Connects QUIC Path`
  - project id: `739006ad-b6fc-42cd-8e72-9bef6e59b0ea`
  - workspace: `/home/hugh51/musu-functions/musu-connects`

지금 `Paperclip`의 최상위 운영 대상은 더 이상 `musu-connects` 단일 프로젝트가 아니다. 루트 제품 정의는 "`/home/hugh51/musu-functions` 전체를 개인 on-prem AI operation으로 완성"하는 것이다.

## 이 폴더의 문서

- [LIVE_STATE_2026-04-03.md](/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/LIVE_STATE_2026-04-03.md)
- [MUSU_FUNCTIONS_ROOT_PROGRAM_2026-04-03.md](/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/MUSU_FUNCTIONS_ROOT_PROGRAM_2026-04-03.md)
- [WAVE0_LANE1_GATE_A_VERIFICATION_CONTRACT_2026-04-03.md](/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/WAVE0_LANE1_GATE_A_VERIFICATION_CONTRACT_2026-04-03.md)
- [UNBLOCK_NOTE_2026-04-03_MUS-28_LOCK_CLEAR.md](/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/UNBLOCK_NOTE_2026-04-03_MUS-28_LOCK_CLEAR.md)
- [UNBLOCK_NOTE_2026-04-03_HEARTBEAT_CANCEL_PERMISSION.md](/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/UNBLOCK_NOTE_2026-04-03_HEARTBEAT_CANCEL_PERMISSION.md)
- `README.md`
- `RESUME_PLAYBOOK.md`, `MUSU_CONNECTS_TRACK.md`는 이전 메모에 언급됐지만 현재 폴더에는 없다.

## 기본 API 기준

- base URL: `http://127.0.0.1:3100` (`/api/*`)
- company id: `f27a9bd2-688a-450b-98b4-f63d24b0ab50`
- company name: `musu corp`

## 빠른 확인 명령

```bash
ss -lntp | rg ':3100\b|127.0.0.1:3100'
curl -sS -H "Authorization: Bearer $PAPERCLIP_API_KEY" http://127.0.0.1:3100/api/companies/$PAPERCLIP_COMPANY_ID/dashboard

python3 - <<'PY'
import urllib.request
import os
base='http://127.0.0.1:3100/api'
company='f27a9bd2-688a-450b-98b4-f63d24b0ab50'
key=os.environ.get('PAPERCLIP_API_KEY','')
hdr={'Authorization':f'Bearer {key}'} if key else {}
for path in [
    f'{base}/companies/{company}/dashboard',
    f'{base}/companies/{company}/issues?projectId=23f06292-f513-4261-ba4a-d30fe37a9e0b&limit=250',
]:
    print('===', path)
    req=urllib.request.Request(path, headers=hdr)
    print(urllib.request.urlopen(req, timeout=5).read().decode()[:1200])
PY
```

## 현재 해석

지금 `Paperclip`은 루트 프로그램 기준으로 실운영 중이다.

- latest sync: `2026-04-03 21:21 KST`
- root project 핵심 상태:
  - parent: `MUS-144` (`in_progress`, owner `CEO 2`)
  - completed this cycle: `MUS-145` (Wave A), `MUS-147` (Wave B), `MUS-148` (Wave C), `MUS-149` (Wave D), `MUS-163` (Wave D QA gate)
  - active now: `MUS-146` (ops hygiene, owner `Chief of Staff`) + `MUS-144` (parent execution lane)
  - lane closures observed: `MUS-162/172/173/174` are `done`
  - parent queue remains: `MUS-150` (Wave E, owner `Chief of Staff`) -> `MUS-151` (Wave F, owner `QA Lead`)
- run snapshot:
  - stale queued runs `c3c7a047`, `89398315`, `aaf8e832` 취소 완료
  - `MUS-151` running run `f47a6af1...`는 cancel되어 backlog/run mismatch가 해소됨
  - `MUS-150` recurrence run `53cebf50...` 및 comment-wake run `5356e7f1...`를 cancel했고 현재 root anomaly count는 `0`
  - latest aligned root run is `MUS-146` (`9a780f36...`, running)
  - latest `MUS-146` board heartbeat note: `1776c621-95c5-4634-b2c9-98d6df89512a`
  - status-first sequencing으로 parent backlog state를 유지하고 recurrence guard를 ops debt로 추적
  - guardrail: parked backlog issue(`MUS-150`, `MUS-151`)에는 non-essential comment를 남기지 않는다 (`issue_commented` wake 방지)
  - heartbeat projection debt: `issueId=null` + `contextSnapshot.issueId` 유효
- plan/board sync:
  - `MUS-144`~`MUS-151` plan documents를 `/home/hugh51/musu-functions/plans/32..39` 기준으로 동기화 완료

legacy `musu-connects` routine은 여전히 살아 있다. 다만 현재 우선순위는 유지한다.

1. primary: `musu-functions root`
2. secondary: legacy `musu-connects` routine outputs
