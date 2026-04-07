# MUSU Functions Root Program 2026-04-03

## 목적

`Paperclip`이 이제 단일 하위 모듈이 아니라 `/home/hugh51/musu-functions` 전체를 운영 대상으로 삼도록 루트 goal, project, execution lanes를 만들고 실제 heartbeat까지 올린 상태를 고정 기록한다.

제품 정의는 다음과 같다.

- 카페의 노트북에서 집의 두 데스크탑을 하나의 기계처럼 사용한다.
- 강한 GPU 머신은 무거운 생성 작업을 맡고, 보조 GPU 머신은 vision QA, tagging, 보조 inference를 맡는다.
- operator는 원격 화면, 실행 상태, 산출물을 실시간으로 보고 조작한다.
- 전체 시스템은 개인용 on-prem protected AI operation으로 동작한다.

## live control-plane mapping

- company: `musu corp`
- company id: `f27a9bd2-688a-450b-98b4-f63d24b0ab50`
- api: `http://127.0.0.1:3100/api`

### root goal

- title: `MUSU Personal On-Prem AI Operation`
- goal id: `aece03ed-39c0-4af6-9cd2-de13730f33a8`
- status: `active`

### root project

- name: `musu-functions root`
- project id: `23f06292-f513-4261-ba4a-d30fe37a9e0b`
- status: `in_progress`
- intended repo root: `/home/hugh51/musu-functions`

## execution issue map

### program drive

- issue: `MUS-25`
- issue id: `d9a2fc30-20f7-491c-baeb-cd368d339d1d`
- status: `in_progress`
- assignee: `CEO 2`
- active run: `4ca78478-2665-4323-841e-cdead477478b`
- attached local plan source:
  - `/home/hugh51/musu-functions/plans/15_personal_onprem_ai_operation.md`

### lane 1

- issue: `MUS-26`
- issue id: `c10ff5e5-1460-46e9-a1f3-c5a6abd36aab`
- title: `Execution lane 1: root system contract and toolchain normalization`
- status: `in_progress`
- assignee: `Founding Engineer`
- queued automation run: `00e31171-bf44-4386-9014-c2d231e1cd38`
- canonical verifier: `/home/hugh51/musu-functions/scripts/verify-wave0-lane1.sh`
- latest verifier summary: `pass=8 fail=0 info=1`

### lane 2

- issue: `MUS-27`
- issue id: `ab7178d4-c8f6-408d-811a-c8248f92399b`
- title: `Execution lane 2: port + connects cross-device route plane`
- status: `in_progress`
- assignee: `Founding Engineer`

### lane 3

- issue: `MUS-28`
- issue id: `da4636cf-732f-48cf-922d-16070efc5961`
- title: `Execution lane 3: CRT remote surface for operator laptop`
- status: `todo`
- assignee: `Founding Engineer`

### lane 4

- issue: `MUS-29`
- issue id: `7b8ca3a2-a8c0-49fe-b278-ac81dfa55126`
- title: `Execution lane 4: WORKS autonomous workload routing and safety`
- status: `in_review`
- assignee: `Founding Engineer`
- active run: `ddca138f-858c-4332-bb97-5015d3a78c0e`

### follow-up review issues

- `MUS-32`
  - title: `Ops unblock: normalize heartbeat cargo toolchain path for lockfile v4`
  - status: `done`
  - assignee: `CEO 2`
- `MUS-34`
  - title: `Review MUS-27 lane-2 trust/health route-sync slice and approve next packet`
  - status: `todo`
  - assignee: `CEO 2`

## automation recovery note

처음에는 root project를 만들고 issue를 태운 직후 heartbeat가 실패했다.

- failed run example:
  - `4cabf327-272e-4b52-ac71-400d848527be` (`CEO 2`)
  - `4045b3e8-fd5d-4cc6-b386-33a76576aa88` (`Founding Engineer`)
- failure:
  - `Command not found in PATH: "codex"`

원인은 `codex_local` adapter가 bare `codex` 실행을 가정했기 때문이다. heartbeat runtime PATH에서는 해당 바이너리를 찾지 못했다.

그래서 live agent 설정을 다음으로 교정했다.

- `adapterConfig.command=/home/hugh51/.npm-global/bin/codex`
- 이후 root wrapper로 다시 교정:
  - `/home/hugh51/musu-functions/scripts/paperclip-codex-wrapper.sh`

교정 후 manual heartbeat invoke로 재기동했고 현재 두 agent는 모두 `running`이다.

## current interpretation

이제 `Paperclip`은 최소한 control plane 관점에서는 다음을 만족한다.

- 루트 제품 목표가 회사 goal로 등록돼 있다.
- 루트 저장소가 project로 등록돼 있다.
- 마스터 플랜이 issue plan document로 연결돼 있다.
- 세부 execution lane이 개별 issue로 분할돼 있다.
- CEO와 Founding Engineer가 실제로 heartbeat run 상태에 올라가 있다.
- `MUS-26`에는 system-triggered automation run이 실제로 queue에 올라와 있다.

아직 남은 것은 "자동운영을 위한 제품 구현"이지 "control plane 등록"이 아니다. 즉 지금부터는 `MUS-26`부터 `MUS-29`까지를 실제 코드와 검증으로 밀어야 한다.

동시에 legacy `musu-connects` routine도 살아 있어서 `MUS-30`, `MUS-31`을 새로 만들었다. 이 상태를 방치하면 루트 program과 하위 substream이 둘 다 CEO/Engineer attention을 잡아먹는다. 그래서 운영 원칙은 다음으로 고정한다.

- primary execution program: `musu-functions root`
- legacy substream: `musu-connects`
- CEO는 루트 program 기준으로 우선순위를 정하고, legacy routine 산출물은 필요할 때만 흡수한다.

## quick verification commands

```bash
curl -s http://127.0.0.1:3100/api/health

python3 - <<'PY'
import json, urllib.request, pprint
company='f27a9bd2-688a-450b-98b4-f63d24b0ab50'
base=f'http://127.0.0.1:3100/api/companies/{company}'
for path in ['dashboard', 'live-runs', 'heartbeat-runs']:
    print('===', path)
    data=json.load(urllib.request.urlopen(base+'/'+path))
    pprint.pp(data if path != 'heartbeat-runs' else data[:4])
PY
```
