# MUSU Computer Tools Bridge Dogfood Proof 2026-04-02

## 실행

### helper status

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/status-helper.sh
```

관측:

- state: `online`
- install state: `startup-folder`
- helper heartbeat 정상

### interop probe

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/probe-interop.sh
```

관측:

- recommended mode: `helper`
- direct exec: 실패
- helper: `online`

해석:

- 현재 환경에서 Windows process action은 direct보다 helper path가 현실적인 표준 운영 경로다.

### browser CDP probe

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/probe-browser-cdp.sh
```

관측:

- status: `unreachable`
- classification: `network-bound-browser`
- recommended next action:
  - Windows browser를 `--remote-debugging-port`로 띄우거나 reachable CDP endpoint를 노출

해석:

- browser 작업의 현재 blocker는 process spawn이 아니라 CDP endpoint 부재다.
- split-host browser boundary를 계속 process-bound 문제로 다루면 안 된다.

## 회사 도그푸딩

`musu_corp` queue에도 현재 작업 항목을 올렸다.

- queue item:
  - `/home/hugh51/musu_corp/work/queues/planning_queue/task-2026-04-02-032048-51971b.json`

즉 이 작업은 문서 정리만이 아니라 실제 company runtime에서도 tracked 된다.

## 이번 턴 결론

1. helper-first Windows action 운영은 실제로 살아 있다.
2. browser boundary는 network-bound endpoint 기준으로 읽는 것이 맞다.
3. 다음 active는 browser/CDP consumer contract와 live validation evidence다.
