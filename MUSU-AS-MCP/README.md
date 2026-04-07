# MUSU-AS-MCP

## 제품 정의

`MUSU-AS-MCP`는 MUSU Desktop을 self-MCP desktop platform으로 다루는 작업 공간이다.

현재 이 디렉터리는 단순 문서 폴더가 아니라 canonical self-MCP implementation workspace로 취급한다.

핵심 정의는 아래 4개다.

1. MUSU Desktop은 자기 스스로 조종 가능해야 한다.
2. 다른 CLI나 IDE가 MUSU MCP를 사용할 수 있어야 한다.
3. MUSU Desktop 자체가 MCP 서버여야 한다.
4. desktop app MCP reference는 Pencil.dev를 참고한다.

짧게 말하면:

> MUSU Desktop을 자기 자신에 대한 MCP 서버로 만들고, 외부 CLI/IDE도 그 surface를 쓰게 한다.

## 범위

현재 이 작업 공간은 아래 주제를 다룬다.

- Layer A: local MCP server health / initialize / tools/list
- Layer B: native UI mirror / actionables / semantic snapshot
- self-MCP session proof
- semantic snapshot timeout root-cause isolation
- MUSU Desktop을 별도 기능군으로 분리한 재현 문서화

## Pencil Reference

reference는 Pencil.dev MCP지만 그대로 복제하는 것은 아니다.

- Pencil은 desktop app이 external consumer와 MCP로 연결되는 shipping reference다.
- MUSU는 거기에 더해 self-control, native UI mirror, native action surface를 가진다.
- 즉 Pencil은 integration reference이고, MUSU는 self-observing desktop MCP로 확장된 형태다.

## 현재 문서

- [VISION.md](/home/hugh51/musu-functions/MUSU-AS-MCP/VISION.md)
- [MCP_ONLY_FAST_LOOP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/MCP_ONLY_FAST_LOOP.md)
- [DESIGNING_FOR_SELF_MCP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/DESIGNING_FOR_SELF_MCP.md)
- [PENCIL_DEV_REFERENCE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_REFERENCE.md)
- [PENCIL_DEV_ALIGNMENT.md](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_ALIGNMENT.md)
- [OPEN_SOURCE_REFERENCE_MAP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/OPEN_SOURCE_REFERENCE_MAP.md)
- [MASTER_PLAN.md](/home/hugh51/musu-functions/MUSU-AS-MCP/MASTER_PLAN.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/CURRENT_STATE.md)
- [ORIGINAL_DESKTOP_BACKPORT_MAP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/ORIGINAL_DESKTOP_BACKPORT_MAP.md)
- [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/MUSU-AS-MCP/TODO_EXECUTION_BOARD.md)
- [plans/README.md](/home/hugh51/musu-functions/MUSU-AS-MCP/plans/README.md)
- [plans/PLAN_00_REPRO_BASELINE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/plans/PLAN_00_REPRO_BASELINE.md)
- [plans/PLAN_04_PENCIL_STYLE_TOOL_DECOMPOSITION.md](/home/hugh51/musu-functions/MUSU-AS-MCP/plans/PLAN_04_PENCIL_STYLE_TOOL_DECOMPOSITION.md)

## MCP-Only Harness

이 작업 공간에는 원본 desktop 전체 빌드 없이 Layer A/B 일부를 빠르게 재현하는 최소 MCP harness가 들어간다.

- entry: [`src/server.mjs`](/home/hugh51/musu-functions/MUSU-AS-MCP/src/server.mjs)
- package: [`package.json`](/home/hugh51/musu-functions/MUSU-AS-MCP/package.json)

실행:

```bash
cd /home/hugh51/musu-functions/MUSU-AS-MCP
python3 ./server.py
```

기본 포트:

- `http://127.0.0.1:8793/mcp/health`
- `http://127.0.0.1:8793/mcp`

운영 원칙:

- 새 surface는 여기서 먼저 만든다.
- 여기서 검증한 뒤 필요한 항목만 원본 desktop에 합친다.

## 현재 요약

2026-04-01 기준 현재 truth는 아래다.

- Layer A는 pass
- Layer B는 대부분 pass
- 남은 핵심 blocker는 `desktop__musu_app_get_semantic_snapshot`
- 최신 진단 결과상 timeout의 직접 원인은 frontend listener가 live runtime에서 등록되지 않는 상태일 가능성이 높다
- 그리고 그 바로 전 단계에서 stale frontend bundle이 실제 원인 후보로 확인됐다
- Pencil reference상 장기 방향은 giant semantic snapshot보다 model-aware tool decomposition 쪽이 더 맞다
- 따라서 full app rebuild 반복보다 `MCP-only fast loop`가 핵심 전략이다

## 운영 원칙

- 구현보다 먼저 현재 truth를 문서에 고정한다.
- 재현 목표는 "한 번 되게 만드는 것"이 아니라 "다음 사람이 다시 따라 할 수 있게 만드는 것"이다.
- 상위 방향은 `MASTER_PLAN.md`, 실제 bounded objective는 `plans/` 아래 문서로 관리한다.
