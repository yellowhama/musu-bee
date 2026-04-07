# Original App Final Evidence Runbook 2026-04-01

## 목적

원본 MUSU 앱에서 `MUSU-WORKS` canonical contract와 연결되는 마지막 시각/실행 증거를 수집하는 절차를 고정한다.

## 확인 목표

- original app에 project-scoped execution anchor가 실제로 보이는가
- agent/runtime/proxy/action 축이 canonical contract와 충돌하지 않는가
- company layer를 얹을 read-first cut이 현실적인가

## 확인 소스

- [`ORIGINAL_APP_RUNTIME_PROOF_2026-04-01.md`](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_RUNTIME_PROOF_2026-04-01.md)
- [`ORIGINAL_APP_BACKPORT_MAP.md`](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_BACKPORT_MAP.md)
- [`FINAL_TOUCH.md`](/home/hugh51/musu-functions/MUSU-WORKS/FINAL_TOUCH.md)

## 확인 항목

### 1. agent runtime anchor

- `agent_id`
- runtime status
- instance port/pid

근거 파일:

- [`agents.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs)

### 2. named proxy anchor

- `agent_id -> dynamic port` 연결
- missing agent 404
- invalid port 503

근거 파일:

- [`proxy.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs)

### 3. MCP dispatch anchor

- tool list 존재
- `tools/call`
- tool call -> event -> work request 흐름

근거 파일:

- [`mcp.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs)

### 4. action/audit anchor

- confirm/nudge/diagnose 계열 endpoint
- run state 변경
- audit append

근거 파일:

- [`actions.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs)

## 기록 형식

- `pass` / `partial` / `fail`
- 충돌 없음 / read model 필요 / invasive core change 필요
- backport risk: `low` / `medium` / `high`

## 원하는 최종 결론

다음 문장이 성립하면 통과다.

> 원본 MUSU는 company plane을 넣기 위해 execution core를 갈아엎을 필요가 없고, company/role/attachment/session read model을 read-first 방식으로 얹는 것이 가능하다.
