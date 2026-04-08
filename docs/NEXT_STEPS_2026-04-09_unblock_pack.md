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

### Troubleshooting: `Connection refused` (second-pc)

대부분 아래 3가지 중 하나다:
1) worker가 안 떠있음 2) 9700을 안 듣고 있음(바인딩/실행 실패) 3) 방화벽/ACL로 9700 차단

**second-pc에서 (순서대로 실행)**
```bash
# repo 디렉토리: 머신마다 이름이 다를 수 있음 (musu-bee vs musu-functions)
cd /home/hugh51/musu-functions
git pull origin main

# 권장: 토큰 켜고 운영 (두 노드 동일 토큰 권장)
# start-worker.sh는 기본적으로 ~/.musu/worker_token 을 자동 로드함
mkdir -p ~/.musu
umask 077
test -s ~/.musu/worker_token || (openssl rand -hex 32 2>/dev/null || python3 - <<'PY'
import secrets; print(secrets.token_hex(32))
PY
) > ~/.musu/worker_token

nohup ./scripts/start-worker.sh >/tmp/musu-worker-9700.log 2>&1 &
sleep 0.5

curl -sf http://127.0.0.1:9700/health
tail -n 80 /tmp/musu-worker-9700.log
ps -ef | (rg -n 'musu_worker|uvicorn|start-worker\\.sh' || grep -E 'musu_worker|uvicorn|start-worker\\.sh')
ss -ltnp | (rg ':9700' || grep ':9700') || true
tailscale ip -4
```

**4060(오케스트레이터)에서**
```bash
curl -sf http://<second-pc_tailscale_ip>:9700/health

MUSU_WORKER_TOKEN=<second-pc에서쓴토큰> \
  python3 /home/hugh51/musu-functions/scripts/musu_remote_process.py \
  --url http://<second-pc_tailscale_ip>:9700 -- echo hello
```

로컬(127.0.0.1)에서는 `/health`가 OK인데도 4060에서 계속 refused면:
- `sudo ufw status` (가능하면)로 9700 차단 여부 확인
- worker가 `MUSU_WORKER_HOST=0.0.0.0`로 바인딩돼 있는지 확인 (기본값은 스크립트에서 0.0.0.0)

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
