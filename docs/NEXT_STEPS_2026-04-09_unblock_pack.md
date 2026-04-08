# Next Steps — 2026-04-09 (Paperclip Unblock Pack)

목표: blocked/high 7를 “증거 패킷”으로 바꿔서 실제 실행이 다시 굴러가게 만든다.

## Step 0 — 현재 truth 재확인 (10분)

```bash
CID=f27a9bd2-688a-450b-98b4-f63d24b0ab50
curl -sS http://127.0.0.1:3100/api/health | jq
curl -sS "http://127.0.0.1:3100/api/companies/$CID/dashboard" | jq
curl -sS "http://127.0.0.1:3100/api/companies/$CID/agents" | jq -r '.[] | [.urlKey,.status,(.lastHeartbeatAt//"")] | @tsv' | sort
```

## Step 1 — Board-input 2종 증거 확보 (가장 급한 블락)

### 1-A) Paddle sandbox credentials (증거만)

- 목표: “Paddle 값이 실제로 주입됐다”는 증거 1장(레드랙션 OK).

```bash
grep -i PADDLE /mnt/f/Aisaak/Projects/yellow.txt
```

### 1-B) 5070Ti SSH 허가 또는 수동 status proof

- 목표: `curl http://localhost:23880/status` 출력 캡처(또는 SSH 성공 로그).

```bash
ssh <user>@100.121.211.106 'hostname; date'
# 또는 5070Ti 콘솔에서:
curl -sS http://localhost:23880/status | head -n 120
```

## Step 2 — “다른 컴퓨터 필요”를 구조적으로 제거 (Plan 66)

worker가 모든 노드에서 살아야, 이후는 `remote_process`로 증거를 뽑아낼 수 있다.

노드에서:
```bash
cd /home/hugh51/musu-functions
./scripts/start-worker.sh
curl -sf http://127.0.0.1:9700/health
```

오케스트레이터에서:
```bash
python3 scripts/musu_mesh_healthcheck.py
python3 scripts/musu_remote_process.py --url http://100.121.211.106:9700 -- echo hello
```

## Step 3 — Unblock plan 문서 동기화(필요 시 재실행)

```bash
./scripts/paperclip_put_unblock_plans_2026-04-09.sh
```

## Step 4 — run-linkage repair → QA G2 → invariant hardening

이건 board-privileged repair가 먼저 실행돼야 QA가 G2를 낼 수 있다.

```bash
# (경로가 실제로 존재할 때만) dry-run
python3 /home/hugh51/musu_corp/runtime/scripts/paperclip_run_linkage_repair.py --json --dry-run
```

## Step 5 — Founding Engineer error 복구

대시보드 `agents.error`가 남아 있으면, 어떤 실행도 점점 느려진다.

- 목표: FE가 heartbeat 한 번이라도 정상 성공해서 `status=running/idle`로 돌아오게 만들기.

